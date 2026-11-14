// El margen a la vista (tarea 8 de «Treinta tareas de Recibir», reunión del 2026-11-13): junto al costo y el precio, una línea viva que dice
// cuánto se gana por prenda, en soles y en %. Es la MISMA cuenta de Nuevo producto (`margenPorcentaje`, sobre el precio de venta, sin
// descontar IGV: es una ayuda para decidir el precio, no contabilidad) y el mismo umbral de 30 % de la propuesta de precio (`MARGEN_MINIMO`).
// No cambia qué se guarda: solo lee lo que la persona ya escribió.
import { margenPorcentaje } from "./alta-producto";
import { MARGEN_MINIMO } from "./precio-propuesto-reglas";

/** normal = 30 % o más · bajo = ganas, pero menos de 30 % (ámbar) · pierdes = el precio no cubre el costo (rojo). */
export type TonoMargen = "normal" | "bajo" | "pierdes";

/** `enSoles`: «Ganas S/ 34» (donde el % ya está a la vista, como la cifra grande de Nuevo producto) · `texto`: «Ganas S/ 34 · 48 %». */
export type MargenALaVista = { ganancia: number; pct: number; tono: TonoMargen; enSoles: string; texto: string };

// «S/ 34» si es entero, «S/ 14.90» si no: como se escriben los precios en el resto del ERP (punto decimal).
const soles = (n: number) => {
  const a = Math.abs(n);
  return `S/\u00a0${Number.isInteger(a) ? String(a) : a.toFixed(2)}`;
};

/** Lee un monto escrito («59.90», «59,9», «S/ 59») como número; `null` si está vacío o no es un monto. */
export function montoEscrito(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  const limpio = texto.replace(/s\/\s*/i, "").replace(",", ".").trim();
  if (limpio === "" || !/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

/**
 * El margen de una prenda con su costo y su precio de venta. `null` si falta uno de los dos (o el costo es 0 o menos: un regalo no tiene
 * margen que mirar), y entonces la línea no se dibuja.
 */
export function margenALaVista(costo: string | number | null | undefined, precio: string | number | null | undefined): MargenALaVista | null {
  const c = montoEscrito(costo);
  const p = montoEscrito(precio);
  if (c === null || p === null || c <= 0 || p <= 0) return null;
  const pct = margenPorcentaje(p, c);
  if (pct === null) return null;
  const ganancia = Math.round((p - c) * 100) / 100;
  const tono: TonoMargen = ganancia < 0 ? "pierdes" : pct < MARGEN_MINIMO * 100 ? "bajo" : "normal";
  // El signo menos de verdad (−), no el guion: «Pierdes S/ 6 · −20 %».
  const r = Math.round(pct);
  const pctTexto = `${r < 0 ? "\u2212" : ""}${Math.abs(r)}\u00a0%`;
  const enSoles = `${ganancia < 0 ? "Pierdes" : "Ganas"} ${soles(ganancia)}`;
  return { ganancia, pct, tono, enSoles, texto: `${enSoles} · ${pctTexto}` };
}
