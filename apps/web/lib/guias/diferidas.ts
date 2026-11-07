// Las guías interactivas se descargan aparte (ADR-0623, Felipe 2026-11-07). El registro (`registro.ts` y sus 79 guías en
// `pantallas/`) es casi todo texto, y viajaba con cada pantalla del ERP aunque nadie abriera una demo. Ahora es un trozo propio
// que se pide una sola vez: cuando la pantalla ya está lista (para ofrecer la guía de la primera visita) o al abrir algo que lo
// necesita. Mientras no llega, quien pregunta recibe `null` y se comporta como una pantalla sin guía.
import type { Guia } from "./tipos";

let cargadas: readonly Guia[] | null = null;
let pedido: Promise<readonly Guia[]> | null = null;

/** Pide el registro (una sola vez) y devuelve sus guías. */
export function cargarGuias(): Promise<readonly Guia[]> {
  pedido ??= import("./registro").then((m) => (cargadas = m.GUIAS));
  return pedido;
}

/** Las guías, si ya llegaron; si no, `null`. */
export function guiasCargadas(): readonly Guia[] | null {
  return cargadas;
}
