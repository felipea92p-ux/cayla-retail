import "server-only";
import { createClient } from "@/lib/supabase/server";
import { explicarFallaLectura, leerResumen, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import { GRUPOS_DEL_RESUMEN, juntarResumen, PARTE_BALANCE, type GrupoDelResumen } from "@/lib/resumen-finanzas-partes";
import { capturarError } from "@/lib/errores";
import { contarPrendasPorRegistrar } from "@/lib/costo-estimado";
import { calcularConfianza, leerHechosConfianza, type Confianza } from "@/lib/finanzas-confianza";
import { aplicarProvision, delMes, faltanSueldosPorFalla, resumenDeProvision } from "@/lib/planilla-provision-reglas";
import { getProvisionPlanilla } from "@/lib/planilla-provision";
import { rangoMes } from "@/lib/gastos-reglas";
import { conIgvDeLasVentasDe } from "@/lib/igv-ventas";
import { hoyLima } from "@/lib/fechas-lima";
import type { FilaProvision } from "@/lib/planilla-provision-reglas";

// Finanzas ▸ Resumen (ADR-0195 F10; contrato en 20260925200000_finanzas_resumen.sql). Solo LEE. Desde el Resumen por bloques (ADR-0661) en tres
// lecturas A LA VEZ de `fn_resumen_finanzas_partes` (`GRUPOS_DEL_RESUMEN`: lo rápido, el mes, el anterior y el presupuesto), para que cada bloque
// de la pantalla se dibuje cuando llega lo suyo; juntas son `fn_resumen_finanzas` al byte (`juntarResumen`). Si una lectura falla, la pantalla lo
// dice (principio 9): nunca muestra ceros como si fueran datos.

export type Lectura<T> = { datos: T; falla: string | null; sueldosSinLeer?: boolean };

/**
 * Lee un grupo del Resumen: `ResumenFinanzas` con sus partes (las de los otros grupos llegan como «la base no mandó esta parte»). Con
 * `conBalance`, el grupo trae además el balance de cada sede a hoy (`balance`: las filas de `fn_balance_por_tienda`), armado con el mismo
 * estado de resultados; `undefined` si la base todavía no lo arma (entonces la página lo pide aparte, como antes).
 */
export type LecturaDelGrupo = Lectura<ResumenFinanzas | null> & { balance?: { corte: string; filas: Record<string, unknown>[] } };
export type LectorDelResumen = (grupo: GrupoDelResumen, opciones?: { conBalance?: boolean }) => Promise<LecturaDelGrupo>;

/** La base todavía no tiene la función por partes (la migración 20261113235000 no está pegada): se lee la entera. */
const sinPorPartes = (error: { code?: string | null; message?: string | null }) =>
  error.code === "PGRST202" || error.code === "42883" || /fn_resumen_finanzas_partes/.test(error.message ?? "");

/**
 * Las tres lecturas del Resumen, con su respaldo: si la base no tiene `fn_resumen_finanzas_partes`, se pide `fn_resumen_finanzas` UNA sola vez y
 * se reparte entre los tres grupos (cada uno toma sus partes al juntarse). Así el orden en que se publican la web y la migración no importa.
 * Cada grupo deja su `ms` en el log `finanzas_resumen_ms` cuando llegan los tres (`anotarTiempos`).
 */
export function lectorDelResumen(pedido: { ubicacionId: string | null; soloEmpresa: boolean }): LectorDelResumen {
  const args = { p_ubicacion_id: pedido.ubicacionId, p_solo_empresa: pedido.soloEmpresa };
  let entera: ReturnType<typeof leerEntera> | null = null;
  async function leerEntera() {
    const supabase = await createClient();
    return supabase.rpc("fn_resumen_finanzas" as never, args as never);
  }
  return async (grupo, opciones = {}) => {
    const supabase = await createClient();
    const partes: string[] = [...GRUPOS_DEL_RESUMEN[grupo], ...(opciones.conBalance ? [PARTE_BALANCE] : [])];
    let { data, error } = await supabase.rpc("fn_resumen_finanzas_partes" as never, { ...args, p_partes: partes } as never);
    // Una base sin 20261114005000 no conoce la parte `balance` (22023): se pide el grupo sin ella y la página pide el balance aparte.
    if (error?.code === "22023" && opciones.conBalance) ({ data, error } = await supabase.rpc("fn_resumen_finanzas_partes" as never, { ...args, p_partes: GRUPOS_DEL_RESUMEN[grupo] } as never));
    if (error && sinPorPartes(error)) ({ data, error } = await (entera ??= leerEntera()));
    if (error) {
      capturarError("finanzas.resumen", error, { grupo });
      return { datos: null, falla: explicarFallaLectura(error, "leer el resumen") };
    }
    return { datos: leerResumen(data), falla: null, balance: balanceDelGrupo(data) };
  };
}

/** La parte `balance` de una respuesta, si vino bien (las filas tal como las devuelve `fn_balance_por_tienda`); si no vino o falló, `undefined`. */
function balanceDelGrupo(data: unknown): LecturaDelGrupo["balance"] {
  const b = (data as { balance?: { corte?: unknown; filas?: unknown } } | null)?.balance;
  if (!b || typeof b.corte !== "string" || !Array.isArray(b.filas)) return undefined;
  return { corte: b.corte.slice(0, 10), filas: b.filas as Record<string, unknown>[] };
}

/**
 * Los tres grupos ya leídos → el `ResumenFinanzas` entero. Si cae solo el del mes o el de los avisos (cada uno tiene su tope de 8 s), lo demás sigue
 * y sus partes dicen «no se pudo leer» (como una parte que falla dentro de la base), nunca un cero. Sin la lectura rápida no hay Resumen.
 */
export function resumenJunto(rapido: Lectura<ResumenFinanzas | null>, mes: Lectura<ResumenFinanzas | null>, avisos: Lectura<ResumenFinanzas | null>): ResumenFinanzas | null {
  if (!rapido.datos) return null;
  const caido = (l: Lectura<ResumenFinanzas | null>): ResumenFinanzas => {
    if (l.datos) return l.datos;
    const falla = { estado: "falla" as const, mensaje: l.falla ?? "No se pudo leer esta parte del Resumen." };
    return { ...rapido.datos!, resultadosMes: falla, rangoMes: null, resultadosAnterior: falla, presupuesto: falla, ms: {} };
  };
  return juntarResumen(rapido.datos, caido(mes), caido(avisos));
}

/**
 * «Hoy te toca» dice cuánto necesitaba vender la tienda que perdió el mes pasado, y eso va con IGV (tarea 19). `fn_resumen_finanzas` no lo trae: se lee aparte y solo si alguna tienda
 * perdió. Si no se puede leer, las filas quedan como están y el aviso dice «sin IGV». Va sobre el grupo de los avisos, que es el que trae el mes anterior.
 */
export async function conIgvDelMesAnterior<L extends { datos: ResumenFinanzas | null }>(lectura: L): Promise<L> {
  const r = lectura.datos;
  if (r?.resultadosAnterior.estado !== "ok" || !r.resultadosAnterior.datos.some((f) => f.unidad === "tienda" && f.resultado < 0)) return lectura;
  const { desde, hasta } = rangoMes(r.mesAnterior);
  const { datos } = await conIgvDeLasVentasDe(desde, hasta, { datos: r.resultadosAnterior.datos, falla: null });
  return { ...lectura, datos: { ...r, resultadosAnterior: { estado: "ok", datos } } };
}

/**
 * Cuánto tardó cada pieza de `fn_resumen_finanzas` en la base (lo mide ella misma, `ms`), en UNA línea de los logs del servidor
 * (2026-11-09, el pico de memoria de Resumen): así se ve con tráfico real qué pieza pesa más, sin pedirle a producción permisos que no da
 * (`track_functions` está apagado). Solo cifras: ni la sede ni la persona. Se busca con `vercel logs --query finanzas_resumen_ms`.
 * Desde ADR-0661 las piezas llegan en tres lecturas a la vez: `total_ms` es lo que tardó la última de las tres, y las piezas son las mismas 13.
 */
export function anotarTiempos(r: ResumenFinanzas, totalMs: number): void {
  console.info(JSON.stringify({ evento: "finanzas_resumen_ms", total_ms: totalMs, todas: r.ver.todas, ...r.ms }));
}

/** Los ms desde que empezó la página (para `anotarTiempos` y `anotarBloques`): se crea al entrar y cada llamada dice cuánto va. */
export function relojDelResumen(): () => number {
  const inicio = Date.now();
  return () => Date.now() - inicio;
}

/**
 * Cuándo pudo dibujarse cada bloque del Resumen (ADR-0661): una línea por bloque, con los ms desde que empezó la página hasta que llegó lo último
 * que ese bloque necesita (`todo`: cuando llegó lo último de la página). Es lo que mide si «lo primero» sale en ~1,5 s y qué bloque llega al final. Solo cifras y el nombre del bloque (ADR-0424:
 * ni la sede, ni la persona, ni un monto). Se busca con `vercel logs --query finanzas_resumen_bloque`. Una lectura que falla no anota su bloque:
 * la falla ya va al aviso de errores.
 */
export function anotarBloques(reloj: () => number, todas: Promise<boolean>, bloques: Record<string, readonly Promise<unknown>[]>): void {
  for (const [bloque, lecturas] of Object.entries(bloques)) {
    Promise.all(lecturas).then(
      async () => {
        const ms = reloj();
        console.info(JSON.stringify({ evento: "finanzas_resumen_bloque", bloque, ms, todas: await todas }));
      },
      () => undefined,
    );
  }
}

/**
 * Suma los sueldos ESTIMADOS (ADR-0453) al Estado de resultados de UN grupo: el del mes (`resultadosMes`) o el del anterior (`resultadosAnterior`).
 * Lo que corresponde pagar hasta hoy según las boletas de Dynamic, de un período que todavía no pagó. Fuera del libro (la base sigue igual) y marcado
 * en cada fila. Una sola lectura cubre los dos meses (pedida a la vez que el resumen: `leida`); el período que TERMINA en un mes es la planilla de ese
 * mes (D-35). Sin estimación (Dynamic no la ve esta cuenta, no abrió el período, o la lectura falló), el grupo queda como la base lo dijo. «Sin leer»
 * solo lo dice el mes, como antes de partir la lectura (con el mes caído, tampoco: `faltanSueldosPorFalla` de nada es falso).
 */
export async function conSueldosEstimados<L extends Lectura<ResumenFinanzas | null>>(
  lectura: L,
  parte: "resultadosMes" | "resultadosAnterior",
  ubicacionId: string | null,
  leida: { mes: string; filas: FilaProvision[]; sinLeer: boolean },
): Promise<L> {
  const r = lectura.datos;
  const er = r?.[parte];
  if (!r || er?.estado !== "ok") return { ...lectura, sueldosSinLeer: false };
  const { filas: prov, sinLeer: caida } = leida.mes === r.mes ? leida : await getProvisionPlanilla(rangoMes(r.mesAnterior).desde, rangoMes(r.mes).hasta, ubicacionId);
  const sueldosSinLeer = parte === "resultadosMes" && faltanSueldosPorFalla(caida, er.datos);
  if (!prov.length) return { ...lectura, sueldosSinLeer };
  const mes = parte === "resultadosMes" ? r.mes : r.mesAnterior;
  return { ...lectura, datos: { ...r, [parte]: { estado: "ok", datos: aplicarProvision(er.datos, delMes(prov, mes)) } }, falla: null, sueldosSinLeer };
}

// El medidor de confianza (ADR-0417): los hechos salen de `fn_finanzas_confianza` (20261015235000) y la calificación la pone
// `lib/finanzas-confianza.ts`. Si la base no responde o la cuenta no ve el diario, la pantalla sigue sin el medidor: nunca
// muestra un 0 % como si fuera una medida.
export async function getConfianzaFinanzas(pedido: { ubicacionId: string | null }, mes?: string): Promise<Lectura<Confianza | null>> {
  const supabase = await createClient();
  // `mes` («2026-09»): la confianza del mes que se mira en la barra del telar; sin él, la base usa el mes en curso.
  const { data, error } = await supabase.rpc("fn_finanzas_confianza" as never, { p_mes: mes ? `${mes}-01` : null, p_ubicacion_id: pedido.ubicacionId } as never);
  if (error) {
    capturarError("finanzas.resumen.confianza", error);
    return { datos: null, falla: explicarFallaLectura(error, "medir qué tan seguro es este número") };
  }
  const hechos = leerHechosConfianza(data);
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(hechos.mes);
  const { desde, hasta } = rangoMes((fechaValida ? hechos.mes : `${hoyLima().slice(0, 7)}-01`).slice(0, 7));
  // Con la planilla del mes sin pagar, la confianza cuenta los sueldos estimados con las boletas de Dynamic (ADR-0453).
  const pideSueldos = hechos.planilla.visible && !hechos.planilla.mesPagada && fechaValida;
  // Cuántas siguen por registrar, para no prometer un registro que ya no se puede hacer (tarea 75).
  const hayEstimado = hechos.costo.unidadesEstimadas > 0 || hechos.costo.unidadesSinCosto > 0;
  const [sueldos, pendientes] = await Promise.all([
    pideSueldos ? getProvisionPlanilla(desde, hasta, pedido.ubicacionId) : Promise.resolve(null),
    hayEstimado ? contarPrendasPorRegistrar(desde, hasta, pedido.ubicacionId) : Promise.resolve(null),
  ]);
  return {
    datos: calcularConfianza({
      ...hechos,
      costo: { ...hechos.costo, ...(hayEstimado ? { pendientes } : {}) },
      planilla: sueldos ? { ...hechos.planilla, provision: resumenDeProvision(sueldos.filas), sinLeer: sueldos.sinLeer } : hechos.planilla,
    }),
    falla: null,
  };
}
