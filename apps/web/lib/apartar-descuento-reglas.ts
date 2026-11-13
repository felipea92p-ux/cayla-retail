// El descuento a mano al apartar (ADR-0584, Felipe 2026-10-30): «al momento de separar una prenda, que permita aplicar descuentos
// también como en la venta». Sin React ni red.
//
// CONTRATO
//   PROMETE: las MISMAS cuentas del ticket de Vender (`vender-reglas.ts`): el % sin céntimos sueltos, el monto en S/ repartido entre lo
//            elegido según su precio, un solo descuento por prenda (el mayor: si la campaña da igual o más, gana la campaña), y el
//            argumento escrito pasado el 15 %. Lo que manda a `separar_prendas` es lo que la base vuelve a exigir con
//            `retail.fn_exigir_descuento_manual` (motivo de la lista, argumento, nunca bajo el costo, mayor que la campaña).
//   ASUME:   Apartar junta las unidades de una misma prenda en UNA línea (la base agrupa por variante): la clave de la línea es la
//            variante y el descuento se guarda por variante, por unidad.
//   NO HACE: no sabe el costo de la prenda (la pantalla no lo tiene): «bajo el costo» lo dice la base al apartar.

import {
  RAZON_CAMPANA,
  aplicarDescuento,
  aplicarDescuentoMonto,
  descuentoResultante,
  conDescuentoDeCampana,
  necesitaArgumentoEscrito,
  type CampanaLinea,
  type DetalleDescuento,
  type ModoDescuento,
} from "./vender-reglas";

/** Un descuento puesto a mano en una prenda del apartado: por unidad, con su motivo y su argumento (como `venta_items`). */
export type DescuentoManual = { unitario: number; razon: string; razonOtro: string; argumento: string };

/** Los descuentos a mano del apartado, por variante. Una prenda sin entrada lleva solo su campaña (o nada). */
export type DescuentosDelApartado = Readonly<Record<string, DescuentoManual>>;

/** Lo que Apartar sabe de una prenda para descontarla: su precio de hoy en esta sede y su campaña. */
export type PrendaDescontable = { varianteId: string; precio: number; campana?: CampanaLinea | null };

/** Una línea del apartado con el descuento que de verdad lleva: la forma de las líneas del ticket de Vender. */
export type LineaDescontada = {
  claveLinea: string;
  varianteId: string;
  cantidad: number;
  precioUnitario: number;
  descuentoUnitario: number;
  razonDescuento: string;
  razonDescuentoOtro: string;
  argumentoDescuento: string;
  campana: CampanaLinea | null;
};

/** La línea con su descuento vigente: el puesto a mano si supera a la campaña por más de un céntimo; si no, la campaña (o nada). */
export function lineaDescontada(prenda: PrendaDescontable, cantidad: number, manual?: DescuentoManual | null): LineaDescontada {
  const base: LineaDescontada = {
    claveLinea: prenda.varianteId,
    varianteId: prenda.varianteId,
    cantidad,
    precioUnitario: prenda.precio,
    descuentoUnitario: 0,
    razonDescuento: "",
    razonDescuentoOtro: "",
    argumentoDescuento: "",
    campana: prenda.campana ?? null,
  };
  if (manual && manual.unitario > 0) {
    const { monto, prevaleceCampana } = descuentoResultante(base, Math.min(manual.unitario, prenda.precio));
    if (!prevaleceCampana) {
      return { ...base, descuentoUnitario: monto, razonDescuento: manual.razon, razonDescuentoOtro: manual.razonOtro, argumentoDescuento: manual.argumento };
    }
  }
  return conDescuentoDeCampana(base);
}

/** De las líneas ya descontadas, solo lo puesto a mano: lo que se guarda en el estado de Apartar. */
function soloManuales(lineas: readonly LineaDescontada[]): Record<string, DescuentoManual> {
  const out: Record<string, DescuentoManual> = {};
  for (const l of lineas) {
    if (l.descuentoUnitario > 0 && l.razonDescuento !== RAZON_CAMPANA) {
      out[l.varianteId] = { unitario: l.descuentoUnitario, razon: l.razonDescuento, razonOtro: l.razonDescuentoOtro, argumento: l.argumentoDescuento };
    }
  }
  return out;
}

/**
 * Aplica un descuento a las prendas `claves` (variantes) del apartado y devuelve los descuentos a mano que quedan. Las demás conservan
 * el suyo. En % sale del precio de cada prenda; en S/ el monto es del total de lo elegido (como en Vender, Felipe 2026-10-24). Una
 * prenda cuya campaña da igual o más se queda con la campaña: su descuento a mano se va.
 */
export function aplicarAlApartado(
  lineas: readonly LineaDescontada[],
  modo: ModoDescuento,
  valor: number,
  claves: readonly string[],
  detalle: DetalleDescuento,
): Record<string, DescuentoManual> {
  const carrito = [...lineas];
  const elegidas = [...claves];
  const nuevas = modo === "porcentaje" ? aplicarDescuento(carrito, valor, elegidas, detalle) : aplicarDescuentoMonto(carrito, valor, elegidas, detalle);
  return soloManuales(nuevas);
}

/** Quita el descuento a mano de las prendas `claves`: vuelven a su campaña (o a su precio). */
export function quitarDelApartado(descuentos: DescuentosDelApartado, claves: readonly string[]): Record<string, DescuentoManual> {
  return Object.fromEntries(Object.entries(descuentos).filter(([id]) => !claves.includes(id)));
}

/** Los descuentos de las prendas que siguen en el apartado: al quitar una prenda se va su descuento (si vuelve, vuelve sin él). */
export function descuentosVigentes(descuentos: DescuentosDelApartado, varianteIds: readonly string[]): Record<string, DescuentoManual> {
  return Object.fromEntries(Object.entries(descuentos).filter(([id]) => varianteIds.includes(id)));
}

/** Lo que se descuenta en total (campaña y a mano), para la fila sobre el total. */
export function totalDescontado(lineas: readonly LineaDescontada[]): number {
  return lineas.reduce((c, l) => c + l.cantidad * Math.round(l.descuentoUnitario * 100), 0) / 100;
}

/** Lo que viaja por prenda a `separar_prendas` / `editar_separacion`: el descuento y, si es a mano, su motivo y su argumento. */
export function descuentoParaGuardar(l: LineaDescontada): {
  descuento_unitario: number;
  motivo_descuento?: string;
  motivo_descuento_detalle?: string;
  argumento_descuento?: string;
} {
  if (l.descuentoUnitario <= 0 || l.razonDescuento === RAZON_CAMPANA) return { descuento_unitario: l.descuentoUnitario };
  return {
    descuento_unitario: l.descuentoUnitario,
    motivo_descuento: l.razonDescuento,
    motivo_descuento_detalle: l.razonDescuento === "otro" ? l.razonDescuentoOtro || undefined : undefined,
    argumento_descuento: l.argumentoDescuento || undefined,
  };
}

/** ¿El descuento que se está por aplicar pide el argumento escrito en alguna prenda? (donde gana la campaña no cuenta). */
export function pideArgumento(lineas: readonly LineaDescontada[], modo: ModoDescuento, valor: number, claves: readonly string[]): boolean {
  // El motivo no cambia cuánto se descuenta: se prueba sin él.
  const vistas = aplicarAlApartado(lineas, modo, valor, claves, { razon: "", razonOtro: "", argumento: "" });
  return lineas.some((l) => {
    const d = vistas[l.varianteId];
    return d !== undefined && claves.includes(l.varianteId) && necesitaArgumentoEscrito(l.precioUnitario, d.unitario);
  });
}

/** Cómo quedan las líneas si se aplica ahora: para el «Queda S/ …» de la hoja, antes de tocar «Aplicar». */
export function lineasSiSeAplica(
  lineas: readonly LineaDescontada[],
  prendas: ReadonlyMap<string, PrendaDescontable>,
  modo: ModoDescuento,
  valor: number,
  claves: readonly string[],
  detalle: DetalleDescuento,
): LineaDescontada[] {
  const nuevos = aplicarAlApartado(lineas, modo, valor, claves, detalle);
  return lineas.map((l) => {
    const p = prendas.get(l.varianteId);
    if (!p) return l;
    // Las no elegidas conservan lo suyo; las elegidas, lo nuevo (o la campaña, si gana).
    if (!claves.includes(l.varianteId)) return l;
    return lineaDescontada(p, l.cantidad, nuevos[l.varianteId] ?? null);
  });
}
