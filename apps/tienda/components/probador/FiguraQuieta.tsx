import {
  achicar,
  cajaDe,
  CAPA,
  colorDeLaPieza,
  ESCENA,
  enAlto,
  enAncho,
  escalaDe,
  GIRO,
  presentes,
  puntoDe,
  type Caja,
  type Look,
  type PrendaDelProbador,
} from "@/lib/probador";
import { Recorte } from "./Recorte";
// La figura trae sus estilos: también la usan Favoritos y la página del look guardado, que no son el probador.
import "@/app/estilos/probador.css";

/** Qué tan ancha se ve una caja, si la figura mide `ancho` px en la pantalla (el `sizes` del recorte). */
const tamanoDe = (c: Caja, ancho: number) => `${Math.max(48, Math.round((c.w / ESCENA.ancho) * ancho))}px`;

/**
 * La figura de un look, quieta (ADR-0434, actividades 8 y 9): las mismas prendas a escala y en sus capas que en el probador, sin nada que
 * tocar. Sirve para mostrar un look guardado (la tarjeta de Favoritos y su página) y el que se comparte. `ancho`: cuánto mide en la
 * pantalla (para pedir el recorte del tamaño justo). `numeros`: el número de cada prenda, como en «Tu look».
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
    return [{ z, p, c, caja: cajaDe(z, p.largo, c.foto.proporcion) }];
  });
  const k = escalaDe(piezas.map((x) => x.caja));
  const dibujadas = piezas.map((x) => ({ ...x, caja: achicar(x.caja, k) }));
  const piso = Math.max(0, ...dibujadas.map((x) => x.caja.y + x.caja.h)) - 10;
  return (
    <div className="pb-quieta" {...(etiqueta ? { role: "img", "aria-label": etiqueta } : { "aria-hidden": true })}>
      <div className="pb-arco" aria-hidden="true">
        <span className="pb-arco-filo" />
        <span className="pb-piso" style={{ top: enAlto(piso) }} />
      </div>
      {dibujadas.map(({ z, p, c, caja }) => (
        <span
          key={z}
          className="pb-quieta-pieza"
          aria-hidden="true"
          style={{
            left: enAncho(caja.x),
            top: enAlto(caja.y),
            width: enAncho(caja.w),
            height: enAlto(caja.h),
            zIndex: z === "arriba" && p.metida ? 1 : CAPA[z],
            transform: `rotate(${GIRO[z]}deg)`,
          }}
        >
          <Recorte foto={c.foto} tamanos={tamanoDe(caja, ancho)} pronto={pronto} />
        </span>
      ))}
      {numeros &&
        dibujadas.map(({ z, caja }, i) => {
          const punto = puntoDe(z, caja);
          return (
            <span key={`n-${z}`} className="pb-punto" aria-hidden="true" style={{ left: enAncho(punto.x), top: enAlto(punto.y) }}>
              {i + 1}
            </span>
          );
        })}
    </div>
  );
}
