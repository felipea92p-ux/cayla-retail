// Observatorio, el Inicio de las cuentas Admin (ADR-0322): las lecturas del servidor.
//
// PROMETE: todo lo que la pantalla necesita, cada bloque leído por separado. Si uno falla vuelve `null` y la pantalla dice
// «no se pudo leer», nunca 0 (principio 9). Lo nuevo sale de `fn_observatorio` y `fn_observatorio_tienda` (migración
// 20261004010000); los avisos, el Taller, el stock y los traslados, de las lecturas que ya usan esas pantallas.
// ASUME: quien llama ya comprobó que la cuenta es Admin (la página y las rutas de API); la base lo vuelve a preguntar.

import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getAperturasPorRevisar } from "@/lib/caja";
import { getPorRegularizar } from "@/lib/por-regularizar";
import { getTrasladosEnCurso } from "@/lib/traslados";
import { getApartadosAbiertos } from "@/lib/apartados";
import { getPorPagarTramos } from "@/lib/compras-indicadores";
import { getCoberturaDeFotos } from "@/lib/inicio-almacen";
import { contarComprobantesAtascados } from "@/lib/comprobantes";
import { getOrdenesProduccion, getTaller } from "@/lib/produccion";
import { etapasDe, resumenTablero } from "@/lib/produccion-reglas";
import { getFilasRecientesDeSede } from "@/lib/resumen-inventario";
import { calcularCobertura, velocidadDeFila } from "@/lib/resumen-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { siglaSede } from "@/lib/inicio-almacen-reglas";
import {
  diasDesde,
  nivelPorCuenta,
  parsearObservatorio,
  parsearTienda,
  porAgotarse,
  sumarDias,
  type AvisoObs,
  type DatosObservatorio,
  type DatosTienda,
  type RutaObs,
  type TallerObs,
  type TiendaObs,
} from "@/lib/observatorio-reglas";

async function tolerar<T>(que: string, leer: () => Promise<T>): Promise<T | null> {
  try {
    return await leer();
  } catch (e) {
    console.error(`Observatorio · no se pudo leer ${que}:`, e);
    return null;
  }
}

/** Lo de toda CAYLA: ventas por tienda y día (60 días), las de hoy con su minuto y las del mismo día de la semana pasada. */
export async function getDatosObservatorio(): Promise<DatosObservatorio | null> {
  return tolerar("las ventas de las tiendas", async () => {
    const supabase = await createClient();
    // `fn_observatorio` todavía no está en los tipos generados (se regeneran al pegarla en producción).
    const res = await supabase.rpc("fn_observatorio" as never, { p_dias: 60 } as never);
    return parsearObservatorio(exigir(res as never, "el observatorio"));
  });
}

function rutasDe(traslados: Awaited<ReturnType<typeof getTrasladosEnCurso>>, hoy: string): RutaObs[] {
  const vistos = new Set<string>();
  const rutas: RutaObs[] = [];
  for (const t of traslados) {
    if (vistos.has(t.id)) continue;
    vistos.add(t.id);
    const enCamino = t.estado === "en_transito";
    const llegaHoy = t.fechaEstimadaLlegada?.slice(0, 10) === hoy;
    rutas.push({
      origen: siglaSede(t.ubicacionOrigenNombre),
      destino: siglaSede(t.ubicacionDestinoNombre),
      unidades: t.unidadesEnviadas,
      enCamino,
      texto: `${t.unidadesEnviadas} ${t.unidadesEnviadas === 1 ? "prenda" : "prendas"} · ${enCamino ? (llegaHoy ? "llega hoy" : "en camino") : "llegó con diferencia"}`,
    });
  }
  return rutas;
}

/** «Por revisar»: los avisos de toda la empresa con su reparto por tienda y cuánto lleva esperando el más antiguo. */
export async function getAvisosObservatorio(tiendas: readonly TiendaObs[]): Promise<AvisoObs[]> {
  const supabase = await createClient();
  const hoy = hoyLima();
  const porNombre = new Map(tiendas.map((t) => [t.nombre, t.id]));
  const ahora = new Date();

  const [aperturas, regularizar, traslados, apartados, tramos, fotos, sunat, devoluciones] = await Promise.all([
    getAperturasPorRevisar(),
    tolerar("las prendas por regularizar", async () => (await getPorRegularizar(null)).filter((f) => f.estado === "pendiente")),
    tolerar("los traslados", async () => (await Promise.all(tiendas.map((t) => getTrasladosEnCurso(t.id)))).flat()),
    tolerar("los apartados", async () =>
      (await Promise.all(tiendas.map(async (t) => (await getApartadosAbiertos(t.id)).map((a) => ({ ...a, tienda: t }))))).flat()
    ),
    tolerar("lo que vence por pagar", () => getPorPagarTramos()),
    getCoberturaDeFotos(),
    contarComprobantesAtascados(),
    tolerar("las devoluciones pendientes", async () => {
      const { data, error } = await supabase.from("devoluciones").select("ubicacion_id").eq("estado", "pendiente");
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  ]);

  const contarPor = (ids: readonly string[]) => {
    const r: Record<string, number> = {};
    for (const id of ids) r[id] = (r[id] ?? 0) + 1;
    return r;
  };
  const avisos: AvisoObs[] = [];

  {
    const filas = aperturas ?? [];
    const n = aperturas === null ? null : filas.length;
    avisos.push({
      clave: "aperturas",
      nivel: nivelPorCuenta(n, "urg"),
      n,
      icono: "dolar",
      titulo: "Aperturas con diferencia",
      corto: "aperturas",
      porTienda: aperturas === null ? null : contarPor(filas.map((a) => porNombre.get(a.ubicacionNombre) ?? a.ubicacionNombre)),
      edad: filas.length ? Math.max(...filas.map((a) => diasDesde(a.abiertaEn, ahora))) : null,
      href: "/caja/historial",
      detalle: filas.length
        ? {
            tipo: "diferencias",
            filas: filas.slice(0, 8).map((a) => ({
              sede: siglaSede(a.ubicacionNombre),
              dia: new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: "America/Lima" }).format(new Date(a.abiertaEn)).replace(".", ""),
              diferencia: a.montoApertura - a.esperado,
            })),
          }
        : null,
    });
  }
  {
    const filas = regularizar ?? [];
    const n = regularizar === null ? null : filas.length;
    const porTienda = regularizar === null ? null : contarPor(filas.map((f) => f.ubicacionId));
    avisos.push({
      clave: "regularizar",
      nivel: nivelPorCuenta(n, "urg"),
      n,
      icono: "etiqueta",
      titulo: "Prendas por regularizar",
      corto: "por regularizar",
      porTienda,
      edad: filas.length ? Math.max(...filas.map((f) => diasDesde(f.vendidoEn, ahora))) : null,
      href: "/recibir?vista=por-regularizar",
      detalle: porTienda && filas.length
        ? {
            tipo: "porSede",
            filas: tiendas.map((t) => ({ sede: t.sigla, n: porTienda[t.id] ?? 0 })),
            nota: `La más antigua: ${Math.max(...filas.map((f) => diasDesde(f.vendidoEn, ahora)))} días`,
          }
        : null,
    });
  }
  {
    const rutas = traslados === null ? null : rutasDe(traslados, hoy);
    const n = rutas === null ? null : rutas.length;
    const porTienda: Record<string, number> | null = traslados === null ? null : {};
    if (porTienda && traslados) {
      const vistos = new Set<string>();
      for (const t of traslados) {
        if (vistos.has(t.id)) continue;
        vistos.add(t.id);
        for (const id of [t.ubicacionOrigenId, t.ubicacionDestinoId]) if (tiendas.some((x) => x.id === id)) porTienda[id] = (porTienda[id] ?? 0) + 1;
      }
    }
    avisos.push({
      clave: "traslados",
      nivel: nivelPorCuenta(n, "hoy"),
      n,
      icono: "flecha",
      titulo: "Traslados",
      corto: "traslados",
      porTienda,
      edad: traslados && traslados.length ? Math.max(...traslados.map((t) => diasDesde(t.creadoEn, ahora))) : null,
      href: "/inventario/traslados",
      detalle: rutas && rutas.length ? { tipo: "rutas", rutas } : null,
    });
  }
  {
    // Los que vencen hoy o mañana (o ya vencieron): los que piden una decisión.
    const manana = sumarDias(hoy, 1);
    const filas = (apartados ?? []).filter((a) => a.venceEl <= manana);
    const n = apartados === null ? null : filas.length;
    avisos.push({
      clave: "apartados",
      nivel: nivelPorCuenta(n, "hoy"),
      n,
      icono: "marca",
      titulo: filas.length === 1 ? "Apartado por vencer" : "Apartados por vencer",
      corto: filas.length === 1 ? "apartado" : "apartados",
      porTienda: apartados === null ? null : contarPor(filas.map((a) => a.tienda.id)),
      edad: filas.length ? Math.max(...filas.map((a) => diasDesde(a.creadoEn, ahora))) : null,
      href: "/vender/apartados",
      detalle: filas.length
        ? {
            tipo: "lista",
            filas: filas.slice(0, 6).map((a) => ({
              titulo: [a.referencia, a.color, a.talla].filter(Boolean).join(" · "),
              detalle: `${a.clienta} · ${a.tienda.sigla}`,
              chip: a.venceEl < hoy ? "Vencido" : a.venceEl === hoy ? "Vence hoy" : "Vence mañana",
            })),
          }
        : null,
    });
  }
  {
    const n = tramos === null ? null : tramos.vencidas.comprobantes + tramos.semana.comprobantes;
    avisos.push({
      clave: "facturas",
      nivel: tramos && tramos.vencidas.comprobantes > 0 ? "urg" : nivelPorCuenta(n, "semana"),
      n,
      icono: "doc",
      titulo: tramos && tramos.vencidas.comprobantes > 0 ? "Facturas vencidas o por vencer" : "Facturas por vencer",
      corto: "facturas",
      porTienda: null,
      edad: tramos && tramos.vencidas.comprobantes > 0 ? 7 : n ? 3 : null,
      href: "/compras/por-pagar",
      detalle: tramos && n
        ? { tipo: "tramos", vencidas: { n: tramos.vencidas.comprobantes, monto: tramos.vencidas.saldo }, semana: { n: tramos.semana.comprobantes, monto: tramos.semana.saldo } }
        : null,
    });
  }
  {
    const n = fotos === null ? null : Math.max(0, fotos.activos - fotos.conFoto);
    avisos.push({
      clave: "fotos",
      nivel: nivelPorCuenta(n, "semana"),
      n,
      icono: "camara",
      titulo: "Fotos que faltan",
      corto: "fotos",
      porTienda: null,
      edad: n ? 4 : null,
      href: "/productos",
      detalle: null,
    });
  }
  avisos.push({
    clave: "sunat",
    nivel: nivelPorCuenta(sunat, "urg"),
    n: sunat,
    icono: "sunat",
    titulo: sunat ? "Comprobantes sin llegar a SUNAT" : "SUNAT al día",
    corto: "comprobantes",
    porTienda: null,
    edad: sunat ? 1 : null,
    href: "/vender/comprobantes/por-reintentar",
    detalle: null,
  });
  {
    const n = devoluciones === null ? null : devoluciones.length;
    avisos.push({
      clave: "devoluciones",
      nivel: nivelPorCuenta(n, "hoy"),
      n,
      icono: "cambio",
      titulo: n ? "Devoluciones por resolver" : "Devoluciones al día",
      corto: "devoluciones",
      porTienda: devoluciones === null ? null : contarPor(devoluciones.map((d) => String(d.ubicacion_id))),
      edad: n ? 1 : null,
      href: "/devoluciones",
      detalle: null,
    });
  }
  return avisos;
}

/** El Taller: órdenes en curso, atrasadas, prendas terminadas por ventana y el avance de lo que está en curso. */
export async function getTallerObservatorio(): Promise<TallerObs | null> {
  return tolerar("el Taller", async () => {
    const taller = await getTaller();
    if (!taller) return null;
    const ordenes = await getOrdenesProduccion(taller.id, { conCostos: false });
    const hoy = hoyLima();
    const r = resumenTablero(ordenes, hoy);
    const enCurso = ordenes.filter((o) => o.estado === "en_proceso" && !o.esMuestra);
    const terminadasDesde = (desde: string) =>
      ordenes.filter((o) => o.inventariadoEn && o.inventariadoEn.slice(0, 10) >= desde).reduce((a, o) => a + (o.cantidadBuenas ?? 0), 0);
    const avances = enCurso.map((o) => {
      const etapas = etapasDe(o.esMuestra);
      return etapas.filter((e) => o.etapas[e.clave] === "hecho").length / etapas.length;
    });
    return {
      enCurso: r.enCurso,
      atrasadas: r.vencidas,
      terminadas: { hoy: terminadasDesde(hoy), d7: terminadasDesde(sumarDias(hoy, -6)), d30: terminadasDesde(sumarDias(hoy, -29)) },
      avance: avances.length ? avances.reduce((a, b) => a + b, 0) / avances.length : null,
    };
  });
}

/** El panel de una tienda: lo nuevo (categorías, prendas, equipo, horas pico, quietas) y lo que ya existía (lo que se va a
 *  agotar, con el ritmo de Existencias; sus traslados). */
export async function getDatosTienda(ubicacionId: string): Promise<DatosTienda | null> {
  const [base, agotar, traslados] = await Promise.all([
    tolerar("el panel de la tienda", async () => {
      const supabase = await createClient();
      const res = await supabase.rpc("fn_observatorio_tienda" as never, { p_ubicacion_id: ubicacionId } as never);
      return parsearTienda(exigir(res as never, "el panel de la tienda"));
    }),
    tolerar("lo que se va a agotar", async () => {
      const filas = await getFilasRecientesDeSede(ubicacionId);
      return porAgotarse(
        filas.map((f) => {
          const c = calcularCobertura(f.utilizable, velocidadDeFila(f));
          return { referencia: f.referencia, color: f.color, talla: f.talla, utilizable: f.utilizable, dias: c.tipo === "medida" ? c.dias : null };
        })
      );
    }),
    tolerar("los traslados de la tienda", async () => rutasDe(await getTrasladosEnCurso(ubicacionId), hoyLima())),
  ]);
  if (!base) return null;
  return { ...base, agotar, traslados };
}
