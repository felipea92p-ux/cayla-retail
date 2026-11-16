/**
 * Qué ventana de Chrome es esta, para imprimir sin el cuadro de impresión (Felipe, 2026-11-16).
 *
 * Chrome sin cuadro (`--kiosk-printing`) imprime siempre en la ÚLTIMA impresora que usó ese perfil, con su papel
 * (verificado en el código de Chrome: `docs/OPERACION-IMPRESORA-TERMICA.md`). Por eso cada impresora tiene su ícono:
 * «CAYLA Caja» (la térmica) y, en Windows, «CAYLA Etiquetas» (la Brother). El ícono abre el ERP con `?ventana=caja` o
 * `?ventana=etiquetas`; esta ventana lo recuerda (es su propio perfil de Chrome, así que su `localStorage` es solo suyo).
 *
 * Desde ahí, lo que no va a la impresora de esa ventana NO se imprime y se explica (decisión de Felipe): una hoja A4
 * mandada desde «CAYLA Caja» saldría en la térmica. Una ventana sin marca (el Chrome de siempre) imprime todo con el cuadro.
 * En una Mac las etiquetas salen por el ayudante a la Brother desde cualquier ventana: solo se frenan si van por el cuadro.
 */
import { preferenciaLocal } from "./preferencia-local";
import type { Sistema } from "./guia-impresion-reglas";

export const VENTANAS = ["caja", "etiquetas", "normal"] as const;
export type Ventana = (typeof VENTANAS)[number];

/** Lo que se manda a imprimir, según el papel en que sale. */
export type QueSeImprime = "ticket" | "etiqueta" | "hoja";

/** La marca de esta ventana (`localStorage` del perfil de Chrome). Sin marca, «normal». */
export const ventanaDelEquipo = preferenciaLocal<Ventana>("cayla-ventana", VENTANAS, "normal");

/** El parámetro que traen los íconos. Solo estos valores; `normal` borra la marca. */
export const PARAMETRO_VENTANA = "ventana";

/** La marca que trae la dirección (`?ventana=caja`), o `null` si no trae una válida. */
export function ventanaDeLaDireccion(busqueda: string): Ventana | null {
  const valor = new URLSearchParams(busqueda).get(PARAMETRO_VENTANA);
  return (VENTANAS as readonly string[]).includes(valor ?? "") ? (valor as Ventana) : null;
}

/** La dirección sin la marca, para dejarla limpia después de leerla. */
export function direccionSinMarca(busqueda: string): string {
  const p = new URLSearchParams(busqueda);
  p.delete(PARAMETRO_VENTANA);
  const resto = p.toString();
  return resto ? `?${resto}` : "";
}

/**
 * ¿Se puede imprimir esto en esta ventana? `null` si sí; si no, la frase que lo explica y dice dónde abrirlo.
 * `porAyudante`: la etiqueta sale por el ayudante de la Mac (no por el cuadro), así que va a la Brother desde cualquier ventana.
 */
export function frenoDeImpresion(ventana: Ventana, que: QueSeImprime, sistema: Sistema, porAyudante = false): string | null {
  if (ventana === "normal") return null;
  if (que === "etiqueta" && porAyudante) return null;
  if (ventana === "caja") {
    if (que === "ticket") return null;
    if (que === "hoja") return "Esta ventana imprime en la térmica. Abre las hojas A4 en el Chrome de siempre.";
    return sistema === "mac"
      ? "Esta ventana imprime en la térmica. Las etiquetas salen por el ayudante: instálalo desde Etiquetas de precio."
      : "Esta ventana imprime en la térmica. Las etiquetas se imprimen en «CAYLA Etiquetas».";
  }
  if (que === "etiqueta") return null;
  if (que === "ticket") return "Esta ventana imprime en la Brother. Los tickets se imprimen en «CAYLA Caja».";
  return "Esta ventana imprime en la Brother. Abre las hojas A4 en el Chrome de siempre.";
}
