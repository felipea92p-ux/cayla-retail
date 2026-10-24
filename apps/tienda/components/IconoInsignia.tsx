import { createElement, type ReactElement } from "react";
import { DIBUJOS_DE_INSIGNIA, type ColorDeInsignia, type IconoInsignia as Familia, type PiezaDeInsignia } from "@cayla-retail/shared/insignias-visual";
import { urlDeImagenDeInsignia } from "@cayla-retail/shared/insignia-imagen";

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

/** El dibujo de una familia de insignias (o el genérico: una etiqueta), listo para ir dentro de un chip. Decorativo: el texto del chip ya dice qué es.
 *  Si la insignia tiene una imagen propia (ADR-0490: la ruta en el almacén público de insignias) y se sabe de dónde cuelga el almacén (`origen`,
 *  `TIENDA_FOTOS_ORIGEN`), se dibuja esa imagen; sin una de las dos cosas, el dibujo, así que un dato que falta nunca deja el chip sin figura. */
export function IconoInsignia({ icono, imagen = null, origen }: { icono: Familia | "generico"; imagen?: string | null; origen?: string }) {
  const url = urlDeImagenDeInsignia(origen, imagen);
  if (url) {
    // Un icono de 18 px que ya viene reducido (≤ 100 KB, WebP): no pasa por el optimizador de imágenes. Sin `loading="lazy"`: el chip va justo
    // arriba del nombre de la prenda, a la vista desde el primer cuadro, y con «lazy» el navegador lo dejaba sin pintar hasta que la pantalla lo pedía.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="t-ins-img t-ins-foto" src={url} alt="" width={18} height={18} decoding="async" />;
  }
  return (
    // Un poco más allá de ±14: el gato y la llama de la vela se asoman hasta 15.
    <svg className="t-ins-img" viewBox="-15.5 -15.5 31 31" aria-hidden="true" focusable="false">
      {pintarInsignia(DIBUJOS_DE_INSIGNIA[icono])}
    </svg>
  );
}
