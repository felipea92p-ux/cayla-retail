"use client";

import { achicar, CAPA, enAlto, enAncho, ESCENA, escalaDe, GIRO, puntoDe, type Caja } from "@/lib/probador";
import { Recorte } from "./Recorte";
import { type PiezaDeLaFigura, useUnionDeLaFigura } from "./useUnionDeLaFigura";

/** Qué tan ancha se ve una caja, si la figura mide `ancho` px en la pantalla (el `sizes` del recorte). */
const tamanoDe = (c: Caja, ancho: number) => `${Math.max(48, Math.round((c.w / ESCENA.ancho) * ancho))}px`;

/**
 * Lo que dibuja `FiguraQuieta`, con la prenda de abajo unida a la de arriba por su pretina (ADR-0449, la misma medida que el probador). Mientras
 * llega la medida —o si el recorte no se puede leer— se ve la caja «por largo» de siempre, y al llegar la prenda de abajo se acomoda con un
 * movimiento corto (`.pb-quieta-pieza`), no de golpe. Es cliente porque la medida sale de los píxeles del recorte, en el navegador.
 */
export function FiguraQuietaUnida({
  piezas: porLargo,
  ancho,
  numeros,
  etiqueta,
  pronto,
}: {
  piezas: readonly PiezaDeLaFigura[];
  ancho: number;
  numeros: boolean;
  etiqueta?: string;
  pronto: boolean;
}) {
  const { piezas } = useUnionDeLaFigura(porLargo);
  // Si lo más largo no cabe, toda la figura se achica igual (después de la unión: la caja de abajo pudo cambiar de largo).
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
