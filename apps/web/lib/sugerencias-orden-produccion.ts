import type { TipoOrden } from "./modelo-nuevo-orden-reglas";

// El ejemplo de la «Nota» de una orden de producción (ADR-0290: un ejemplo sigue lo que la persona ya eligió). Una producción fabrica un lote; una muestra
// desarrolla un modelo: lo que se anota en cada una es otra cosa. Lógica pura, sin azar ni red; la usa `NuevaOrdenProduccionForm`.

/** Cabe a 375 px: un placeholder que no cabe se corta a media palabra. */
export const MAX_NOTA_ORDEN = 36;

export const TIPOS_DE_ORDEN: readonly TipoOrden[] = ["produccion", "muestra"];

const NOTA: Readonly<Record<TipoOrden, string>> = {
  produccion: "Tela, cliente, urgencia…",
  muestra: "Qué se prueba, quién la aprueba…",
};

/** El placeholder de «Nota» según el tipo de orden elegido. */
export function sugerirNotaDeOrden(tipo: TipoOrden): string {
  return NOTA[tipo];
}
