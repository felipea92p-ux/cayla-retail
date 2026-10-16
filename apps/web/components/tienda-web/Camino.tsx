import { Fragment, type CSSProperties, type ReactNode } from "react";

/** Un tramo entre dos pasos: qué lo hace avanzar («Confirmas») y en cuánto («en 24 h»). */
export type TramoCamino = { verbo: string; plazo: string };

/**
 * El CAMINO de un pedido web (ADR-0430): las cifras de cada paso en una fila, unidas por un hilo que se dibuja tramo a tramo con lo que
 * hace avanzar el pedido y su plazo («Confirmas · en 24 h»). Enseña el proceso sin manual: de dónde viene cada pedido y a dónde va.
 *
 * Las cifras son `<TarjetaCifra>` (la pieza única): este componente solo las ordena y dibuja los tramos entre ellas. Con `cierre`, la
 * última cifra va aparte, sin tramo (lo cobrado hoy no es un paso del pedido). Bajo 1024 px los tramos no se dibujan y las cifras van de
 * a dos, como en el resto del ERP (`.tw-camino`, `app/estilos/tienda-web.css`).
 */
export function Camino({
  pasos,
  tramos,
  cierre,
  etiqueta,
  guia,
}: {
  /** Tres pasos (confirmar, cobrar, entregar), cada uno su `<TarjetaCifra>`. */
  pasos: readonly [ReactNode, ReactNode, ReactNode];
  /** Lo que une el 1.º con el 2.º y el 2.º con el 3.º. */
  tramos: readonly [TramoCamino, TramoCamino];
  /** La cifra que va aparte, al final. */
  cierre: ReactNode;
  etiqueta: string;
  guia?: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="tw-camino" data-guia={guia}>
      {pasos.map((paso, i) => (
        <Fragment key={i}>
          {paso}
          {i < tramos.length && <Tramo tramo={tramos[i]!} d={i} />}
        </Fragment>
      ))}
      <span aria-hidden className="tw-camino-hueco" />
      {cierre}
    </div>
  );
}

/** El hilo entre dos cifras: se dibuja de izquierda a derecha, asoma su punta, y aparecen el verbo y el plazo. */
function Tramo({ tramo, d }: { tramo: TramoCamino; d: number }) {
  return (
    <span className="tw-camino-tramo" style={{ "--d": d } as CSSProperties}>
      <span className="tw-camino-verbo">{tramo.verbo}</span>
      <svg viewBox="0 0 60 16" preserveAspectRatio="none" aria-hidden>
        <path className="tw-camino-linea" pathLength={1} d="M2 8 H52" />
        <path className="tw-camino-punta" d="M51 4 L58 8 L51 12 Z" />
      </svg>
      <span className="tw-camino-plazo">{tramo.plazo}</span>
    </span>
  );
}
