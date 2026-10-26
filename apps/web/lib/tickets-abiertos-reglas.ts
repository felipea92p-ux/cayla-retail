/**
 * Varios tickets abiertos a la vez en un mismo equipo (Felipe 2026-10-25, «varias ventas a la vez», paso 1).
 *
 * Hasta hoy el Punto de venta tenía UN ticket en la caja y una «espera» que casi nadie conocía. Ahora la caja muestra una
 * pestaña por cliente: la que está en la caja y las que esperan. Por debajo sigue siendo lo mismo (un ticket vivo en la pantalla y
 * una lista guardada en el navegador); este archivo solo decide CÓMO SE VEN y en qué ORDEN, para que pasar de una cliente a otra
 * no mueva las demás.
 *
 * El ticket de la caja ocupa un hueco (`posActivo`) entre los que esperan. `null` = al final, que es donde nace un ticket
 * nuevo. Cambiar de pestaña intercambia los dos tickets SIN mover a los otros: cada pestaña queda donde la cajera la dejó, y lo
 * único que se mueve es cuál está marcada.
 */
import { NOMBRE_ESPERA_MAX, nombreDeEspera } from "./vender-hoy-reglas";
import { totalDeLineas } from "./vender-reglas";

/** Cuántos tickets puede tener abiertos un equipo a la vez, contando el de la caja (Felipe, 2026-10-25: 9). */
export const TOPE_TICKETS_ABIERTOS = 9;

type Linea = { cantidad: number; precioUnitario: number; descuentoUnitario: number };

/** El nombre automático de un ticket nuevo: «Cliente 1», «Cliente 2»… el primero que nadie esté usando. Sin distinguir
 *  mayúsculas ni espacios de sobra: uno que alguien escribió como «cliente 2» ocupa ese número igual. */
export function siguienteNombreDeCliente(ocupados: readonly (string | undefined | null)[]): string {
  const usados = new Set(ocupados.map((n) => (n ?? "").trim().toLowerCase()).filter(Boolean));
  for (let n = 1; ; n++) if (!usados.has(`cliente ${n}`)) return `Cliente ${n}`;
}

/** El nombre con que se ve el ticket de la caja: el que le puso la cajera, o el siguiente «Cliente N» libre. */
export function nombreDelTicketActivo(nombre: string, enEspera: readonly { nombre?: string }[]): string {
  return nombre.trim().slice(0, NOMBRE_ESPERA_MAX) || siguienteNombreDeCliente(enEspera.map((t) => t.nombre));
}

/** Dónde se dibuja el ticket de la caja entre los que esperan, siempre dentro del rango (la espera cambia por otros caminos:
 *  se carga del navegador, se descarta uno, llega el de otra sede). */
export function posicionDelActivo(posActivo: number | null, enEspera: number): number {
  return posActivo === null ? enEspera : Math.max(0, Math.min(Math.trunc(posActivo), enEspera));
}

export type PestanaDeTicket = {
  /** El id del ticket en espera, o `null` para el que está en la caja. */
  id: string | null;
  nombre: string;
  total: number;
  prendas: number;
  esActivo: boolean;
  /** Cuándo se dejó en espera (para decir «hace 12 min»); `null` en el ticket de la caja, que está vivo. */
  creadoEn: string | null;
};

/** Las pestañas, en el orden en que se ven: la espera con el ticket de la caja en su hueco. */
export function pestanasDeTickets<T extends { id: string; nombre?: string; creadoEn: string; carrito: readonly Linea[] }>(
  enEspera: readonly T[],
  posActivo: number | null,
  activo: { nombre: string; carrito: readonly Linea[] },
): PestanaDeTicket[] {
  const pestanas: PestanaDeTicket[] = enEspera.map((t, i) => ({
    id: t.id,
    nombre: nombreDeEspera(t.nombre, i),
    total: totalDeLineas(t.carrito),
    prendas: t.carrito.reduce((acc, l) => acc + l.cantidad, 0),
    esActivo: false,
    creadoEn: t.creadoEn,
  }));
  pestanas.splice(posicionDelActivo(posActivo, enEspera.length), 0, {
    id: null,
    nombre: nombreDelTicketActivo(activo.nombre, enEspera),
    total: totalDeLineas(activo.carrito),
    prendas: activo.carrito.reduce((acc, l) => acc + l.cantidad, 0),
    esActivo: true,
    creadoEn: null,
  });
  return pestanas;
}

/** «Dejar en espera»: el ticket de la caja se queda en su lugar y la caja abre uno vacío al final. */
export function abrirNuevoTicket<T>(enEspera: readonly T[], posActivo: number | null, actual: T): { espera: T[]; posActivo: null } {
  const espera = [...enEspera];
  espera.splice(posicionDelActivo(posActivo, enEspera.length), 0, actual);
  return { espera, posActivo: null };
}

const CAJA = Symbol("ticket de la caja");
const VACIO = Symbol("ticket vacío de la caja");

/**
 * Pasar a otra pestaña: el ticket de la caja y el elegido se intercambian de lugar en la fila, y nadie más se mueve.
 * `actual` es el ticket de la caja ya armado para guardar, o `null` si estaba vacío (un ticket vacío no se guarda: desaparece
 * de la fila en vez de quedar como una pestaña muerta). `null` si el id ya no está en la espera.
 */
export function pasarAlTicket<T extends { id: string }>(
  enEspera: readonly T[],
  posActivo: number | null,
  actual: T | null,
  id: string,
): { espera: T[]; posActivo: number; objetivo: T } | null {
  const objetivo = enEspera.find((t) => t.id === id);
  if (!objetivo) return null;
  // La fila tal como se ve, con el hueco del ticket de la caja.
  const fila: (T | typeof CAJA | typeof VACIO)[] = [...enEspera];
  fila.splice(posicionDelActivo(posActivo, enEspera.length), 0, CAJA);
  const de = fila.indexOf(CAJA);
  const a = fila.indexOf(objetivo);
  fila[de] = actual ?? VACIO;
  fila[a] = CAJA;
  const sinVacio = fila.filter((x) => x !== VACIO);
  return {
    espera: sinVacio.filter((x): x is T => x !== CAJA),
    posActivo: sinVacio.indexOf(CAJA),
    objetivo,
  };
}

/**
 * Los nombres de los tickets que ESPERAN y llevan la misma prenda que una línea del ticket de la caja, pero solo cuando entre todos
 * piden más de lo que hay (Felipe, 2026-10-25, pregunta 9: «el primero que cobra se la lleva»; no se reserva nada). Con stock para
 * todos no hay nada que decir: avisar de cada prenda repetida sería ruido, y repetir una prenda en dos tickets es normal (dos clientas
 * piden la misma blusa). Vacío = nada que avisar.
 *
 * `hay` es lo que la pantalla sabe del piso de esta sede para esa prenda (`stockAqui`); la base tiene la última palabra al cobrar.
 */
export function ticketsQueDisputanLaPrenda(
  varianteId: string,
  cantidadAqui: number,
  hay: number,
  enEspera: readonly { nombre?: string; carrito: readonly { varianteId: string; cantidad: number }[] }[],
): string[] {
  const otros = enEspera.flatMap((t, i) => {
    const cantidad = t.carrito.filter((l) => l.varianteId === varianteId).reduce((acc, l) => acc + l.cantidad, 0);
    return cantidad > 0 ? [{ nombre: nombreDeEspera(t.nombre, i), cantidad }] : [];
  });
  if (otros.length === 0) return [];
  const pedido = cantidadAqui + otros.reduce((acc, o) => acc + o.cantidad, 0);
  return pedido > hay ? otros.map((o) => o.nombre) : [];
}

/** Lo que dice el aviso de la línea: dónde más está la prenda y cuánto queda. «Ya está en el ticket de Cliente 1, y solo queda 1.» */
export function textoDePrendaEnOtroTicket(nombres: readonly string[], hay: number): string {
  const donde = nombres.length === 1 ? `el ticket de ${nombres[0]}` : `los tickets de ${new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(nombres)}`;
  const queda = hay <= 0 ? "y ya no queda" : hay === 1 ? "y solo queda 1" : `y solo quedan ${hay}`;
  return `Ya está en ${donde}, ${queda}.`;
}

/** ¿Puede abrirse otro ticket? El de la caja cuenta: con 9 abiertos no cabe uno más. */
export function cabeOtroTicket(enEspera: number): boolean {
  return enEspera + 1 < TOPE_TICKETS_ABIERTOS;
}
