import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { clavesCerradas, leerCampana, leerFilaER, leerPeriodoMes, type CampanaFila, type FilaER } from "@/lib/resultados-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { aplicarProvision, faltanSueldosPorFalla, hastaDeLaProvision, sueldosAEstaFecha } from "@/lib/planilla-provision-reglas";
import { getProvisionPlanilla } from "@/lib/planilla-provision";
import type { FaltaDelMes } from "@/lib/equilibrio-mes-reglas";

// Finanzas ▸ Reportes (ADR-0195 F5; contrato en 20260925130000_finanzas_diario_y_estado_de_resultados.sql). Solo LEE: toda
// la plata se calcula en Postgres, sobre el diario `fn_asientos`, y la base ya filtra por cuenta (el líder, todo y el
// consolidado; con «Reportes financieros», su tienda). Si una lectura falla, la pantalla se dibuja igual y lo dice
// (principio 9): nunca muestra ceros como si fueran datos.

type Lectura<T> = { datos: T; falla: string | null };
/** `sueldosSinLeer`: las cifras se leyeron, pero los sueldos estimados no (tarea 43). No es `falla`: esa cambia todo el informe por un error, y las cifras se tienen que seguir viendo. */
type LecturaER = Lectura<FilaER[]> & { sueldosSinLeer?: boolean };
const falla = (que: string, e: { message: string }) => `No se pudo leer ${que}: ${e.message}`;

/**
 * Una fila por ubicación que la cuenta ve; para el líder, además «De la empresa» y CAYLA. Los sueldos de un período que Dynamic
 * todavía no pagó entran como ESTIMADO (lo que corresponde pagar hasta hoy según sus boletas, ADR-0453): fuera del libro, y se
 * reemplazan solos cuando Dynamic paga. Si esa lectura falla, las cifras salen como siempre, sin los sueldos estimados.
 */
/** Lo que el mes en curso todavía va a gastar (tarea 24). `null` si no se pudo leer: la pantalla no debe confundirlo con «no falta nada». */
export async function getFaltaDelMes(mes: string): Promise<FaltaDelMes[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_lo_que_falta_del_mes" as never, { p_mes: `${mes}-01` } as never);
  if (error) return null;
  return ((data ?? []) as { ubicacion_id: string | null; fijos: number | string; depreciacion: number | string }[]).map((f) => ({
    ubicacionId: f.ubicacion_id,
    fijos: Number(f.fijos),
    depreciacion: Number(f.depreciacion),
  }));
}

// Un mes, una ganancia (tarea 23): el Resumen, Ganancias y pérdidas, los archivos del contador y la línea de los meses pasan por aquí y piden los mismos sueldos (`hastaDeLaProvision`).
export const getEstadoResultados = cache(async function getEstadoResultados(desde: string, hasta: string): Promise<LecturaER> {
  const supabase = await createClient();
  const [{ data, error }, provision] = await Promise.all([
    supabase.rpc("fn_estado_resultados" as never, { p_desde: desde, p_hasta: hasta } as never),
    getProvisionPlanilla(desde, hastaDeLaProvision(desde, hasta, hoyLima())),
  ]);
  if (error) return { datos: [], falla: falla("el estado de resultados", error) };
  const filas = ((data ?? []) as Record<string, unknown>[]).map(leerFilaER);
  return {
    datos: aplicarProvision(filas, provision.filas),
    falla: null,
    sueldosSinLeer: faltanSueldosPorFalla(provision.sinLeer, filas),
  };
});

/**
 * Unas fechas de un mes que ya pasó, para comparar con el mes en curso («octubre a esta fecha»). La base pone los sueldos en el mes donde termina el período
 * de Dynamic (el 28): del 1 al 6 no llevarían ninguno, mientras el mes en curso sí. Se lee también el mes entero y se le pone a cada fila la parte de sus
 * sueldos que corresponde a los días corridos (`sueldosAEstaFecha`). Si el mes entero no se lee, sale la lectura tal cual: la comparación queda sin sueldos,
 * como antes, pero la pantalla no se cae.
 */
export async function getEstadoResultadosAEstaFecha(desde: string, hasta: string): Promise<Lectura<FilaER[]>> {
  const mes = hasta.slice(0, 7);
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const fin = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
  if (desde.slice(0, 7) !== mes || hasta >= `${mes}-28`) return getEstadoResultados(desde, hasta);
  const [parcial, entero] = await Promise.all([getEstadoResultados(desde, hasta), getEstadoResultados(`${mes}-01`, fin)]);
  if (parcial.falla || entero.falla) return parcial;
  return { datos: sueldosAEstaFecha(parcial.datos, entero.datos, hasta), falla: null };
}

/**
 * Qué unidades del mes ya están cerradas (`fn_periodos_mes`): su columna del Estado de resultados lee lo congelado y la pantalla lo dice.
 * Es información de apoyo: si la lectura falla, las cifras se ven igual, sin la marca (principio 9: se degrada, no se cae).
 */
export async function getUnidadesCerradas(mes: string): Promise<string[]> {
  return (await leerUnidadesCerradas(mes)).datos;
}

/** Lo mismo, diciendo si se pudo leer: «Te toca» no puede afirmar que un mes sigue abierto sin haberlo comprobado (tarea 155). */
export async function leerUnidadesCerradas(mes: string): Promise<Lectura<string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_periodos_mes" as never, { p_mes: `${mes}-01` } as never);
  if (error) return { datos: [], falla: falla("los meses cerrados", error) };
  return { datos: clavesCerradas(((data ?? []) as Record<string, unknown>[]).map(leerPeriodoMes)), falla: null };
}

/** Las campañas pasadas, en curso y por venir de las tiendas que la cuenta ve. */
export async function getCampanas(): Promise<Lectura<CampanaFila[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_campanas_reporte" as never);
  if (error) return { datos: [], falla: falla("las campañas", error) };
  return {
    datos: ((data ?? []) as Record<string, unknown>[]).map(leerCampana),
    falla: null,
  };
}
