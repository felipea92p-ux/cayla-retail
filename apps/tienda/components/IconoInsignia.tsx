import { createElement, type ReactElement } from "react";
import { DIBUJOS_DE_INSIGNIA, type ColorDeInsignia, type IconoInsignia as Familia, type PiezaDeInsignia } from "@cayla-retail/shared/insignias-visual";

// El dibujo de una insignia en la tienda (ADR-0489): el mismo que el ERP muestra en Catálogo ▸ Insignias —la calabaza de Halloween, el pastel
// de Aniversario…—, que vive en `packages/shared/src/insignias-visual.ts`. Aquí solo se pinta, con los colores de la tienda: el trazo y el
// relleno son del color del chip (`currentColor`) y lo «recortado» (la cara de la calabaza) es el fondo del chip (`--ins-hueco`, que cada chip
// declara en `app/estilos/ficha.css`). Nunca un color suelto.
const COLORES: Record<ColorDeInsignia, string> = { $acento: "currentColor", $hueco: "var(--ins-hueco)", $tinta: "currentColor" };

/** Las piezas de un dibujo, con sus colores resueltos y en el mismo orden de atributos que el ERP. */
function pintarInsignia(piezas: readonly PiezaDeInsignia[]): ReactElement[] {
  return piezas.map((pieza, i) => {
    // Un valor que empieza con «$» es un color con nombre; todo lo demás (números, «none», «round») pasa tal cual.
    const props = Object.fromEntries(
      Object.entries(pieza.props).map(([k, v]) => [k, typeof v === "string" && v.startsWith("$") ? COLORES[v as ColorDeInsignia] : v]),
    );
    return createElement(pieza.tag, { key: i, ...props }, ...(pieza.hijos ? pintarInsignia(pieza.hijos) : []));
  });
}

/** El dibujo de una familia de insignias (o el genérico: una etiqueta), listo para ir dentro de un chip. Decorativo: el texto del chip ya dice qué es. */
export function IconoInsignia({ icono }: { icono: Familia | "generico" }) {
  return (
    // Un poco más allá de ±14: el gato y la llama de la vela se asoman hasta 15.
    <svg className="t-ins-img" viewBox="-15.5 -15.5 31 31" aria-hidden="true" focusable="false">
      {pintarInsignia(DIBUJOS_DE_INSIGNIA[icono])}
    </svg>
  );
}
