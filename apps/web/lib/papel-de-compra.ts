// El papel de una compra (factura, boleta, nota de venta o nada) y dónde se guarda su foto.
//
// Vive solo, sin importar nada (ADR-0674, actividad 7): Recibir muestra los papeles de lo comprado desde el celular y, por importar esto de
// `compra-rapida-reglas.ts`, bajaba las reglas de «Compré ropa» enteras. `compra-rapida-reglas.ts` lo sigue exportando.

/** La carpeta de las fotos de los papeles dentro del depósito de las fotos de los gastos del viaje (la base exige que la ruta empiece así). */
export const CARPETA_PAPELES = "papeles/";

export type TipoPapel = "factura" | "boleta" | "nota_venta" | "sin_comprobante";

/** Qué le dio el proveedor, en palabras de la tienda, con su ayuda. */
export const TIPOS_PAPEL: Record<TipoPapel, { nombre: string; ayuda: string }> = {
  factura: { nombre: "Factura", ayuda: "Con RUC" },
  boleta: { nombre: "Boleta", ayuda: "Con número" },
  nota_venta: { nombre: "Nota de venta", ayuda: "Papel simple" },
  sin_comprobante: { nombre: "Sin papel", ayuda: "No me dieron nada" },
};
