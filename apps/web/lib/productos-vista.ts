import type { VarianteCatalogo } from "./catalogo-v2";
import { margenPorcentaje } from "./alta-producto";
import { compararTallas } from "./tallas";

/* ====================================================================
   Productos · lo que la Grilla y la Tabla calculan igual (ADR-0077,
   ADR-0254). Lógica pura: sale de las variantes que `fn_productos` ya trae,
   sin pedir nada nuevo al servidor. Si las dos vistas lo calcularan cada una
   por su lado, un día dirían precios o colores distintos de la misma prenda.
   ==================================================================== */

export type ColorDisponible = { nombre: string; hex: string; fotoUrl: string | null };

/** Las variantes que el catálogo muestra y cuenta: las que se venden. Una desactivada (un color o una talla que se quitó de
 *  la ficha) no cuenta ni se lista; sus unidades, si las tiene, siguen en el inventario. Un modelo con TODAS desactivadas
 *  (descontinuado) las conserva para no quedar sin colores, tallas ni precio. */
export function variantesQueSeVenden<V extends { activo: boolean }>(variantes: readonly V[]): readonly V[] {
  const activas = variantes.filter((v) => v.activo);
  return activas.length > 0 ? activas : variantes;
}

/** Los colores en que existe el modelo, en el orden en que llegan, con la foto de la primera variante de cada uno que la tenga
 *  (una talla sin foto no le quita la foto al color). */
export function coloresDe(variantes: readonly VarianteCatalogo[]): ColorDisponible[] {
  const vistos = new Map<string, ColorDisponible>();
  for (const v of variantesQueSeVenden(variantes)) {
    if (!v.color) continue;
    const visto = vistos.get(v.color);
    if (!visto) vistos.set(v.color, { nombre: v.color, hex: v.colorHex ?? "#8A8A8A", fotoUrl: v.fotoUrl });
    else visto.fotoUrl ??= v.fotoUrl;
  }
  return [...vistos.values()];
}

/** El color que la tarjeta muestra si nadie eligió otro (Felipe, 2026-10-08): el primero con foto, para que la foto principal sea
 *  la prenda real; si ningún color tiene foto, el primero. */
export function colorPrincipal<C extends { fotoUrl: string | null }>(colores: readonly C[]): C | undefined {
  return colores.find((c) => c.fotoUrl) ?? colores[0];
}

/** Las tallas del modelo, sin repetir, en su orden de curva (XS · S · M · L): las variantes llegan en el orden en
 *  que se crearon, y «L, M, S» confunde a quien busca la M. */
export function tallasDe(variantes: readonly VarianteCatalogo[]): string[] {
  return [...new Set(variantesQueSeVenden(variantes).flatMap((v) => (v.talla ? [v.talla] : [])))].sort(compararTallas);
}

/** Las variantes agrupadas por color (en el orden de `coloresDe`) y, dentro de cada color, por curva de talla. */
export function ordenarVariantes<V extends Pick<VarianteCatalogo, "color" | "talla">>(variantes: readonly V[]): V[] {
  const ordenColor = new Map<string, number>();
  for (const v of variantes) if (v.color && !ordenColor.has(v.color)) ordenColor.set(v.color, ordenColor.size);
  const posColor = (v: V) => (v.color ? ordenColor.get(v.color)! : ordenColor.size);
  return [...variantes].sort((a, b) => posColor(a) - posColor(b) || compararTallas(a.talla ?? "", b.talla ?? ""));
}

/** «S/129.00» o «S/112.00–118.00»; `null` si no hay ningún valor (costo que esta cuenta no ve: se pinta «—», nunca S/0). */
export function rangoSoles(valores: readonly (number | null)[]): string | null {
  const nums = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? `S/${min.toFixed(2)}` : `S/${min.toFixed(2)}–${max.toFixed(2)}`;
}

/**
 * Bajo este margen la Tabla lo pinta en ámbar. PROVISIONAL (Felipe, 2026-09-28: «construye con 45 %»): no es un
 * número que CAYLA haya decidido por categoría. Ojo, el ERP ya tiene otros dos cortes y no dicen lo mismo:
 * el alta de producto avisa bajo 30 % (`nivelMargen`, alta-producto.ts) y Producción usa 40/60 % sobre costo
 * directo (`semaforoMargen`, produccion-reglas.ts). Unificarlos es decisión pendiente (ADR-0254).
 */
export const UMBRAL_MARGEN_BAJO = 45;

/** ¿Hay un costo de verdad? `null` (no se ve o no se cargó) y 0 (no se cargó) no lo son. */
export function tieneCosto(costo: number | null): costo is number {
  return costo !== null && Number.isFinite(costo) && costo > 0;
}

export type MargenProducto = { min: number; max: number; bajo: boolean };

/**
 * El margen del modelo sobre el precio de venta, en %, con la MISMA fórmula que el alta (`margenPorcentaje`, sin
 * descontar IGV: es una alerta, no contabilidad). Rango entre variantes, porque un XL puede costar más que un S.
 * `null` si ninguna variante tiene costo: sin permiso de ver el dinero `fn_productos` manda el costo vacío, y una
 * prenda sin costo cargado no tiene margen. Un costo en CERO tampoco es un costo (es «no se cargó»): contarlo daba
 * «100 %», el margen más lindo de la tabla sobre la prenda de la que menos se sabe.
 * `bajo` mira el PEOR margen del modelo: la talla que menos deja es la que avisa.
 */
export function margenDe(variantes: readonly { precio: number; costo: number | null }[]): MargenProducto | null {
  const margenes = variantes.flatMap((v) => {
    if (!tieneCosto(v.costo)) return [];
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
