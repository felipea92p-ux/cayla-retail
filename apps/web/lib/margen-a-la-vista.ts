// El margen a la vista (tarea 8 de «Treinta tareas de Recibir», reunión del 2026-11-13): junto al costo y el precio, una línea viva que dice
// cuánto se gana por prenda, en soles y en %. Desde el 2026-11-14 (`recibir-margen#1`, Felipe) es la MISMA cuenta de Compras (`cuentaDeLinea`,
// ADR-0417): el precio sin IGV y, si la compra trae factura, también el costo sin IGV (ese IGV se recupera como crédito fiscal). Antes era la
// de Nuevo producto (precio con IGV contra el costo tal cual), y la misma prenda decía 49 % al recibirla y 39 % en Compras. El umbral es el de
// la propuesta de precio (`MARGEN_MINIMO`, 30 %), comparado contra este margen. No cambia qué se guarda: solo lee lo que la persona ya escribió.
import { cuentaDeLinea } from "./orden-compra-precio-ayuda";
import { MARGEN_MINIMO } from "./precio-propuesto-reglas";

/** normal = 30 % o más · bajo = ganas, pero menos de 30 % (ámbar) · pierdes = el precio no cubre el costo (rojo). */
export type TonoMargen = "normal" | "bajo" | "pierdes";

/** `enSoles`: «Ganas S/ 34» (donde el % ya está a la vista, como la cifra grande de Nuevo producto) · `texto`: «Ganas S/ 34 · 48 %». */
export type MargenALaVista = { ganancia: number; pct: number; tono: TonoMargen; enSoles: string; texto: string };

// «S/ 34» si es entero, «S/ 14.90» si no: como se escriben los precios en el resto del ERP (punto decimal).
const soles = (n: number) => {
  const a = Math.abs(n);
  return `S/ ${Number.isInteger(a) ? String(a) : a.toFixed(2)}`;
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
 * El margen de una prenda con su costo y su precio de venta (los dos con IGV, como se escriben). `conFactura`: ¿la compra trae factura?
 * Sin el dato va `false`, que nunca infla el margen. `null` si falta uno de los dos (o el costo es 0 o menos: un regalo no tiene margen que
 * mirar), y entonces la línea no se dibuja.
 */
export function margenALaVista(
  costo: string | number | null | undefined,
  precio: string | number | null | undefined,
  conFactura = false,
): MargenALaVista | null {
  const c = montoEscrito(costo);
  const p = montoEscrito(precio);
  if (c === null || p === null || c <= 0 || p <= 0) return null;
  const cuenta = cuentaDeLinea(c, 0, conFactura, p);
  if (cuenta.ganancia === null || cuenta.margenPorMil === null) return null;
  const ganancia = Math.round(cuenta.ganancia * 100) / 100;
  const pct = cuenta.margenPorMil / 10;
  const tono: TonoMargen = ganancia < 0 ? "pierdes" : cuenta.margenPorMil < MARGEN_MINIMO * 1000 ? "bajo" : "normal";
  // El signo menos de verdad (−), no el guion: «Pierdes S/ 6 · −20 %».
  const r = Math.round(pct);
  const pctTexto = `${r < 0 ? "−" : ""}${Math.abs(r)} %`;
  const enSoles = `${ganancia < 0 ? "Pierdes" : "Ganas"} ${soles(ganancia)}`;
  return { ganancia, pct, tono, enSoles, texto: `${enSoles} · ${pctTexto}` };
}

/**
 * ¿La compra de este envío trae factura? Con papeles anotados, solo si TODOS son factura (uno con boleta y otro con factura no se puede repartir
 * por línea: se toma el que no infla). Sin papeles, como Compras al armar la orden: se supone factura si todos sus proveedores tienen RUC. Sin
 * proveedores conocidos, no.
 */
export function facturaDelEnvio(papeles: readonly { tipo: string | null }[], rucsDeProveedores: readonly (string | null | undefined)[]): boolean {
  if (papeles.length > 0) return papeles.every((p) => p.tipo === "factura");
  return rucsDeProveedores.length > 0 && rucsDeProveedores.every((r) => typeof r === "string" && r.trim() !== "");
}
