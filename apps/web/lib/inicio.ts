import { createClient } from "@/lib/supabase/server";
import { getCajaAbierta, getVentasMismaHoraSemanaAnterior } from "@/lib/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getParametrosCaja } from "@/lib/configuracion";
import { hoyLima } from "@/lib/etiqueta-vigencia";
import { fuenteVentasDeHoy, nombreDiaLima } from "@/lib/inicio-reglas";
import { armarEquipo, resumirApartados, type FuentesAvisos, type MiembroEquipo } from "@/lib/inicio-avisos";
import { armarMiMeta, rangoDeMiLectura, type MiMeta } from "@/lib/mi-meta-reglas";
import { getApartadosAbiertos } from "@/lib/apartados";
import { getDeudaPorVencimiento } from "@/lib/compras-indicadores";
import type { ClaveModulo } from "@/lib/modulos";
import { getPedidosPorAtender } from "@/lib/pedidos-entre-sedes";
import { ahoraSinRespuesta, pedidosSinRespuesta, textoSinRespuesta } from "@/lib/pedidos-por-atender-reglas";

// Lecturas del bloque «Hoy» del Inicio. La líder reutiliza las MISMAS fuentes que Caja (`fn_ventas_del_dia`,
// `getVentasMismaHoraSemanaAnterior`, `fn_parametros_caja` — antes `ubicaciones.meta_venta_diaria`) para que las dos pantallas nunca
// discrepen en qué es «hoy» (docs/datos/11-KPIS.md, «Qué lo rompe» a: dos fuentes que nada obliga a cuadrar). Una integrante
// lee `fn_mis_ventas_del_dia`: solo lo que ella atendió, no el día de toda la tienda (`fuenteVentasDeHoy`).
//
// Cada pieza falla POR SEPARADO y devuelve null: «Hoy» es un dato secundario del que nadie decide plata
// mirando un solo número, pero un cero mudo sí engañaría — por eso la pantalla distingue «0 ventas» de
// «no se pudo leer». Sin `exigir`: si una pieza cae, las demás se muestran igual.

export type HoyDeLaSede = {
  /** null = no se pudo leer (no es lo mismo que «cerrada»). */
  cajaAbierta: boolean | null;
  /** El `total` de cada venta del día: las de TODA la sede para la líder, solo las que atendió ella para una integrante
   *  (`fuenteVentasDeHoy`). null = falló. */
  totales: number[] | null;
  /** Solo la líder ve el comparativo y la meta: son cifras de toda la sede. null = no aplica o falló. */
  semanaAnterior: number | null;
  metaVentaDiaria: number | null;
  /** «viernes»: el día de hoy en Lima, para decir «vs. viernes pasado». Se calcula acá (no en el componente) porque
   *  `Date.now()` es impuro y un componente no debe llamarlo. */
  nombreDia: string;
};

export async function tolerarLectura<T>(que: string, leer: () => Promise<T>): Promise<T | null> {
  try {
    return await leer();
  } catch (e) {
    console.error(`Inicio · no se pudo leer ${que}:`, e);
    return null;
  }
}

export async function getHoyDeLaSede(ubicacionId: string, esLider: boolean): Promise<HoyDeLaSede> {
  const supabase = await createClient();
  const [caja, totales, semanaAnterior, ubicaciones, parametros] = await Promise.all([
    // `getCajaAbierta` devuelve null cuando NO hay caja abierta: no es un fallo. Un fallo real (lanza) se vuelve null
    // acá, y por eso se separan: abierta = true, cerrada = false, no se pudo leer = null.
    getCajaAbierta(ubicacionId).then(
      (caja): boolean | null => caja !== null,
      (e): boolean | null => {
        console.error("Inicio · no se pudo leer la caja:", e);
        return null;
      }
    ),
    tolerarLectura("las ventas de hoy", async () => {
      // Sin caer al día de la tienda si la función personal no existe todavía: el número de otra persona sería peor que ninguno.
      const res =
        fuenteVentasDeHoy(esLider) === "fn_ventas_del_dia"
          ? await supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: ubicacionId })
          : await supabase.rpc("fn_mis_ventas_del_dia");
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []).map((v) => Number(v.total));
    }),
    esLider ? tolerarLectura("las ventas de la semana pasada", () => getVentasMismaHoraSemanaAnterior(ubicacionId)) : Promise.resolve(null),
    esLider ? tolerarLectura("la meta de la sede", () => getUbicaciones()) : Promise.resolve(null),
    // La meta de hoy con las campañas (ADR-0195 F1): la misma regla que Caja. `null` = base sin fn_parametros_caja.
    esLider ? getParametrosCaja(ubicacionId, hoyLima()) : Promise.resolve(null),
  ]);

  return {
    cajaAbierta: caja,
    totales,
    semanaAnterior,
    metaVentaDiaria: parametros ? parametros.meta : (ubicaciones?.find((u) => u.id === ubicacionId)?.metaVentaDiaria ?? null),
    nombreDia: nombreDiaLima(Date.now()),
  };
}

/**
 * Mi meta (ADR-0325): SU meta de hoy y del mes y SUS ventas de cada día, para el Inicio de una integrante. Todo por funciones de
 * «solo lo mío» (`fn_mi_meta`, `fn_mis_ventas_por_dia`): nunca lo de otra persona. `null` = no hay nada que mostrar: la tienda no
 * tiene meta cargada, ella no tiene horas ni asistencia, la base todavía no tiene las funciones o no respondió; en cualquiera de esos
 * casos el Inicio queda como estaba, sin «0 %» ni cifras inventadas (principio 9: una lectura secundaria no tumba la pantalla).
 */
export async function getMiMeta(): Promise<MiMeta | null> {
  return tolerarLectura("su meta", async () => {
    const supabase = await createClient();
    const hoy = hoyLima();
    const { desde, hasta } = rangoDeMiLectura(hoy);
    const [meta, ventas] = await Promise.all([
      supabase.rpc("fn_mi_meta"),
      supabase.rpc("fn_mis_ventas_por_dia", { p_desde: desde, p_hasta: hasta }),
    ]);
    if (meta.error) throw new Error(meta.error.message);
    if (ventas.error) throw new Error(ventas.error.message);
    return armarMiMeta(hoy, meta.data ?? [], ventas.data ?? []);
  });
}

// ── «Te toca» y «Equipo de hoy» (spike docs/maquetas/inicio-movil-roles-2026-09/, Felipe 2026-09-26) ─────────────────
// Cada cola se lee SOLO si quien mira ve su módulo (ADR-0161): lo que no le toca viene `undefined` y el aviso no
// existe. Cada una falla sola y vuelve `null` («no se pudo leer»), nunca un 0. Las reglas viven en `inicio-avisos.ts`.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Cuenta filas sin traerlas. `null` si falla. */
export async function contar(que: string, consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number | null> {
  return tolerarLectura(que, async () => {
    const { count, error } = await consulta;
    if (error) throw new Error(error.message);
    return count ?? 0;
  });
}

export async function getFuentesAvisos(
  cuenta: { ubicacionId: string; esLider: boolean; esTerminal: boolean; ve: (m: ClaveModulo) => boolean; pagaCompras: boolean },
  base: Omit<FuentesAvisos, "apartados" | "devoluciones" | "pedidos" | "conteoAbierto" | "porPagar" | "pedidosSinRespuesta">
): Promise<FuentesAvisos> {
  const supabase: Supabase = await createClient();
  const { ubicacionId, ve } = cuenta;
  const [apartados, devoluciones, pedidos, conteoAbierto, porPagar, pedidosSinRespuestaLeidos] = await Promise.all([
    ve("apartados")
      ? tolerarLectura("los apartados", async () => resumirApartados(await getApartadosAbiertos(ubicacionId, { esTerminal: cuenta.esTerminal }), hoyLima()))
      : undefined,
    ve("devoluciones")
      ? contar("las devoluciones pendientes", supabase.from("devoluciones").select("id", { count: "exact", head: true }).eq("ubicacion_id", ubicacionId).eq("estado", "pendiente"))
      : undefined,
    // Solo «buscó y no había»: «se la probó y no la llevó» (misma tabla, ADR-0288 D-6) es demanda, no un pedido que alguien espera.
    ve("vender")
      ? contar("los pedidos no atendidos", supabase.from("pedidos_no_atendidos").select("id", { count: "exact", head: true }).eq("ubicacion_id", ubicacionId).eq("resuelto", false).eq("motivo", "no_habia_talla"))
      : undefined,
    ve("conteos")
      ? contar("el conteo abierto", supabase.from("conteos").select("id", { count: "exact", head: true }).eq("ubicacion_id", ubicacionId).eq("estado", "abierto")).then((n) => (n === null ? null : n > 0))
      : undefined,
    ve("por_pagar") && cuenta.pagaCompras
      ? tolerarLectura("lo que vence por pagar", async () => {
          const tramos = await getDeudaPorVencimiento();
          const de = (t: string) => tramos.find((x) => x.tramo === t) ?? { comprobantes: 0, monto: 0 };
          return { vencidas: de("vencida").comprobantes, montoVencido: de("vencida").monto, semana: de("0_7").comprobantes, montoSemana: de("0_7").monto };
        })
      : undefined,
    // ADR-0328 act. 17: a las 48 h sin respuesta, aviso a los líderes de las DOS sedes (la que pidió y la que debe enviar).
    cuenta.esLider
      ? getPedidosPorAtender(ubicacionId).then((filas) => {
          if (filas === null) return null;
          const ahoraIso = new Date().toISOString();
          const s = pedidosSinRespuesta(filas, ahoraIso);
          return { tePiden: s.tePiden.length, pediste: s.pediste.length, detalle: textoSinRespuesta(s, ahoraIso), ahora: ahoraSinRespuesta(s) };
        })
      : undefined,
  ]);
  return { ...base, apartados, devoluciones, pedidos, conteoAbierto, porPagar, pedidosSinRespuesta: pedidosSinRespuestaLeidos };
}

/** Quién está hoy en la sede (asistencia de Dynamic) y, si la cuenta ve la actividad (ADR-0207), qué hizo cada una. */
export async function getEquipoDeHoy(ubicacionId: string, veActividad: boolean): Promise<MiembroEquipo[] | null> {
  const supabase: Supabase = await createClient();
  const [turno, actividad] = await Promise.all([
    tolerarLectura("quién está de turno", async () => {
      const res = await supabase.rpc("fn_asesoras_de_turno", { p_ubicacion_id: ubicacionId });
      if (res.error) throw new Error(res.error.message);
      return res.data ?? [];
    }),
    veActividad
      ? tolerarLectura("la actividad de hoy", async () => {
          // Desde la medianoche de Lima (UTC−5 fijo, como `nombreDiaLima`).
          const desde = new Date(`${hoyLima()}T05:00:00Z`).toISOString();
          const res = await supabase.rpc("fn_actividad" as never, { p_ubicacion_id: ubicacionId, p_desde: desde, p_limite: 200 } as never);
          if ((res as { error: { message: string } | null }).error) throw new Error((res as { error: { message: string } }).error.message);
          return ((res as { data: unknown }).data ?? []) as Parameters<typeof armarEquipo>[1] & object;
        })
      : Promise.resolve(null),
  ]);
  if (turno === null && actividad === null) return null;
  return armarEquipo(turno ?? [], actividad);
}
