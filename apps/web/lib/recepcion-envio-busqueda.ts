import type { EnvioPorAbrir, OrdenDirecta } from "./recepcion-envio-reglas";
import { ESTADO_ENVIO } from "./ordenes-compra-reglas";

// El buscador de «Envíos por recibir en esta sede»: con muchos envíos en la lista, quien recibe escribe lo que tiene en la mano (el número del
// envío, el de la guía que vino en el paquete, el proveedor, la marca, la orden de compra o su estado) y la lista se queda con lo que coincide. Es lógica
// pura: la pantalla solo la llama.

/** Sin tildes ni mayúsculas, como buscan los combos (ADR-0209). */
export function normalizarBusqueda(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Todo lo que se puede escribir para encontrar un envío, junto y normalizado. `proveedorSinAviso`: de quién es uno que llegó sin aviso. */
export function textoBuscableDeEnvio(e: EnvioPorAbrir, proveedorSinAviso: string | null = null): string {
  const partes = [e.numero, e.numeroGuia, ...e.proveedores, ...e.marcas, ...e.ordenes, proveedorSinAviso, ESTADO_ENVIO[e.estado].texto];
  return normalizarBusqueda(partes.filter(Boolean).join(" "));
}

export function textoBuscableDeOrden(o: OrdenDirecta): string {
  return normalizarBusqueda([o.numero, o.proveedor, ...o.marcas, "sin guia"].filter(Boolean).join(" "));
}

/** Cada palabra escrita tiene que estar en algún lugar del texto: «andina 251» encuentra ENV-000251 de Textiles Andina. */
export function coincideConBusqueda(textoBuscable: string, busqueda: string): boolean {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
  return palabras.every((p) => textoBuscable.includes(p));
}

export type FilaPorRecibir = { tipo: "envio"; envio: EnvioPorAbrir } | { tipo: "orden"; orden: OrdenDirecta };

/** Cuándo salió un envío, en milisegundos; `null` si no se sabe (la base no lo mandó o no se lee) o si todavía no salió (una orden sin guía
 *  no tiene envío): sin fecha va AL FINAL de la lista, nunca arriba como «el más nuevo». */
function salioEn(f: FilaPorRecibir): number | null {
  if (f.tipo !== "envio" || !f.envio.despachadoEn) return null;
  const t = Date.parse(f.envio.despachadoEn);
  return Number.isNaN(t) ? null : t;
}

/** El orden de la lista de envíos por recibir (Felipe 2026-11-17: «los últimos envíos deben estar arriba que los antiguos»): UNA sola lista,
 *  del envío que salió más recientemente al más antiguo, sin grupos. Hasta ese día iba por grupos (lo abierto, lo que va en camino, las
 *  órdenes sin guía y, al fondo, lo que esta cuenta no puede recibir) y, dentro de cada uno, del más antiguo al más nuevo: un envío de hoy
 *  quedaba debajo de uno abierto hace ocho días. Lo que no tiene fecha (una orden sin guía, o un envío cuya fecha la base no mandó) va AL
 *  FINAL; a igual fecha —o sin ella— queda el orden en que llegó de la base (por número). Lo que esta cuenta no puede recibir (hizo la
 *  orden) ya no se manda al fondo: su fila lo dice. */
export function ordenarFilasPorRecibir(envios: readonly EnvioPorAbrir[], ordenes: readonly OrdenDirecta[]): FilaPorRecibir[] {
  const filas: FilaPorRecibir[] = [...envios.map((envio) => ({ tipo: "envio" as const, envio })), ...ordenes.map((orden) => ({ tipo: "orden" as const, orden }))];
  return filas
    .map((fila, i) => ({ fila, i, t: salioEn(fila) }))
    .sort((a, b) => (a.t === b.t ? 0 : a.t === null ? 1 : b.t === null ? -1 : b.t - a.t) || a.i - b.i)
    .map((f) => f.fila);
}
