import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DatosAnalisis, PreparacionAnalisis, SedeAnalisis } from "@/lib/analisis-tipos";
import { armarPrendas } from "@/lib/analisis-armado";
import { diasDeVentas, liquidarDesdeValido, sedeDeAnalisis } from "@/lib/analisis-reglas";
import { FALLA_PISO } from "@/lib/analisis-piso";
import { getPrendasPorSede } from "@/lib/analisis-sede";
import { getPorLlegar } from "@/lib/analisis-por-llegar";
import { getLiquidarDesde } from "@/lib/analisis-liquidar";
import { getRindePorCategoria } from "@/lib/analisis-rinde";
import { getConteosResumen } from "@/lib/conteos";
import { leerPreparacion, preparacionDeSede, RPC_PREPARACION } from "@/lib/motor-demanda-reglas";
import { getPedidosNoAtendidos } from "@/lib/pedidos-no-atendidos";
import { esPedidoDeTalla } from "@/lib/se-probo-reglas";
import { getUbicaciones, type Ubicacion } from "@/lib/ubicaciones";

// Análisis v4 (ADR-0357): todo lo que la pantalla lee, una vez por visita, desde el servidor. Cada parte que falla se dice en
// `fallas` y deja su sección callada (principio 9): nunca «sin ventas» por un error.
//
// La encargada y el líder ven lo mismo (decisión 3): el dinero y el costo por prenda. Todo es de la tienda elegida arriba; las
// otras tiendas se leen solo para lo que se hace con una prenda de la mía («AQP tiene 3», «Mándalas a Arequipa», «Dónde hay»).
// Lo que no se puede leer —una migración que no está en producción— vuelve vacío con su falla.

/**
 * Solo en desarrollo: ver Análisis completo con los datos locales aunque la tienda no cumpla las tres condiciones de ADR-0346
 * (`ANALISIS_SIN_CANDADO=1` en `.env.local`). En producción no existe: allí manda el motor.
 */
const sinCandado = (): boolean => process.env.NODE_ENV !== "production" && process.env.ANALISIS_SIN_CANDADO === "1";

async function leerPreparacionDeLaRed(): Promise<{ filas: PreparacionAnalisis[]; falla: string | null }> {
  const supabase = await createClient();
  // Sin sede: todas las tiendas que la cuenta puede leer (con 20261006213000, todas para quien analiza).
  const { data, error } = await supabase.rpc(RPC_PREPARACION as never, {} as never);
  if (error) {
    console.error(`${RPC_PREPARACION}: ${error.message}`);
    return { filas: [], falla: "No se pudo leer si el sistema ya puede recomendar en cada tienda" };
  }
  return { filas: leerPreparacion(data).map((f) => ({ ...preparacionDeSede(f), dias: f.dias, hoy: f.hoy, primeraVenta: f.primeraVenta })), falla: null };
}

/** Hoy en Lima, si la base no lo dijo (YYYY-MM-DD). */
const hoyEnLima = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

export async function getDatosAnalisis(activa: Ubicacion): Promise<DatosAnalisis> {
  const tiendas = (await getUbicaciones()).filter((u) => u.tipo === "tienda" && u.activo);
  const ordenadas = [activa, ...tiendas.filter((u) => u.id !== activa.id)];
  const sedes: SedeAnalisis[] = ordenadas.map(sedeDeAnalisis);
  const ids = sedes.map((s) => s.id);

  const [motor, lectura, llegan, liquidar, rinde, conteos, pedidos] = await Promise.all([
    leerPreparacionDeLaRed(),
    getPrendasPorSede(ids),
    getPorLlegar(activa.id),
    getLiquidarDesde(),
    getRindePorCategoria(activa.id),
    getConteosResumen(activa.id, 5).catch((e: unknown) => {
      console.error(`conteos de Análisis: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
    getPedidosNoAtendidos(activa.id).catch((e: unknown) => {
      console.error(`pedidos no atendidos de Análisis: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
  ]);

  const liquidarDesde = liquidarDesdeValido(liquidar.dias);
  const prepDe = (id: string) => motor.filas.find((f) => f.ubicacionId === id) ?? null;
  const hablaSede = (id: string) => sinCandado() || prepDe(id)?.puedeHablar === true;

  const filasDe = (id: string) => lectura.porSede[id] ?? [];
  const otrasDe = (id: string) => sedes.filter((s) => s.id !== id).map((sede) => ({ sede, filas: filasDe(sede.id) }));
  const hoy = motor.filas[0]?.hoy ?? hoyEnLima();
  // El ritmo de todo Análisis: lo vendido entre los días de ventas que mi tienda tiene en el ERP, hasta 30 (cada prenda lo lleva).
  const ventana = diasDeVentas(prepDe(activa.id)?.primeraVenta, hoy);
  const prendas = armarPrendas(filasDe(activa.id), otrasDe(activa.id), llegan.porVariante).map((p) => ({ ...p, diasDeVentas: ventana }));

  // Si mi tienda respondió pero sin decir cuándo salió al piso cada prenda (la base todavía no tiene 20261007120000), se dice una
  // vez; si no respondió, ya lo dice la falla de la lectura.
  const sabePiso = lectura.sabePiso[activa.id] === true;
  const fallaPiso = lectura.sabePiso[activa.id] === false ? FALLA_PISO : null;

  // El último conteo cerrado de la tienda: cuántas prendas contó y en cuántas el sistema coincidió.
  const ultimoConteo = conteos?.find((c) => c.estado === "cerrado" && c.lineas > 0) ?? null;

  return {
    hoy,
    sede: sedes[0]!,
    sedes,
    preparacion: motor.filas,
    puedeHablar: hablaSede(activa.id),
    prendas,
    diasDeVentas: ventana,
    sabePiso,
    liquidarDesde,
    rebajaDe100: lectura.rebajaDe100[activa.id] ?? null,
    rinde: rinde.rinde,
    conteo: ultimoConteo ? { contadas: ultimoConteo.lineas, coinciden: Math.max(0, ultimoConteo.lineas - ultimoConteo.lineasConDiferencia) } : null,
    noHabia: (pedidos ?? [])
      .filter((p) => !p.resuelto && esPedidoDeTalla(p.motivo))
      .map((p) => ({
        que: [p.productoReferencia ?? p.descripcionLibre ?? "Prenda sin nombre", p.talla].filter(Boolean).join(" · "),
        dia: p.creadoEn.slice(0, 10),
      })),
    fallas: [motor.falla, lectura.falla, fallaPiso, llegan.falla, liquidar.falla, rinde.falla, conteos === null ? "No se pudo leer el último conteo" : null, pedidos === null ? "No se pudo leer «Te pidieron y no había»" : null].filter(
      (f): f is string => f !== null,
    ),
  };
}
