import type { EnvioPorAbrir, OrdenDirecta } from "./recepcion-envio-reglas";
import { ESTADO_ENVIO } from "./ordenes-compra-reglas";

// El buscador de «Envíos por recibir en esta sede»: con muchos envíos en la lista, quien recibe escribe lo que tiene en la mano (el número del
// envío, el de la guía que vino en el paquete, el proveedor, la orden de compra o su estado) y la lista se queda con lo que coincide. Es lógica
// pura: la pantalla solo la llama.

/** Sin tildes ni mayúsculas, como buscan los combos (ADR-0209). */
export function normalizarBusqueda(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Todo lo que se puede escribir para encontrar un envío, junto y normalizado. `proveedorSinAviso`: de quién es uno que llegó sin aviso. */
export function textoBuscableDeEnvio(e: EnvioPorAbrir, proveedorSinAviso: string | null = null): string {
  const partes = [e.numero, e.numeroGuia, ...e.proveedores, ...e.ordenes, proveedorSinAviso, ESTADO_ENVIO[e.estado].texto];
  return normalizarBusqueda(partes.filter(Boolean).join(" "));
}

export function textoBuscableDeOrden(o: OrdenDirecta): string {
  return normalizarBusqueda([o.numero, o.proveedor, "sin guia"].filter(Boolean).join(" "));
}

/** Cada palabra escrita tiene que estar en algún lugar del texto: «andina 251» encuentra ENV-000251 de Textiles Andina. */
export function coincideConBusqueda(textoBuscable: string, busqueda: string): boolean {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
  return palabras.every((p) => textoBuscable.includes(p));
}
