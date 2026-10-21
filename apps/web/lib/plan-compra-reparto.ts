// Plan de campaña: cuánto le toca a cada tienda (ADR-0372, act. 2026-10-12 · Felipe: «de manera global debemos comprar tanto, pero cada sede
// es única»). Lógica pura, sin React ni red.
//
// LAS REGLAS DE FELIPE (2026-10-12):
//   · El objetivo de cada categoría (lo que conviene tener en toda CAYLA) se reparte según lo que vendió cada tienda en 90 días. Se usa su
//     RITMO por día con ERP, no el total: una tienda que abrió hace un mes no queda castigada contra una que vende hace tres.
//   · Una tienda casi sin ventas (Lima al empezar) recibe el MÍNIMO que se le fija (quien tiene el módulo, ADR-0362 decisión 64); lo que queda
//     se reparte entre las demás según su ritmo.
//   · Se manda todo al inicio: a cada tienda, lo que le toca menos lo que ya tiene. Si una ya tiene de más, lo que le sobra se puede trasladar.
//
// CONTRATO: PROMETE porcentajes que suman 100 % y unidades enteras que suman exacto el objetivo (resto mayor). NO mueve nada: dice cuánto.

export type TiendaReparto = {
  id: string;
  nombre: string;
  /** Unidades de la categoría vendidas en 90 días. */
  u90: number;
  /** Días de esos 90 en que la tienda ya vendía en el ERP (0 = todavía no vende). */
  dias90: number;
  /** Lo que tiene hoy de la categoría. */
  stock: number;
  /** El mínimo que se le fijó a la tienda (0 a 1), o null. */
  minimo: number | null;
};

export type FilaReparto = { id: string; nombre: string; pct: number; leToca: number; tiene: number; falta: number; sobra: number; porMinimo: boolean };

/** Los % de cada tienda: por su ritmo de venta, con los mínimos respetados. Sin ventas en ninguna, solo los mínimos (el resto, en partes iguales). */
export function porcentajes(tiendas: readonly Pick<TiendaReparto, "id" | "u90" | "dias90" | "minimo">[]): Map<string, { pct: number; porMinimo: boolean }> {
  const ritmo = new Map(tiendas.map((t) => [t.id, t.dias90 > 0 ? t.u90 / t.dias90 : 0]));
  const fijas = new Map<string, number>();
  // Se fija el mínimo de cada tienda que, por su ritmo, quedaría debajo; se repite porque al fijar una, las demás se reacomodan.
  for (let vuelta = 0; vuelta <= tiendas.length; vuelta++) {
    const libres = tiendas.filter((t) => !fijas.has(t.id));
    const resto = Math.max(0, 1 - [...fijas.values()].reduce((a, p) => a + p, 0));
    const suma = libres.reduce((a, t) => a + (ritmo.get(t.id) ?? 0), 0);
    const nueva = libres.find((t) => t.minimo !== null && (suma > 0 ? ((ritmo.get(t.id) ?? 0) / suma) * resto : resto / libres.length) < t.minimo);
    if (!nueva) break;
    fijas.set(nueva.id, nueva.minimo!);
  }
  const libres = tiendas.filter((t) => !fijas.has(t.id));
  const resto = Math.max(0, 1 - [...fijas.values()].reduce((a, p) => a + p, 0));
  const suma = libres.reduce((a, t) => a + (ritmo.get(t.id) ?? 0), 0);
  const res = new Map<string, { pct: number; porMinimo: boolean }>();
  for (const t of tiendas) {
    if (fijas.has(t.id)) res.set(t.id, { pct: fijas.get(t.id)!, porMinimo: true });
    else res.set(t.id, { pct: suma > 0 ? ((ritmo.get(t.id) ?? 0) / suma) * resto : libres.length > 0 ? resto / libres.length : 0, porMinimo: false });
  }
  return res;
}

/** Enteros que suman exacto `total`, en proporción a `pesos` (resto mayor). */
function enEnteros(total: number, pesos: readonly number[]): number[] {
  const crudos = pesos.map((p) => p * total);
  const base = crudos.map(Math.floor);
  let falta = total - base.reduce((a, n) => a + n, 0);
  const orden = crudos.map((c, i) => ({ i, r: c - Math.floor(c) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of orden) {
    if (falta <= 0) break;
    base[i] += 1;
    falta -= 1;
  }
  return base;
}

export const RPC_GUARDAR_MINIMO = "guardar_plan_compra_minimo";

/** Lo que rechaza `guardar_plan_compra_minimo`, tienda por tienda (vacío = se puede guardar): enteros de 1 a 90, en blanco = sin mínimo, y la
 *  suma de la campaña no pasa de 100 %. */
export function problemasDeLosMinimos(textos: Readonly<Record<string, string>>): { porTienda: Record<string, string>; suma: string | null } {
  const porTienda: Record<string, string> = {};
  let suma = 0;
  for (const [id, t] of Object.entries(textos)) {
    const s = t.trim();
    if (s === "") continue;
    if (!/^\d{1,2}$/.test(s) || Number(s) < 1 || Number(s) > 90) porTienda[id] = "De 1 a 90 %, o en blanco para no fijar mínimo.";
    else suma += Number(s);
  }
  return { porTienda, suma: suma > 100 ? `Los mínimos suman ${suma} %: no pueden pasar de 100 %.` : null };
}

/** «Lima 10 %, Arequipa 5 %» o null si ninguna tiene mínimo. */
export function fraseDeLosMinimos(tiendas: readonly { id: string; nombre: string }[], minimos: ReadonlyMap<string, number>): string | null {
  const con = tiendas.filter((t) => minimos.has(t.id)).map((t) => `${t.nombre} ${Math.round(minimos.get(t.id)! * 100)} %`);
  return con.length > 0 ? con.join(", ") : null;
}

/** El reparto de una categoría: cuánto le toca a cada tienda del objetivo, cuánto ya tiene, cuánto le falta (mandar) y cuánto le sobra. */
export function repartir(objetivo: number, tiendas: readonly TiendaReparto[]): { filas: FilaReparto[]; falta: number; sobra: number } {
  const pct = porcentajes(tiendas);
  const toca = enEnteros(Math.max(0, Math.round(objetivo)), tiendas.map((t) => pct.get(t.id)?.pct ?? 0));
  const filas = tiendas.map((t, i): FilaReparto => ({
    id: t.id,
    nombre: t.nombre,
    pct: pct.get(t.id)?.pct ?? 0,
    leToca: toca[i],
    tiene: t.stock,
    falta: Math.max(0, toca[i] - t.stock),
    sobra: Math.max(0, t.stock - toca[i]),
    porMinimo: pct.get(t.id)?.porMinimo ?? false,
  }));
  return { filas, falta: filas.reduce((a, f) => a + f.falta, 0), sobra: filas.reduce((a, f) => a + f.sobra, 0) };
}

/**
 * Las tiendas de una categoría listas para repartir, con lo que trae la propuesta del Plan (`fn_plan_compra_propuesta`): todas las tiendas
 * activas, su venta de 90 días de esa categoría, sus días con ERP y su mínimo. `stockDe` da lo que tiene hoy cada una (por nombre). Lo usan el
 * Plan (cuánto mandarle) y Resultados (la parte del plan de una tienda): una sola regla.
 */
export function tiendasParaRepartir(
  hechos: {
    tiendasActivas: readonly { id: string; nombre: string }[];
    tiendas: readonly { id: string; dias90: number }[];
    categorias: ReadonlyMap<string, readonly { tienda: string; u90: number }[]>;
    minimos: ReadonlyMap<string, number>;
  },
  categoriaId: string,
  stockDe: (nombreTienda: string) => number = () => 0,
): TiendaReparto[] {
  return hechos.tiendasActivas.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    u90: hechos.categorias.get(categoriaId)?.find((h) => h.tienda === t.id)?.u90 ?? 0,
    dias90: hechos.tiendas.find((x) => x.id === t.id)?.dias90 ?? 0,
    stock: stockDe(t.nombre),
    minimo: hechos.minimos.get(t.id) ?? null,
  }));
}
