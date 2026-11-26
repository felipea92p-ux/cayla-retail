import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerCuentaOtraEmpresa, leerFilaClaure, resumenClaure, leerGastoClaure, leerPagoClaure, leerVentasClaure, type CuentaOtraEmpresa, type FilaClaure, type GastoClaure, type PagoClaure, type VentasClaure } from "@/lib/cuenta-claure-reglas";
import type { Lectura } from "@/lib/cuentas-dinero";
import { leerAliadasConCuenta, quienDeVarias, QUIEN_CLAURE, type AliadaConCuenta, type Quien } from "@/lib/empresas-aliadas-reglas";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, 20261029004000 y 20261029011000). Todo sale de `fn_claure_cuenta` (lo cobrado) y
// `fn_claure_pagos` (lo ya pagado), que miran solo lo que la cuenta ve (el líder, todo; con el módulo Cuentas y dinero, su sede). El saldo lo
// SUMA `resumenClaure`, nunca se guarda. Si una lectura falla, la pantalla se dibuja igual y lo dice (principio 9): sin los pagos el saldo
// sería más alto de lo real, así que tampoco se muestra una cifra a medias.

export type CuentaClaure = { filas: FilaClaure[]; pagos: PagoClaure[]; gastos: GastoClaure[]; desde: string | null };

/**
 * Lo vendido de CLAURE entre dos días (`fn_claure_ventas_en`), para decir «de eso, CLAURE» en Impuestos y «no incluye» en el Estado de resultados.
 * Es información de apoyo (principio 9): sin permiso, sin CLAURE o si la lectura falla devuelve `null` y la pantalla se ve como siempre.
 */
export async function getVentasClaure(desde: string, hasta: string): Promise<VentasClaure | null> {
  const supabase = await createClient();
  // ADR-0683: la base suma lo de todas las aliadas; la pantalla las nombra (la única, o «las empresas aliadas»).
  const [{ data, error }, aliadas] = await Promise.all([
    supabase.rpc("fn_claure_ventas_en" as never, { p_desde: desde, p_hasta: hasta } as never),
    getAliadasConCuenta(),
  ]);
  const v = error ? null : leerVentasClaure(data);
  return v ? { ...v, quien: quienDeVarias(aliadas) } : null;
}

/**
 * Lo que se le debe a TODAS las aliadas juntas (ADR-0683), para «De eso, S/ X es de …» en Dónde está: la suma del saldo de cada cuenta, con la misma cuenta
 * que su pestaña (`resumenClaure`). Sin la lista de aliadas (base sin 20261121162000), la de CLAURE como antes. `null` si alguna no se pudo leer: no se
 * inventa una cifra a medias.
 */
export async function getSaldoDeAliadas(): Promise<{ saldo: number; quien: Quien } | null> {
  const aliadas = await getAliadasConCuenta();
  if (aliadas === null) {
    const c = await getCuentaClaure();
    return c.falla ? null : { saldo: resumenClaure(c.datos.filas, c.datos.pagos, c.datos.gastos).saldo, quien: QUIEN_CLAURE };
  }
  if (aliadas.length === 0) return null;
  const cuentas = await Promise.all(aliadas.map((a) => getCuentaAliada(a.id)));
  if (cuentas.some((c) => c.falla)) return null;
  const saldo = cuentas.reduce((s, c) => s + resumenClaure(c.datos.filas, c.datos.pagos, c.datos.gastos).saldo, 0);
  return { saldo: Math.round(saldo * 100) / 100, quien: quienDeVarias(aliadas) };
}

/**
 * Las cuentas de otra empresa (ADR-0638, `fn_cuentas_de_otras_empresas`), para mostrarlas aparte. Es información de apoyo (principio 9): sin permiso, sin cuenta o si
 * la lectura falla devuelve una lista vacía y la pantalla se ve como siempre.
 */
export async function getCuentasDeOtrasEmpresas(): Promise<CuentaOtraEmpresa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cuentas_de_otras_empresas" as never);
  return error ? [] : ((data ?? []) as unknown as Record<string, unknown>[]).map(leerCuentaOtraEmpresa);
}

/** `sinAcceso`: la cuenta no tiene el módulo Cuentas y dinero (`42501`): no es una falla, solo no ve CLAURE. Las pantallas que la muestran de paso (el Resumen) la esconden. */
export async function getCuentaClaure(): Promise<Lectura<CuentaClaure> & { sinAcceso: boolean }> {
  const supabase = await createClient();
  type Respuesta = { data: unknown; error: { message: string; code?: string } | null };
  const [cuenta, pagos, desde, gastos] = (await Promise.all([
    supabase.rpc("fn_claure_cuenta" as never),
    supabase.rpc("fn_claure_pagos" as never),
    supabase.rpc("fn_claure_cuenta_desde" as never),
    supabase.rpc("fn_claure_gastos" as never),
  ])) as unknown as [Respuesta, Respuesta, Respuesta, Respuesta];
  // Sin los gastos el saldo saldría más alto que el real, igual que sin los pagos: no se muestra una cifra a medias.
  const error = cuenta.error ?? pagos.error ?? gastos.error;
  if (error) return { datos: { filas: [], pagos: [], gastos: [], desde: null }, falla: `No se pudo leer la cuenta con CLAURE: ${error.message}`, sinAcceso: error.code === "42501" };
  return {
    datos: {
      filas: ((cuenta.data ?? []) as Record<string, unknown>[]).map(leerFilaClaure),
      pagos: ((pagos.data ?? []) as Record<string, unknown>[]).map(leerPagoClaure),
      gastos: ((gastos.data ?? []) as Record<string, unknown>[]).map(leerGastoClaure),
      // La fecha solo adorna la frase de arriba: si no se pudo leer, la frase se dice sin ella.
      desde: typeof desde.data === "string" ? desde.data : null,
    },
    falla: null,
    sinAcceso: false,
  };
}

/**
 * Las empresas aliadas con cuenta (ADR-0683, `fn_aliadas_con_cuenta`): una pestaña por cada una en Cuentas y dinero. Información de apoyo (principio 9):
 * sin el módulo o si la base todavía no tiene la función, devuelve `null` y las pestañas son las de siempre (una sola, CLAURE).
 */
export async function getAliadasConCuenta(): Promise<AliadaConCuenta[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_aliadas_con_cuenta" as never);
  return error ? null : leerAliadasConCuenta(data);
}

/** La cuenta con UNA aliada (ADR-0683, `fn_aliada_*`): lo mismo que `getCuentaClaure`, para la que se pida. */
export async function getCuentaAliada(empresaId: string): Promise<Lectura<CuentaClaure> & { sinAcceso: boolean }> {
  const supabase = await createClient();
  type Respuesta = { data: unknown; error: { message: string; code?: string } | null };
  const p = { p_empresa: empresaId } as never;
  const [cuenta, pagos, desde, gastos] = (await Promise.all([
    supabase.rpc("fn_aliada_cuenta" as never, p),
    supabase.rpc("fn_aliada_pagos" as never, p),
    supabase.rpc("fn_aliada_cuenta_desde" as never, p),
    supabase.rpc("fn_aliada_gastos" as never, p),
  ])) as unknown as [Respuesta, Respuesta, Respuesta, Respuesta];
  const error = cuenta.error ?? pagos.error ?? gastos.error;
  if (error) return { datos: { filas: [], pagos: [], gastos: [], desde: null }, falla: `No se pudo leer la cuenta con la empresa aliada: ${error.message}`, sinAcceso: error.code === "42501" };
  return {
    datos: {
      filas: ((cuenta.data ?? []) as Record<string, unknown>[]).map(leerFilaClaure),
      pagos: ((pagos.data ?? []) as Record<string, unknown>[]).map(leerPagoClaure),
      gastos: ((gastos.data ?? []) as Record<string, unknown>[]).map(leerGastoClaure),
      desde: typeof desde.data === "string" ? desde.data : null,
    },
    falla: null,
    sinAcceso: false,
  };
}
