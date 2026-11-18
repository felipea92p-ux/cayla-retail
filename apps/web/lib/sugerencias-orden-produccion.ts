import type { TipoOrden } from "./modelo-nuevo-orden-reglas";

// El ejemplo de la «Nota» de una orden de producción (ADR-0290: un ejemplo sigue lo que la persona ya eligió). Una producción fabrica un lote; una muestra
// desarrolla un modelo: lo que se anota en cada una es otra cosa. Sin tipo elegido (un modelo nuevo, ADR-0396 act. 2026-10-30) el ejemplo no promete ninguno de
// los dos. Lógica pura, sin azar ni red; la usa `NuevaOrdenProduccionForm`.

/** @internal Lo exige la prueba de la sugerencia (ADR-0290): cabe a 375 px; un placeholder que no cabe se corta a media palabra. */
export const MAX_NOTA_ORDEN = 36;

/** @internal Todos los valores del tipo, también «sin elegir», para que la prueba recorra cada uno (ADR-0290). */
export const TIPOS_DE_ORDEN: readonly (TipoOrden | null)[] = ["produccion", "muestra", null];

const NOTA: Readonly<Record<TipoOrden, string>> = {
  produccion: "Tela, cliente, urgencia…",
  muestra: "Qué se prueba, quién la aprueba…",
};
const NOTA_SIN_TIPO = "Lo que el Taller debe saber…";

/** El placeholder de «Nota» según el tipo de orden elegido. */
export function sugerirNotaDeOrden(tipo: TipoOrden | null): string {
  return tipo === null ? NOTA_SIN_TIPO : NOTA[tipo];
}
