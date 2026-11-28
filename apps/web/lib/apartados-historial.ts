import type { Apartado } from "./separaciones-reglas";

/**
 * Cómo sale cada apartado en el «Historial» (ADR-0720): solo lo terminado, entregado o devuelto, con su comprobante, su monto y
 * «Reimprimir». Lo vivo (abierto, o cancelado con el adelanto por devolver) está en «Pendientes» y nunca sale aquí. Sin «·» (ADR-0716):
 * cada dato dice qué es («boleta B001-00001251», «S/149.70 pagado»).
 */
export type ComoSeHistorial = {
  insignia: "Entregado" | "Devuelto";
  /** La línea bajo la insignia: con qué comprobante salió («boleta» y su número, aparte para que no se parta en dos líneas), o la nota de
   *  crédito de un devuelto. `null` si no hay nada que decir. */
  debajo: { que: string; numero: string } | null;
  /** Lo que se movió: el total que pagó al llevárselo, o el adelanto que se le devolvió. */
  monto: number;
  montoDice: "pagado" | "devuelto";
};

/** Lo que va en el Historial: lo entregado y lo devuelto. */
export const enHistorial = (a: Pick<Apartado, "estado">) => a.estado === "entregada" || a.estado === "devuelta";

/** Qué comprobante es, por su serie: la de una factura empieza con F y la de una boleta con B (SUNAT). */
export function queComprobante(numero: string): "boleta" | "factura" | "comprobante" {
  const n = numero.trim();
  if (/^F/i.test(n)) return "factura";
  if (/^B/i.test(n)) return "boleta";
  return "comprobante";
}

export function comoSeHistorial(a: Pick<Apartado, "estado" | "total" | "adelanto" | "comprobanteFinal" | "comprobanteAnticipo" | "notaCredito">): ComoSeHistorial {
  if (a.estado === "devuelta") {
    return { insignia: "Devuelto", debajo: a.notaCredito ? { que: "nota de crédito", numero: a.notaCredito.trim() } : null, monto: a.adelanto, montoDice: "devuelto" };
  }
  // Entregado: la boleta o factura por el total (ADR-0399); los apartados de antes de la constancia, su boleta de anticipo.
  const numero = a.comprobanteFinal ?? a.comprobanteAnticipo;
  return { insignia: "Entregado", debajo: numero ? { que: queComprobante(numero), numero: numero.trim() } : null, monto: a.total, montoDice: "pagado" };
}

/** El orden de fábrica: lo más reciente arriba (por el día en que se apartó, el mismo que acota el período). */
export function ordenHistorial<A extends Pick<Apartado, "creadaEn" | "codigo">>(apartados: readonly A[]): A[] {
  return [...apartados].sort((x, y) => y.creadaEn.localeCompare(x.creadaEn) || y.codigo.localeCompare(x.codigo));
}

/**
 * Lo que dice el Historial cuando lo buscado no está, y adónde lleva. El puente solo se ofrece si lleva a algo: si lo buscado sigue vivo,
 * a «Pendientes» (ahí está); si no, a todo el historial (lo de antes de los 30 días no se leyó); y si ya se buscó en todo, a ningún lado.
 */
export type SalidaDeBusqueda = { texto: string; accion: { texto: string; a: "pendientes" | "todo" } | null };

export function salidaDeBusqueda({ q, hayEnPendientes, todoElHistorial }: { q: string; hayEnPendientes: boolean; todoElHistorial: boolean }): SalidaDeBusqueda {
  if (hayEnPendientes) return { texto: `Nadie con «${q}» en Historial.`, accion: { texto: "Búscalo en Pendientes", a: "pendientes" } };
  if (!todoElHistorial) return { texto: `Nadie con «${q}» en los últimos 30 días.`, accion: { texto: "Buscar en todo el historial", a: "todo" } };
  return { texto: `Nadie con «${q}» en Historial.`, accion: null };
}
