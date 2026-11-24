// El margen a la vista (tarea 8 de «Treinta tareas de Recibir»): junto al costo y el precio, una línea viva que dice cuánto queda por
// prenda. Desde el 2026-11-15 (ADR-0668, Felipe) es LA cuenta única (`cuentaDelPrecio`): todas las prendas igual, vengan con factura o
// sin ella; el costo es lo del papel y a la venta se le quita la parte de SUNAT. Antes (`recibir-margen#1`) dependía de si la compra traía
// factura y la suponía por el RUC del proveedor, que en producción fallaba en 64 % de los papeles.
//
// El ámbar es «bajo tu objetivo» (ADR-0700, Felipe 2026-11-24): el margen que pide la regla del Admin (la base más las casillas de la prenda).
// Antes (ADR-0668) era «no aguanta una rebaja de 35 %», un 48 % fijo para toda prenda: con la base de 36 %, casi todo precio salía ámbar y la
// gente aprendía a no mirarlo. La rebaja que aguanta no se pierde: es el mismo número que el % (con 36 %, aguanta hasta 36 % de rebaja).
// No cambia qué se guarda: solo lee lo que la persona ya escribió.
import { cts, cuentaDelPrecio } from "./cuenta-de-precio";
import { precioConMargen } from "./margen-por-rasgos";

/** normal = llega al objetivo · bajo = ganas, pero menos que tu objetivo (ámbar) · pierdes = el precio no cubre lo pagado más SUNAT (rojo). */
export type TonoMargen = "normal" | "bajo" | "pierdes";

/**
 * `enSoles`: «Te quedan S/ 34.25» (donde el % ya está a la vista, como la cifra grande de Nuevo producto) · `texto`: «Te quedan S/ 34.25 ·
 * 49 %» · `objetivo`: desde qué precio llega al objetivo (solo se dice en ámbar).
 */
export type MargenALaVista = { ganancia: number; pct: number; tono: TonoMargen; objetivo: number | null; enSoles: string; texto: string };

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
 * ¿Este precio deja al menos `margenObjetivo` % sobre el precio sin IGV? Exacto, en céntimos enteros: 1 − 1.18 × costo ÷ precio ≥ m ÷ 100 ⇔
 * 118 × costo ≤ (100 − m) × precio. Con el margen redondeado, un 35.96 % pasaría por 36 %.
 */
export function llegaAlObjetivo(costo: number, precio: number, margenObjetivo: number): boolean {
  return 118 * cts(costo) <= (100 - margenObjetivo) * cts(precio);
}

/**
 * Lo que queda de una prenda con lo que se pagó y su precio de venta (los dos con IGV, como se escriben), contra el margen objetivo de esa
 * prenda (`useMargenObjetivo`). `null` si falta el costo o el precio (o el costo es 0 o menos: un regalo no tiene margen que mirar), y
 * entonces la línea no se dibuja.
 */
export function margenALaVista(
  costo: string | number | null | undefined,
  precio: string | number | null | undefined,
  margenObjetivo: number,
): MargenALaVista | null {
  const c = montoEscrito(costo);
  const p = montoEscrito(precio);
  if (c === null || p === null || c <= 0 || p <= 0) return null;
  const cuenta = cuentaDelPrecio(c, p);
  if (!cuenta) return null;
  const objetivo = precioConMargen(c, margenObjetivo);
  const ganancia = cuenta.teQuedan;
  const pct = cuenta.margenPorMil / 10;
  // Sin un precio que llegue (pasaría del tope de la base con ese costo) también es ámbar: nunca verde.
  const tono: TonoMargen = ganancia < 0 ? "pierdes" : objetivo === null || !llegaAlObjetivo(c, p, margenObjetivo) ? "bajo" : "normal";
  // El signo menos de verdad (−), no el guion: «Pierdes S/ 2.10 · −6 %».
  const r = Math.round(pct);
  const pctTexto = `${r < 0 ? "−" : ""}${Math.abs(r)} %`;
  const enSoles = `${ganancia < 0 ? "Pierdes" : "Te quedan"} ${soles(ganancia)}`;
  return { ganancia, pct, tono, objetivo, enSoles, texto: `${enSoles} · ${pctTexto}` };
}
