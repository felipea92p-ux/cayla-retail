// «Agregar bolsa» en Vender (Bolsas de despacho, 2026-10-10): las bolsas se venden como cualquier producto, pero se piden en un toque.
// Una bolsa es lo que vive en una familia FUERA de los motores (`familias.entra_a_motores = false`, la familia «Empaque»): la papel
// pequeña (S/ 0.50), la papel grande (S/ 1.20), la de TNT (S/ 3.90) y la de obsequio (S/ 0.00). Nada de aquí inventa un precio ni un
// stock: la caja ofrece lo que el catálogo y la tienda tienen, con el precio de ESTA tienda.
//
// CONTRATO
//   PROMETE: elegir las bolsas de la lista de prendas de la caja, ordenarlas de la más barata a la más cara y decir en palabras de tienda
//            cuánto cuesta y cuántas lleva ya el ticket.
//   ASUME:   cada prenda trae `fueraDeMotores` (la página de Vender la marca desde `familias`); una que no lo trae NO es bolsa.
//   NO HACE: no agrega nada al ticket (lo hace `agregar()` de la caja, con su stock y su tope) ni toca precios o comprobantes.

/** Lo mínimo que se necesita de una prenda de la caja para tratarla como bolsa (la `VarianteBusqueda` de Vender cumple de sobra). */
export type PrendaDeCaja = {
  varianteId: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number;
  /** La familia de su categoría está apagada para los motores: bolsas, cajas, empaque. Ausente = es una prenda normal. */
  fueraDeMotores?: boolean;
};

/** Las bolsas de la caja, de la más barata a la más cara (la de obsequio primero) y, a igual precio, por nombre. */
export function bolsasDeLaCaja<T extends PrendaDeCaja>(prendas: readonly T[]): T[] {
  return prendas
    .filter((p) => p.fueraDeMotores === true)
    .sort((a, b) => a.precio - b.precio || a.referencia.localeCompare(b.referencia, "es") || a.varianteId.localeCompare(b.varianteId));
}

/** Cuánto cuesta, como lo lee la colaboradora: «S/ 0.50», y «Obsequio» cuando se regala (precio 0). */
export function precioDeBolsa(precio: number): string {
  return precio === 0 ? "Obsequio" : `S/ ${precio.toFixed(2)}`;
}

/** El nombre de la bolsa: su modelo y, si los tiene, su talla y su color («Bolsa de papel CAYLA · Grande»). */
export function nombreDeBolsa(p: Pick<PrendaDeCaja, "referencia" | "talla" | "color">): string {
  return [p.referencia, p.talla, p.color].filter(Boolean).join(" · ");
}

/** Cuántas de esta bolsa lleva ya el ticket (0 si ninguna). */
export function bolsasEnElTicket(carrito: readonly { varianteId: string; cantidad: number }[], varianteId: string): number {
  return carrito.filter((l) => l.varianteId === varianteId).reduce((acc, l) => acc + l.cantidad, 0);
}

/** Cuántas bolsas, en total, lleva el ticket (para el resumen de la fila «Bolsa»). */
export function totalBolsasEnElTicket(carrito: readonly { varianteId: string; cantidad: number }[], bolsas: readonly { varianteId: string }[]): number {
  const ids = new Set(bolsas.map((b) => b.varianteId));
  return carrito.filter((l) => ids.has(l.varianteId)).reduce((acc, l) => acc + l.cantidad, 0);
}
