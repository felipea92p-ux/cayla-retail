import { Fragment, type CSSProperties, type ReactNode } from "react";
import { AlarmClock, Bell } from "lucide-react";

/** Un tramo entre dos pasos: qué lo hace avanzar («Confirmas»), en cuánto («se cierra a las 24 h») y si al cumplirse el pedido SE
 *  CIERRA solo (se pierde la venta) o solo avisa. */
export type TramoCamino = { verbo: string; plazo: string; cierra: boolean };

/**
 * El CAMINO de un pedido web (ADR-0430; actualización 2026-10-17): sus cuatro estaciones en una fila —por confirmar, por cobrar, por
 * entregar y cerrados—, unidas por un hilo que se dibuja tramo a tramo con lo que hace avanzar el pedido y su plazo. Enseña el proceso
 * sin manual: de dónde viene cada pedido y a dónde va.
 *
 * El tramo que CIERRA el pedido (confirmar a tiempo) va con hilo entero, el reloj y el plazo en rojo profundo; los que solo avisan (pagar,
 * recoger), con hilo punteado y la campana: antes las dos flechas eran iguales y la colaboradora no sabía cuál le hacía perder la venta.
 *
 * Las estaciones son `<TarjetaCifra>` (la pieza única): este componente solo las ordena, dibuja los tramos y, con `reglas`, pone bajo
 * cada estación lo que conviene saber de ese paso («¿Cómo funciona?»), alineado a su columna. Bajo 1280 px los tramos no se dibujan y las
 * estaciones van de a dos, como en el resto del ERP (`.tw-camino`, `app/estilos/tienda-web.css`).
 */
export function Camino({
  pasos,
  tramos,
  reglas,
  idReglas,
  etiqueta,
  guia,
}: {
  pasos: readonly [ReactNode, ReactNode, ReactNode, ReactNode];
  /** Lo que une cada paso con el siguiente. */
  tramos: readonly [TramoCamino, TramoCamino, TramoCamino];
  /** Lo que conviene saber de cada paso, en el mismo orden; sin ellas no se dibuja nada debajo. */
  reglas?: readonly { titulo: string; texto: ReactNode }[] | null;
  /** El id del bloque de reglas, para el `aria-controls` del botón que lo abre. */
  idReglas?: string;
  etiqueta: string;
  guia?: string;
}) {
  return (
    <div className="space-y-3">
      <div role="group" aria-label={etiqueta} className="tw-camino" data-guia={guia}>
        {pasos.map((paso, i) => (
          <Fragment key={i}>
            {paso}
            {i < tramos.length && <Tramo tramo={tramos[i]!} d={i} />}
          </Fragment>
        ))}
      </div>
      {reglas && (
        <div id={idReglas} className="tw-camino tw-camino-reglas">
          {reglas.map((r, i) => (
            <Fragment key={r.titulo}>
              <div className="nota-cayla sin-i anim-entra text-[13px]" style={{ ["--i" as string]: i } as CSSProperties}>
                {/* En la fila del camino cada regla cae bajo su estación y el nombre sobra; de a dos, hace falta. */}
                <p className="label-cayla mb-1 text-taupe xl:hidden">{r.titulo}</p>
                <p>{r.texto}</p>
              </div>
              {i < reglas.length - 1 && <span aria-hidden className="tw-camino-hueco" />}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** El hilo entre dos cifras: se dibuja de izquierda a derecha, asoma su punta, y aparecen el verbo y el plazo. */
function Tramo({ tramo, d }: { tramo: TramoCamino; d: number }) {
  const Icono = tramo.cierra ? AlarmClock : Bell;
  return (
    <span className="tw-camino-tramo" data-cierra={tramo.cierra || undefined} style={{ "--d": d } as CSSProperties}>
      <span className="tw-camino-verbo">{tramo.verbo}</span>
      <svg viewBox="0 0 60 16" preserveAspectRatio="none" aria-hidden>
        <path className="tw-camino-linea" pathLength={1} d="M2 8 H52" />
        <path className="tw-camino-punta" d="M51 4 L58 8 L51 12 Z" />
      </svg>
      <span className="tw-camino-plazo">
        <Icono aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {tramo.plazo}
      </span>
    </span>
  );
}
