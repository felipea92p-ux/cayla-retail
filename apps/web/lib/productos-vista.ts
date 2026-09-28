import type { VarianteCatalogo } from "./catalogo-v2";
import { margenPorcentaje } from "./alta-producto";

/* ====================================================================
   Productos · lo que la Grilla y la Tabla calculan igual (ADR-0077,
   ADR-0254). Lógica pura: sale de las variantes que `fn_productos` ya trae,
   sin pedir nada nuevo al servidor. Si las dos vistas lo calcularan cada una
   por su lado, un día dirían precios o colores distintos de la misma prenda.
   ==================================================================== */

export type ColorDisponible = { nombre: string; hex: string; fotoUrl: string | null };

/** Los colores en que existe el modelo, en el orden en que llegan, con la foto de la primera variante de cada uno. */
export function coloresDe(variantes: readonly VarianteCatalogo[]): ColorDisponible[] {
  const vistos = new Map<string, ColorDisponible>();
  for (const v of variantes) {
    if (!v.color) continue;
    if (!vistos.has(v.color)) vistos.set(v.color, { nombre: v.color, hex: v.colorHex ?? "#8A8A8A", fotoUrl: v.fotoUrl });
  }
  return [...vistos.values()];
}

/** Las tallas del modelo, sin repetir, en el orden en que llegan (`fn_productos` ya las ordena). */
export function tallasDe(variantes: readonly VarianteCatalogo[]): string[] {
  return [...new Set(variantes.flatMap((v) => (v.talla ? [v.talla] : [])))];
}

/** «S/129.00» o «S/112.00–118.00»; `null` si no hay ningún valor (costo que esta cuenta no ve: se pinta «—», nunca S/0). */
export function rangoSoles(valores: readonly (number | null)[]): string | null {
  const nums = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? `S/${min.toFixed(2)}` : `S/${min.toFixed(2)}–${max.toFixed(2)}`;
}

/** Tinte de fondo de un color, mezclado hacia crema: el placeholder honesto de una prenda sin foto. */
export function mezclar(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16) || 0;
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const base = { r: 245, g: 240, b: 232 }; // crema
  const mr = Math.round(r * pct + base.r * (1 - pct));
  const mg = Math.round(g * pct + base.g * (1 - pct));
  const mb = Math.round(b * pct + base.b * (1 - pct));
  return `rgb(${mr}, ${mg}, ${mb})`;
}

/**
 * Bajo este margen la Tabla lo pinta en ámbar. PROVISIONAL (Felipe, 2026-09-28: «construye con 45 %»): no es un
 * número que CAYLA haya decidido por categoría. Ojo, el ERP ya tiene otros dos cortes y no dicen lo mismo:
 * el alta de producto avisa bajo 30 % (`nivelMargen`, alta-producto.ts) y Producción usa 40/60 % sobre costo
 * directo (`semaforoMargen`, produccion-reglas.ts). Unificarlos es decisión pendiente (ADR-0254).
 */
export const UMBRAL_MARGEN_BAJO = 45;

export type MargenProducto = { min: number; max: number; bajo: boolean };

/**
 * El margen del modelo sobre el precio de venta, en %, con la MISMA fórmula que el alta (`margenPorcentaje`, sin
 * descontar IGV: es una alerta, no contabilidad). Rango entre variantes, porque un XL puede costar más que un S.
 * `null` si ninguna variante tiene costo: sin permiso de ver el dinero `fn_productos` manda el costo vacío, y una
 * prenda sin costo cargado no tiene margen (antes un costo vacío contaba como 0 y daba 100 %).
 * `bajo` mira el PEOR margen del modelo: la talla que menos deja es la que avisa.
 */
export function margenDe(variantes: readonly { precio: number; costo: number | null }[]): MargenProducto | null {
  const margenes = variantes.flatMap((v) => {
    if (v.costo === null) return [];
    const m = margenPorcentaje(v.precio, v.costo);
    return m === null ? [] : [m];
  });
  if (margenes.length === 0) return null;
  const min = Math.min(...margenes);
  const max = Math.max(...margenes);
  return { min, max, bajo: min < UMBRAL_MARGEN_BAJO };
}

/** «52 %» o «48–61 %», redondeado al entero: medio punto no cambia ninguna decisión. */
export function textoMargen(m: MargenProducto): string {
  const a = Math.round(m.min);
  const b = Math.round(m.max);
  return a === b ? `${a} %` : `${a}–${b} %`;
}
