// Cuántas prendas hay en cada opción del filtro de /productos (`fn_productos_facetas`, 20261002200100; ADR-0308), sin React.
// El 2026-10-02, en producción, 179 de 284 opciones (63 %) llevaban a una lista vacía. Con esto la pantalla esconde las
// vacías y dice cuántas hay en cada una; cada número es exactamente lo que trae la lista al elegir esa opción (lo prueba
// `scripts/pruebas/productos_facetas.mjs`).

import { solesFiltro } from "./productos-filtro-precio";

export type FacetaClave = "categoria" | "marca" | "proveedor" | "color" | "familia" | "talla" | "temporada" | "estado" | "falta" | "disponibilidad";

export type TramoPrecio = { desde: number | null; hasta: number | null; n: number };

export type FacetasProductos = {
  total: number;
  /** faceta → { valor → cuántas }. Un valor que no está tiene 0. «sin» = sin marca / sin proveedor / sin temporada. */
  facetas: Partial<Record<FacetaClave, Record<string, number>>>;
  /** El precio real más bajo y más alto, sin el propio filtro de precio; `null` si no hay prendas. */
  precio: { min: number; max: number } | null;
  tramos: TramoPrecio[];
};

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Lee lo que devuelve la base sin confiar en su forma: lo que no se entiende se descarta, nunca rompe la pantalla. */
export function leerFacetas(json: unknown): FacetasProductos | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const total = numero(j.total);
  if (total == null) return null;
  const facetas: FacetasProductos["facetas"] = {};
  if (j.facetas && typeof j.facetas === "object") {
    for (const [faceta, valores] of Object.entries(j.facetas as Record<string, unknown>)) {
      if (!valores || typeof valores !== "object") continue;
      const limpio: Record<string, number> = {};
      for (const [valor, n] of Object.entries(valores as Record<string, unknown>)) {
        const k = numero(n);
        if (k != null) limpio[valor] = k;
      }
      facetas[faceta as FacetaClave] = limpio;
    }
  }
  const p = j.precio as Record<string, unknown> | null | undefined;
  const min = numero(p?.min);
  const max = numero(p?.max);
  const tramos = Array.isArray(j.tramos)
    ? (j.tramos as Record<string, unknown>[])
        .map((t) => ({ desde: numero(t?.desde), hasta: numero(t?.hasta), n: numero(t?.n) ?? 0 }))
        .filter((t) => t.n > 0 && (t.desde != null || t.hasta != null))
    : [];
  return { total, facetas, precio: min != null && max != null ? { min, max } : null, tramos };
}

/**
 * Las opciones de una píldora con su número. Se queda la que tiene prendas o la que ya está elegida (para poder verla y
 * quitarla aunque hoy dé 0). Sin conteos (`conteos` = undefined: la base no respondió), todas, como antes: se degrada a la
 * lista completa, nunca a una lista vacía.
 */
export function opcionesConConteo<O extends { valor: string }>(
  opciones: readonly O[],
  conteos: Record<string, number> | undefined,
  elegidas: readonly string[] = [],
): (O & { cantidad?: number })[] {
  if (!conteos) return [...opciones];
  return opciones
    .filter((o) => (conteos[o.valor] ?? 0) > 0 || elegidas.includes(o.valor))
    .map((o) => ({ ...o, cantidad: conteos[o.valor] ?? 0 }));
}

/** «Hasta S/ 70», «S/ 70 – S/ 100», «Desde S/ 150»: lo mismo que pide como filtro (el primero no tiene piso, el último techo). */
export function textoTramo(t: TramoPrecio): string {
  if (t.desde == null && t.hasta != null) return `Hasta ${solesFiltro(t.hasta)}`;
  if (t.hasta == null && t.desde != null) return `Desde ${solesFiltro(t.desde)}`;
  return `${solesFiltro(t.desde ?? 0)} – ${solesFiltro(t.hasta ?? 0)}`;
}

/** ¿Este tramo es justo el filtro de precio puesto? (para marcarlo). */
export function tramoActivo(t: TramoPrecio, precioMin: string, precioMax: string): boolean {
  const igual = (a: number | null, b: string) => (a == null ? b.trim() === "" : Number(b) === a);
  return igual(t.desde, precioMin) && igual(t.hasta, precioMax);
}
