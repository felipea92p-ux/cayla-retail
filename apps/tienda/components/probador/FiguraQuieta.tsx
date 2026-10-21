import { cajaDe, colorDeLaPieza, presentes, type Look, type PrendaDelProbador } from "@/lib/probador";
import { FiguraQuietaUnida } from "./FiguraQuietaUnida";
// La figura trae sus estilos: también la usan Favoritos y la página del look guardado, que no son el probador.
import "@/app/estilos/probador.css";

/**
 * La figura de un look, quieta (ADR-0434, actividades 8 y 9): las mismas prendas a escala y en sus capas que en el probador, sin nada que
 * tocar. Sirve para mostrar un look guardado (la tarjeta de Favoritos y su página) y el que se comparte. `ancho`: cuánto mide en la
 * pantalla (para pedir el recorte del tamaño justo). `numeros`: el número de cada prenda, como en «Tu look».
 *
 * Aquí solo se eligen las piezas y su caja «por largo»; la prenda de abajo se une a la de arriba en el navegador (`FiguraQuietaUnida`, ADR-0449):
 * el look se ve igual que cuando se armó en el probador, no distinto al guardarlo o compartirlo.
 */
export function FiguraQuieta({
  look,
  indice,
  ancho,
  numeros = false,
  etiqueta,
  pronto = false,
}: {
  look: Look;
  indice: ReadonlyMap<string, PrendaDelProbador>;
  ancho: number;
  numeros?: boolean;
  /** Lo que lee un lector de pantalla («Tu look: 1, Top Estela en rosa pálido…»). Sin ella, la figura es decorativa (la tarjeta de
   *  Favoritos ya dice el nombre del look). */
  etiqueta?: string;
  pronto?: boolean;
}) {
  const piezas = presentes(look).flatMap((z) => {
    const pieza = look[z]!;
    const p = indice.get(pieza.id);
    if (!p) return [];
    const c = colorDeLaPieza(p, pieza);
    // Solo lo que la figura dibuja y la unión lee: viaja al navegador, así que nada de la prenda entera.
    return [{ z, p: { metida: p.metida }, c: { foto: c.foto }, caja: cajaDe(z, p.largo, c.foto.proporcion) }];
  });
  return <FiguraQuietaUnida piezas={piezas} ancho={ancho} numeros={numeros} etiqueta={etiqueta} pronto={pronto} />;
}
