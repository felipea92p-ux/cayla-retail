// Cuánto de lo vendido es de cada empresa (ADR-0532). Lógica pura, sin React ni Supabase; la lectura vive en
// `lib/vendido-por-empresa.ts`.
//
// EL PROBLEMA. En Tienda LIM venden dos negocios con la misma caja y la misma boleta (CAYLA y CLAURE, ADR-0463). Caja y el Historial
// decían cuánto se vendió, pero no cuánto era de cada uno (Felipe, 2026-10-26).
//
// LA REGLA. Se reparte LO VENDIDO prenda por prenda: cada línea suma a la empresa de su producto por lo que se cobró de ella (con los
// descuentos ya restados). Es exacto, no una proporción. Los pagos (efectivo, Yape, tarjeta) no se reparten: es un solo cajón. Una venta
// anulada no suma; una devolución o un cambio no restan, igual que el «vendido» de siempre.
//
// DÓNDE SE VE. Solo donde conviven dos o más empresas (Lima y la vista Global) o donde, por lo que sea, se vendió algo que no es de la
// casa. En Trujillo y Arequipa, donde todo es CAYLA, el reparto no se dibuja: diría «100 % CAYLA» y sería ruido.

import type { EmpresasAqui } from "@/lib/empresas-de-sede-reglas";

/** Lo vendido de una empresa, como llega de la base (`fn_vendido_por_empresa*`). */
export type VendidoEmpresa = { empresaId: string; clave: string; nombre: string; orden: number; ventas: number; unidades: number; total: number };

/** Una empresa en el reparto, con su parte del total. */
export type ParteEmpresa = VendidoEmpresa & { pct: number };

/** Lo vendido partido por empresa; `total` es la suma de las partes (lo mismo que el «vendido» de la pantalla). */
export type RepartoEmpresas = { total: number; partes: ParteEmpresa[] };

/** La empresa de la casa: la que no lleva insignia (ADR-0463). */
const CLAVE_CASA = "cayla";

const aCentimos = (n: number) => Math.round(n * 100);

type FilaBase = { empresa_id: string; clave: string; nombre: string; orden: number | null; ventas: number | null; unidades: number | null; total: number | string | null };

/** Una fila de `fn_vendido_por_empresa` (o de la de cajas) a la forma de la pantalla. */
export function vendidoDeLaBase(f: FilaBase): VendidoEmpresa {
  return {
    empresaId: f.empresa_id,
    clave: f.clave,
    nombre: f.nombre,
    orden: f.orden ?? 0,
    ventas: f.ventas ?? 0,
    unidades: f.unidades ?? 0,
    total: aCentimos(Number(f.total ?? 0)) / 100,
  };
}

/**
 * Porcentajes enteros que suman exactamente 100 (el mayor resto se lleva lo que falta): «82 % y 18 %», nunca «82 % y 17 %».
 * Con total 0, todos en 0.
 */
export function porcentajesEnteros(montos: number[]): number[] {
  const centimos = montos.map(aCentimos);
  const total = centimos.reduce((a, b) => a + b, 0);
  if (total <= 0) return montos.map(() => 0);
  const exactos = centimos.map((c) => (c * 100) / total);
  const pisos = exactos.map(Math.floor);
  let falta = 100 - pisos.reduce((a, b) => a + b, 0);
  const orden = exactos.map((e, i) => ({ i, resto: e - Math.floor(e) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of orden) {
    if (falta <= 0) break;
    pisos[i]! += 1;
    falta--;
  }
  return pisos;
}

/**
 * El reparto que se dibuja, o `null` si aquí no hay nada que repartir.
 *
 * - Se dibuja si en este lugar conviven dos o más empresas (`empresasAqui`, la regla de ADR-0505), o si lo vendido trae alguna que no
 *   es la casa (una vista sin lista de empresas, o una venta vieja de otra sede).
 * - Las empresas que operan aquí salen siempre, aunque hoy no hayan vendido nada (CLAURE en S/ 0 dice «se está contando»); una que
 *   vendió pero ya no opera aquí también sale, porque su dinero está en el total.
 * - En el orden de la base (`empresas.orden`): CAYLA primero.
 */
export function repartoDeEmpresas(filas: readonly VendidoEmpresa[] | null, empresasAqui: EmpresasAqui): RepartoEmpresas | null {
  if (!filas) return null;
  const variasAqui = (empresasAqui?.length ?? 0) >= 2;
  const ajena = filas.some((f) => f.clave !== CLAVE_CASA && f.total !== 0);
  if (!variasAqui && !ajena) return null;

  const porId = new Map<string, VendidoEmpresa>();
  for (const f of filas) porId.set(f.empresaId, f);
  (empresasAqui ?? []).forEach((e, i) => {
    if (!porId.has(e.id)) porId.set(e.id, { empresaId: e.id, clave: e.clave, nombre: e.nombre, orden: i + 1, ventas: 0, unidades: 0, total: 0 });
  });
  const lista = [...porId.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const pcts = porcentajesEnteros(lista.map((e) => e.total));
  return {
    total: lista.reduce((s, e) => s + aCentimos(e.total), 0) / 100,
    partes: lista.map((e, i) => ({ ...e, pct: pcts[i]! })),
  };
}

/** Lo de cada caja: las filas de `fn_vendido_por_empresa_de_cajas` agrupadas por turno. */
export function vendidoPorCaja(filas: readonly (FilaBase & { caja_id: string })[]): Map<string, VendidoEmpresa[]> {
  const porCaja = new Map<string, VendidoEmpresa[]>();
  for (const f of filas) {
    const lista = porCaja.get(f.caja_id) ?? [];
    lista.push(vendidoDeLaBase(f));
    porCaja.set(f.caja_id, lista);
  }
  return porCaja;
}

/** Una línea de una venta: de qué empresa es la prenda y cuánto se cobró por ella. */
export type LineaConEmpresa = { empresaId: string | null | undefined; monto: number };

/**
 * La marca de una venta en el Historial: qué parte NO es de la casa. `null` si toda la venta es de la casa o si aquí no se distinguen
 * empresas. `toda` = la venta entera es de esa empresa (se marca solo con su nombre); si es mixta, se dice cuánto es suyo.
 * Si hubiera prendas de dos empresas ajenas, se marca la de más dinero (hoy solo existe CLAURE).
 */
export function marcaDeEmpresa(lineas: readonly LineaConEmpresa[], empresasAqui: EmpresasAqui): { nombre: string; monto: number; toda: boolean } | null {
  if (!empresasAqui || lineas.length === 0) return null;
  const casa = empresasAqui.find((e) => e.clave === CLAVE_CASA)?.id ?? null;
  const porEmpresa = new Map<string, number>();
  let total = 0;
  for (const l of lineas) {
    const c = aCentimos(l.monto);
    total += c;
    if (!l.empresaId || l.empresaId === casa) continue;
    porEmpresa.set(l.empresaId, (porEmpresa.get(l.empresaId) ?? 0) + c);
  }
  const [mayor] = [...porEmpresa.entries()].sort((a, b) => b[1] - a[1]);
  if (!mayor) return null;
  const empresa = empresasAqui.find((e) => e.id === mayor[0]);
  if (!empresa) return null;
  return { nombre: empresa.nombre, monto: mayor[1] / 100, toda: mayor[1] === total };
}
