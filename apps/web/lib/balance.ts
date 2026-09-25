import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  leerChequeo,
  leerLinea,
  leerSaldoInicial,
  leerUnidad,
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
export async function getConciliacion(corte: string): Promise<Lectura<Chequeo[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacion_contable" as never, { p_corte: corte } as never);
  if (error) return { datos: [], falla: falla("la comprobación del Balance", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerChequeo).sort((a, b) => a.orden - b.orden), falla: null };
}

/** El Balance de CAYLA entera a una fecha (solo el líder). Vacío si todavía no hay saldos de arranque. */
export async function getBalanceGeneral(corte: string): Promise<Lectura<LineaBalance[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_balance_general" as never, { p_corte: corte } as never);
  if (error) return { datos: [], falla: falla("el Balance", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerLinea), falla: null };
}

/** Lo que es de cada tienda y del Taller (el líder, todas; con el módulo, la suya). */
export async function getBalancePorTienda(corte: string): Promise<Lectura<UnidadBalance[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_balance_por_tienda" as never, { p_corte: corte } as never);
  if (error) return { datos: [], falla: falla("lo que es de cada tienda", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerUnidad), falla: null };
}

/** Los saldos de arranque con su historia (solo el líder). */
export async function getSaldosIniciales(): Promise<Lectura<SaldoInicial[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_saldos_iniciales" as never);
  if (error) return { datos: [], falla: falla("los saldos de arranque", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerSaldoInicial), falla: null };
}
