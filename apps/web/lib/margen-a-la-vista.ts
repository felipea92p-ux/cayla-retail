// El margen a la vista (tarea 8 de «Treinta tareas de Recibir»): junto al costo y el precio, una línea viva que dice cuánto queda por
// prenda. Desde el 2026-11-15 (ADR-0668, Felipe) es LA cuenta única (`cuentaDelPrecio`): todas las prendas igual, vengan con factura o
// sin ella; el costo es lo del papel y a la venta se le quita la parte de SUNAT. Antes (`recibir-margen#1`) dependía de si la compra traía
// factura y la suponía por el RUC del proveedor, que en producción fallaba en 64 % de los papeles.
//
// El ámbar ya no es «menos de 30 %»: es «bajo el piso», el precio que no aguanta una rebaja de 35 % dejando 20 % (`pisoDelPrecio`). No
// cambia qué se guarda: solo lee lo que la persona ya escribió.
import { cuentaDelPrecio, pisoDelPrecio } from "./cuenta-de-precio";

/** normal = aguanta la rebaja · bajo = ganas, pero no aguanta la rebaja (ámbar) · pierdes = el precio no cubre lo pagado más SUNAT (rojo). */
export type TonoMargen = "normal" | "bajo" | "pierdes";

/**
 * `enSoles`: «Te quedan S/ 34.25» (donde el % ya está a la vista, como la cifra grande de Nuevo producto) · `texto`: «Te quedan S/ 34.25 ·
 * 49 %» · `piso`: desde qué precio aguanta la rebaja (solo se dice en ámbar).
 */
export type MargenALaVista = { ganancia: number; pct: number; tono: TonoMargen; piso: number | null; enSoles: string; texto: string };

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
 * Lo que queda de una prenda con lo que se pagó y su precio de venta (los dos con IGV, como se escriben). `null` si falta uno de los dos
 * (o el costo es 0 o menos: un regalo no tiene margen que mirar), y entonces la línea no se dibuja.
 */
export function margenALaVista(costo: string | number | null | undefined, precio: string | number | null | undefined): MargenALaVista | null {
  const c = montoEscrito(costo);
  const p = montoEscrito(precio);
  if (c === null || p === null || c <= 0 || p <= 0) return null;
  const cuenta = cuentaDelPrecio(c, p);
  if (!cuenta) return null;
  const piso = pisoDelPrecio(c);
  const ganancia = cuenta.teQuedan;
  const pct = cuenta.margenPorMil / 10;
  const tono: TonoMargen = ganancia < 0 ? "pierdes" : piso !== null && p < piso ? "bajo" : "normal";
  // El signo menos de verdad (−), no el guion: «Pierdes S/ 2.10 · −6 %».
  const r = Math.round(pct);
  const pctTexto = `${r < 0 ? "−" : ""}${Math.abs(r)} %`;
  const enSoles = `${ganancia < 0 ? "Pierdes" : "Te quedan"} ${soles(ganancia)}`;
  return { ganancia, pct, tono, piso, enSoles, texto: `${enSoles} · ${pctTexto}` };
}
