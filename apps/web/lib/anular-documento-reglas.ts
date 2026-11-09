// Deshacer un pago a proveedor o el papel de un gasto (tarea 21 de «Las 36»; Felipe 2026-11-06: se puede, con motivo y con su mes abierto). La base lo vuelve a exigir todo
// (`anular_pago_compra`, `quitar_comprobante_de_gasto`): aquí solo se decide qué se ofrece y cómo se dice.

import { esDelViaje } from "./gastos-corregir-reglas";
import type { CampoDeGuia } from "./guia-campos";

export const RPC_ANULAR_PAGO = "anular_pago_compra";
export const RPC_QUITAR_COMPROBANTE = "quitar_comprobante_de_gasto";
/** @internal El mínimo que pide la base: tres letras. */
export const MOTIVO_MINIMO = 3;
export const MAX_MOTIVO = 300;

/** El motivo, como lo pide la base: sin él no se anula nada. */
export function camposDelMotivo(motivo: string, que: string): CampoDeGuia[] {
  return [{ id: "motivo", nombre: "Motivo", requerido: true, hecho: motivo.trim().length >= MOTIVO_MINIMO, pendiente: `Escribe por qué ${que}.` }];
}

/**
 * Un gasto con comprobante al contado (o con el papel que llegó con su mes cerrado) puede volver a «sin comprobante». A crédito, con notas o del viaje, no: eso se corrige en Compras.
 * `papelTardio` lo pone la lista cuando el papel vive aparte (tarea 20).
 */
export function puedeQuitarComprobante(g: { estado: string; categoria: string; compraId: string | null; condicion: "contado" | "credito" | null; papelTardio?: boolean }): boolean {
  if (g.estado !== "vigente" || esDelViaje(g.categoria)) return false;
  return Boolean(g.papelTardio) || (Boolean(g.compraId) && g.condicion === "contado");
}

/** Lo que pasa al quitarlo, en palabras de la tienda. */
export function loQuePasaAlQuitar(g: { papelTardio?: boolean }): string {
  return g.papelTardio
    ? "El comprobante queda anulado, con este motivo, y su IGV deja de descontarse. El gasto no cambia: puedes agregarle el comprobante correcto."
    : "El gasto vuelve a «Sin comprobante», con su pago de antes, y el comprobante queda anulado en Compras con este motivo. Puedes agregarle el correcto.";
}
