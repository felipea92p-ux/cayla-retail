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

/** «+ Nueva cliente»: el ticket de la caja se queda en su lugar y la caja abre uno vacío al final. */
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

/** Descartar uno que espera: sale de la fila y la caja conserva su hueco. */
export function quitarDeLaEspera<T extends { id: string }>(
  enEspera: readonly T[],
  posActivo: number | null,
  id: string,
): { espera: T[]; posActivo: number | null } {
  const i = enEspera.findIndex((t) => t.id === id);
  if (i < 0) return { espera: [...enEspera], posActivo };
  const p = posicionDelActivo(posActivo, enEspera.length);
  return { espera: enEspera.filter((t) => t.id !== id), posActivo: posActivo === null ? null : i < p ? p - 1 : p };
}

/** Cuánto espera un ticket antes de que su pestaña pida que se acuerden de él (Felipe, 2026-10-25). Un probador tarda 5–10 min:
 *  antes sería ruido (con varias clientas esperando, todas latiendo a la vez no avisan de ninguna). */
const MINUTOS_PARA_RECORDAR = 5;

/**
 * ¿Lleva este ticket tanto rato esperando que conviene recordarlo? Solo cuenta el que ESPERA (`creadoEn` = cuándo se dejó): el de la
 * caja lo está mirando la cajera. Una fecha ausente, rota o del futuro no recuerda nada: peor un aviso falso que ninguno.
 */
export function ticketOlvidado(creadoEn: string | null, ahora: number): boolean {
  if (!creadoEn) return false;
  const desde = Date.parse(creadoEn);
  return Number.isFinite(desde) && ahora - desde >= MINUTOS_PARA_RECORDAR * 60_000;
}

/** ¿Puede abrirse otro ticket? El de la caja cuenta: con 9 abiertos no cabe uno más. */
export function cabeOtroTicket(enEspera: number): boolean {
  return enEspera + 1 < TOPE_TICKETS_ABIERTOS;
}
