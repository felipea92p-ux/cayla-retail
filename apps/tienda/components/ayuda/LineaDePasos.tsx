import type { PasoParaSeparar } from "@/lib/ayuda";
import { Icono } from "../Icono";
import "@/app/estilos/ayuda.css";

/**
 * Los pasos para separar como una línea de tiempo con números grandes (revisión «a nivel mundial», 2026-10-16): la MISMA pieza en la
 * portada, el Inicio y «Cómo separar», con los mismos textos (`pasosParaSeparar`). En el celular los pasos bajan con un hilo a la
 * izquierda; desde 960 px van en fila, unidos por el hilo. El paso que ya se cumplió (con cuenta, «Ya tienes tu cuenta») lleva su visto
 * en verde y su tramo de hilo también verde: se ve dónde está la persona y qué le falta. Los números son dibujo (`aria-hidden`): la
 * lista ya dice el orden; el lector oye «Hecho:» antes del paso cumplido.
 */
export function LineaDePasos({ pasos, nombre = "Los pasos para separar" }: { pasos: readonly PasoParaSeparar[]; nombre?: string }) {
  return (
    <ol className="ay-pasos" aria-label={nombre}>
      {pasos.map((p, i) => (
        <li key={p.titulo} className="ay-paso" data-hecho={p.hecho ? "" : undefined}>
          <span className="ay-paso-marca" aria-hidden="true">
            <span className="ay-paso-n">{p.hecho ? <Icono nombre="check" /> : i + 1}</span>
            <span className="ay-paso-hilo" />
          </span>
          <span className="ay-paso-cuerpo">
            <b className="ay-paso-t">
              {p.hecho && <span className="t-sr">Hecho: </span>}
              {p.titulo}
            </b>
            <span className="ay-paso-x">{p.texto}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
