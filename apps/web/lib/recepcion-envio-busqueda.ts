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

export type FilaPorRecibir = { tipo: "envio"; envio: EnvioPorAbrir } | { tipo: "orden"; orden: OrdenDirecta };

/** El orden de la lista de envíos por recibir, en una sola lista: primero lo que hay que SEGUIR recibiendo (abiertos por alguien y que esta
 *  cuenta puede continuar), después los envíos en camino, después las órdenes sin guía, y AL ÚLTIMO lo que esta cuenta no puede recibir
 *  (hizo la orden). Dentro de cada grupo, el orden en que llegó de la base. */
export function ordenarFilasPorRecibir(envios: readonly EnvioPorAbrir[], ordenes: readonly OrdenDirecta[]): FilaPorRecibir[] {
  const filas: { fila: FilaPorRecibir; rango: number }[] = [
    ...envios.map((envio) => ({ fila: { tipo: "envio" as const, envio }, rango: envio.creadoPorMi ? 3 : envio.estado === "abierto" ? 0 : 1 })),
    ...ordenes.map((orden) => ({ fila: { tipo: "orden" as const, orden }, rango: orden.creadaPorMi ? 4 : 2 })),
  ];
  return filas.map((f, i) => ({ ...f, i })).sort((a, b) => a.rango - b.rango || a.i - b.i).map((f) => f.fila);
}
