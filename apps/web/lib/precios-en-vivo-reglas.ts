// Reglas puras de `usePreciosEnVivo.ts`, aparte por la misma razón que `stock-en-vivo-reglas.ts`: el hook importa
// `@/lib/supabase/client`, y esa cadena no se prueba con Vitest. Lo puro se prueba acá.
//
// EL PROBLEMA (Felipe, 2026-10-08): con Vender abierta, cambió el precio de una prenda y le quitó una etiqueta de
// descuento desde otra pestaña, y la caja siguió mostrando el precio y el descuento de antes. Vender lee el catálogo
// y las campañas UNA vez al abrir; el stock ya se relee cada 10 s (`useStockEnVivo`), el precio no. La base nunca
// cobró mal —`registrar_venta` rechaza con `venta_precio_cambiado` o `venta_campana_no_vigente`—, pero la cajera se
// enteraba al cobrar, con el cliente delante, y tenía que recargar.

import { conCampanas, esDescuentoDeCampana, type CampanaLinea } from "./vender-reglas";

/** Lo releído de la base: el precio de etiqueta de cada prenda y la campaña que rige hoy por prenda. `campanas` es
 *  `null` si esa lectura falló: la pantalla se queda con las campañas que ya mostraba (nunca las borra por un error). */
export type PreciosReleidos = {
  precios: Map<string, number>;
  campanas: Map<string, CampanaLinea> | null;
  /** Las prendas cuyo precio de `precios` es el de ESTA tienda (precio propio, Felipe 2026-10-09). Ausente: no se sabe y cada
   *  prenda conserva su marca. */
  propios?: Set<string> | null;
};

function mismaCampana(a: CampanaLinea | null | undefined, b: CampanaLinea | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.etiquetaId === b.etiquetaId && a.pct === b.pct && a.nombre === b.nombre;
}

/** ¿Dos lecturas dicen lo mismo? Evita repintar la grilla entera cada 10 s cuando nadie tocó nada. */
export function mismosPrecios(a: PreciosReleidos, b: PreciosReleidos): boolean {
  if (a.precios.size !== b.precios.size) return false;
  for (const [k, v] of a.precios) if (b.precios.get(k) !== v) return false;
  if (a.campanas === null || b.campanas === null) return a.campanas === b.campanas;
  if (a.campanas.size !== b.campanas.size) return false;
  for (const [k, v] of a.campanas) if (!mismaCampana(v, b.campanas.get(k))) return false;
  return true;
}

/** Las prendas de la grilla y del buscador con el precio y la campaña de AHORA. Una prenda que la lectura no trajo
 *  conserva su precio (no se inventa un 0); sin campañas releídas, conserva la suya. Devuelve el MISMO arreglo si nada
 *  cambió, para no recalcular lo que depende de él. */
export function conPreciosAlDia<V extends { varianteId: string; precio: number; campana?: CampanaLinea | null; precioDeSede?: boolean }>(
  variantes: V[],
  releido: PreciosReleidos | null,
): V[] {
  if (!releido) return variantes;
  let cambio = false;
  const nuevas = variantes.map((v) => {
    const precio = releido.precios.get(v.varianteId) ?? v.precio;
    const campana = releido.campanas ? (releido.campanas.get(v.varianteId) ?? null) : (v.campana ?? null);
    const precioDeSede = releido.propios ? releido.propios.has(v.varianteId) : v.precioDeSede;
    if (precio === v.precio && mismaCampana(campana, v.campana) && Boolean(precioDeSede) === Boolean(v.precioDeSede)) return v;
    cambio = true;
    return { ...v, precio, campana, precioDeSede };
  });
  return cambio ? nuevas : variantes;
}

type LineaDelTicket = {
  claveLinea: string;
  varianteId: string;
  referencia: string;
  precioUnitario: number;
  descuentoUnitario: number;
  razonDescuento: string;
  razonDescuentoOtro: string;
  argumentoDescuento: string;
  campana?: CampanaLinea | null;
  prendaLibre?: unknown;
};

/**
 * El ticket que ya está armado, con el precio y la campaña de AHORA — lo que la base va a exigir al cobrar.
 * · Línea sin descuento o con el de campaña: toma el precio nuevo y su campaña se re-evalúa (`conCampanas`, la misma
 *   regla que al retomar un ticket en espera). Va en `cambiaron` si su total por unidad cambió.
 * · Línea con un descuento puesto a mano o el de una proforma: NO se toca su precio. Ese descuento es un monto que
 *   alguien decidió sobre el precio de antes; recalcularlo en silencio podría cobrarle al cliente más de lo prometido.
 *   Va en `porRevisar`: la cajera la quita y la vuelve a agregar (la base la rechazaría igual).
 * · «Prenda sin registrar»: su precio lo puso la caja, no el catálogo; no se toca.
 * Devuelve el MISMO carrito si nada cambió.
 */
export function ticketConPreciosAlDia<L extends LineaDelTicket>(
  carrito: L[],
  releido: PreciosReleidos,
): { carrito: L[]; cambiaron: string[]; porRevisar: string[] } {
  const cambiaron: string[] = [];
  const porRevisar: string[] = [];
  let cambio = false;
  const nuevo = carrito.map((l) => {
    if (l.prendaLibre) return l;
    const precio = releido.precios.get(l.varianteId);
    const precioCambio = precio !== undefined && precio !== l.precioUnitario;
    const conDescuentoAMano = l.descuentoUnitario > 0 && !esDescuentoDeCampana(l);
    if (conDescuentoAMano) {
      if (precioCambio) porRevisar.push(l.referencia);
      // Sin cambio de precio, la campaña igual se re-evalúa: `conCampanas` respeta el descuento a mano mayor.
      if (!releido.campanas) return l;
    }
    const conPrecio = precioCambio && !conDescuentoAMano ? { ...l, precioUnitario: precio } : l;
    const campanas = releido.campanas ?? new Map(l.campana ? [[l.varianteId, l.campana] as const] : []);
    const [linea] = conCampanas([conPrecio], campanas);
    const antes = l.precioUnitario - l.descuentoUnitario;
    const ahora = linea.precioUnitario - linea.descuentoUnitario;
    if (antes !== ahora) cambiaron.push(l.referencia);
    if (linea.precioUnitario === l.precioUnitario && linea.descuentoUnitario === l.descuentoUnitario && mismaCampana(linea.campana, l.campana) && linea.razonDescuento === l.razonDescuento) {
      return l;
    }
    cambio = true;
    return linea;
  });
  return { carrito: cambio ? nuevo : carrito, cambiaron, porRevisar };
}
