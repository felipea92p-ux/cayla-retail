import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { getProvisionPlanilla } from "@/lib/planilla-provision";
import { hastaDeLaProvision, sueldosSinLeerDelBalance } from "@/lib/planilla-provision-reglas";
import { getEstadoResultados } from "@/lib/resultados";
import {
  leerChequeo,
  leerLinea,
  leerSaldoInicial,
  leerUnidad,
  unidadesConSueldos,
  type Chequeo,
  type LineaBalance,
  type SaldoInicial,
  type UnidadBalance,
} from "@/lib/balance-reglas";

// Finanzas ▸ Reportes ▸ Balance (ADR-0195 F7; contrato en 20260925170000_finanzas_balance.sql). Solo LEE: el Balance, la
// comprobación y lo que es de cada tienda se calculan en Postgres, y la base ya filtra por cuenta (el Balance de CAYLA
// entera, la comprobación y los saldos de arranque son del líder; con «Reportes financieros», lo que es de su tienda). Si
// una lectura falla, la pantalla se dibuja igual y lo dice (principio 9): nunca muestra ceros como si fueran datos.

type Lectura<T> = { datos: T; falla: string | null };
const falla = (que: string, e: { message: string }) => `No se pudo leer ${que}: ${e.message}`;

/** La comprobación antes de dibujar (solo el líder). */
export const getConciliacion = cache(async function getConciliacion(corte: string): Promise<Lectura<Chequeo[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacion_contable" as never, { p_corte: corte } as never);
  if (error) return { datos: [], falla: falla("la comprobación del Balance", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerChequeo).sort((a, b) => a.orden - b.orden), falla: null };
});

/** El Balance de CAYLA entera a una fecha (solo el líder). Vacío si todavía no hay saldos de arranque. */
export const getBalanceGeneral = cache(async function getBalanceGeneral(corte: string): Promise<Lectura<LineaBalance[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_balance_general" as never, { p_corte: corte } as never);
  if (error) return { datos: [], falla: falla("el Balance", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerLinea), falla: null };
});

/** Lo que es de cada tienda y del Taller (el líder, todas; con el módulo, la suya). */
export const getBalancePorTienda = cache(async function getBalancePorTienda(corte: string): Promise<Lectura<UnidadBalance[]> & { sueldosSinLeer?: boolean }> {
  const supabase = await createClient();
  // El mes del corte, como la base: sus sueldos estimados son los mismos que resta Ganancias y pérdidas. Si no se pueden leer, sale la utilidad del diario (principio 9).
  const desde = `${corte.slice(0, 7)}-01`;
  const [{ data, error }, provision] = await Promise.all([
    supabase.rpc("fn_balance_por_tienda" as never, { p_corte: corte } as never),
    getProvisionPlanilla(desde, hastaDeLaProvision(desde, corte, hoyLima())),
  ]);
  if (error) return { datos: [], falla: falla("lo que es de cada tienda", error) };
  // Solo si la lectura se cayó se pregunta por el mes (la misma lectura y las mismas fechas que Ganancias): sin esto, un mes con la planilla ya pagada avisaría en falso.
  const sueldosSinLeer = provision.sinLeer && sueldosSinLeerDelBalance(true, await getEstadoResultados(desde, corte));
  return { datos: unidadesConSueldos(((data ?? []) as Record<string, unknown>[]).map(leerUnidad), provision.filas), falla: null, sueldosSinLeer };
});

/** Los saldos de arranque con su historia (solo el líder). */
export async function getSaldosIniciales(): Promise<Lectura<SaldoInicial[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_saldos_iniciales" as never);
  if (error) return { datos: [], falla: falla("los saldos de arranque", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerSaldoInicial), falla: null };
}
