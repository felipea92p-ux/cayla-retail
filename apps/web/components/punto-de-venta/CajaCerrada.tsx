"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, LockOpen } from "lucide-react";
import { bajadaDelCartel, lineaUltimoCierre, TIEMPOS_SALIDA, type CierreAnterior } from "@/lib/caja-cerrada-reglas";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";

/** `por-abrir`: la caja ya abrió, pero el loader general sigue a la vista; el cartel espera para girar donde se vea. */
type Fase = "oculta" | "cerrada" | "por-abrir" | "girando" | "subiendo";

type Props = {
  /** `true` mientras la sede no tenga caja abierta. Al pasar a `false`, la capa hace su salida y recién ahí se desmonta. */
  cerrada: boolean;
  ubicacionEtiqueta: string;
  cierreAnterior: CierreAnterior | null;
  onAbrir: () => void;
  /** El botón «Abrir caja»: el modal le devuelve el foco si se cierra sin abrir, para que Enter vuelva a abrirlo. */
  botonRef: RefObject<HTMLButtonElement | null>;
  /** A quién darle el foco cuando la caja abre: el escáner. */
  alAbrirEnfocar: RefObject<HTMLElement | null>;
  /** Lo que tiene que verse aunque la caja esté cerrada: las ventas guardadas sin conexión (ADR-0036). */
  aviso?: ReactNode;
};

const sinSuscripcion = () => () => {};

function sinMovimiento(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Vender con la caja cerrada (ADR-0299, maqueta B «Persiana», docs/maquetas/caja-cerrada-2026-10/). Antes solo se apagaba
 * el catálogo con `opacity-50` y un botón chico en la fila de arriba; una colaboradora nueva no entendía por qué «no
 * vendía». Ahora el área de trabajo se desenfoca, baja una persiana y se cuelga un cartel «Cerrado», con un solo botón
 * grande. Al abrir, el cartel gira a «Abierto» y la persiana sube.
 *
 * Cubre todo lo que está bajo la cabecera y a la derecha del menú lateral: la cabecera (con el selector de sede) y el
 * menú quedan nítidos y se pueden usar, para cambiar de sede o ir a otra pantalla. Va por portal a `body` porque un
 * ancestro con `transform` (las entradas de pantalla) volvería relativo su `position: fixed`. Por eso mismo no puede leer
 * `--spacing-lateral`: `AppShell` lo cambia solo dentro de su contenedor, y con el menú plegado la capa quedaba corrida y
 * dejaba una franja del POS a la vista (Felipe 2026-10-01). Se mide la cabecera, que siempre empieza donde termina el menú. Lo de atrás lo apaga
 * `PuntoDeVenta` con `inert`: esto solo dibuja, no decide nada. El estilo vive en `app/estilos/caja-cerrada.css`.
 */
export function CajaCerrada({ cerrada, ubicacionEtiqueta, cierreAnterior, onAbrir, botonRef, alAbrirEnfocar, aviso }: Props) {
  const [fase, setFase] = useState<Fase>(cerrada ? "cerrada" : "oculta");
  const [cerradaPrevia, setCerradaPrevia] = useState(cerrada);
  if (cerrada !== cerradaPrevia) {
    setCerradaPrevia(cerrada);
    setFase(cerrada ? "cerrada" : sinMovimiento() ? "oculta" : "por-abrir");
  }

  // El cartel gira recién cuando la pantalla queda libre (ADR-0149, la misma regla que los avisos): al abrir la caja,
  // `router.refresh()` deja el loader «Cargando» a la vista un rato más, y el giro pasaba entero detrás de él.
  const ocupada = useSyncExternalStore(suscribirEspera, esperaOcupada, () => false);
  if (fase === "por-abrir" && !ocupada) setFase("girando");
  // Si el loader se quedara colgado, el cartel gira igual a los 4 s: la persiana no puede quedar tapando una caja abierta.
  useEffect(() => {
    if (fase !== "por-abrir") return;
    const t = setTimeout(() => setFase("girando"), 4000);
    return () => clearTimeout(t);
  }, [fase]);

  // Cuando la caja abre y la pantalla queda libre, el foco va al escáner para que la primera etiqueta entre sin tocar nada.
  // Hace falta aquí: mientras el loader está a la vista vuelve `inert` todo lo demás (`Espera.tsx`), el efecto de foco de
  // `PuntoDeVenta` no alcanza el campo, y al irse el loader quiere devolverlo al botón del modal, que ya no existe.
  useEffect(() => {
    if (fase !== "girando") return;
    const activo = document.activeElement;
    if (!activo || activo === document.body) alAbrirEnfocar.current?.focus({ preventScroll: true });
  }, [fase, alAbrirEnfocar]);

  // La salida en dos tiempos: el cartel gira, después la persiana sube, y recién ahí se desmonta.
  useEffect(() => {
    if (fase !== "girando" && fase !== "subiendo") return;
    const t = setTimeout(() => setFase(fase === "girando" ? "subiendo" : "oculta"), fase === "girando" ? TIEMPOS_SALIDA.giro : TIEMPOS_SALIDA.subida);
    return () => clearTimeout(t);
  }, [fase]);

  // El portal necesita `document`: en el servidor (y al hidratar) no hay capa; en el navegador, sí.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  // La capa ocupa exactamente lo que deja la cabecera fija de AppShell: empieza donde ella termina (abajo) y donde ella
  // empieza (a la izquierda, que es donde termina el menú lateral). La cabecera mide distinto en celular y en escritorio,
  // y al plegar o desplegar el menú su borde izquierdo se corre con una transición: su ancho cambia en cada cuadro, así
  // que ResizeObserver avisa en cada uno y la capa la sigue sin dejar ninguna franja a la vista.
  const visible = montado && fase !== "oculta";
  const [marco, setMarco] = useState<{ arriba: number; izquierda: number } | null>(null);
  useLayoutEffect(() => {
    if (!visible) return;
    const cabecera = document.querySelector("header");
    if (!cabecera) return;
    // ResizeObserver avisa una vez al empezar a observar: esa es la primera medida.
    const obs = new ResizeObserver(() => {
      const r = cabecera.getBoundingClientRect();
      setMarco({ arriba: r.bottom, izquierda: r.left });
    });
    obs.observe(cabecera);
    return () => obs.disconnect();
  }, [visible]);

  // Al llegar, el foco va al botón: Enter abre la caja (el escáner no tiene dónde escribir con la caja cerrada).
  useEffect(() => {
    if (montado && fase === "cerrada") botonRef.current?.focus({ preventScroll: true });
  }, [montado, fase, botonRef]);

  if (!montado || fase === "oculta") return null;

  const info = lineaUltimoCierre(cierreAnterior);
  return createPortal(
    <section
      aria-labelledby="caja-cerrada-titulo"
      // `por-abrir` se ve como `cerrada` (el cartel todavía dice «Cerrado»), pero ya no se toca.
      data-fase={fase === "por-abrir" ? "cerrada" : fase}
      // Sin medida todavía (el primer cuadro), las clases dan la posición de siempre: menú desplegado.
      style={marco ? { top: marco.arriba, left: marco.izquierda } : undefined}
      className={`caja-cerrada fixed inset-x-0 bottom-0 top-16 z-[25] sm:left-lateral ${
        fase === "cerrada" ? "" : "pointer-events-none"
      }`}
    >
      <div className="caja-cerrada-velo" aria-hidden />
      <div className="caja-cerrada-persiana" aria-hidden>
        <span className="caja-cerrada-manija" />
      </div>
      <div className="caja-cerrada-barrido" aria-hidden />

      <div className="caja-cerrada-escenario">
        <div className="caja-cerrada-colgante">
          <div className="caja-cerrada-meneo">
            <span className="caja-cerrada-clavo" aria-hidden />
            <svg className="caja-cerrada-cuerdas" viewBox="0 0 220 62" preserveAspectRatio="none" aria-hidden>
              <path d="M110 2 L54 60" />
              <path d="M110 2 L166 60" />
            </svg>
            <div className="caja-cerrada-marco">
              <div className="caja-cerrada-cartel">
                <div className="caja-cerrada-cara" aria-hidden={fase !== "cerrada"}>
                  <span className="caja-cerrada-palabra">
                    <span className="caja-cerrada-punto" aria-hidden />
                    Cerrado
                  </span>
                  <span className="caja-cerrada-sede">{bajadaDelCartel(ubicacionEtiqueta, cierreAnterior)}</span>
                </div>
                <div className="caja-cerrada-cara caja-cerrada-dorso" aria-hidden={fase === "cerrada"}>
                  <span className="caja-cerrada-palabra">
                    <span className="caja-cerrada-punto" aria-hidden />
                    Abierto
                  </span>
                  <span className="caja-cerrada-sede">{ubicacionEtiqueta} · ya puedes vender</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="caja-cerrada-texto">
          <h2 id="caja-cerrada-titulo" className="caja-cerrada-titulo">
            Abre la caja para empezar a vender
          </h2>
          <p className="caja-cerrada-bajada">Mientras esté cerrada no se puede cobrar ni apartar.</p>
          <div>
            <button ref={botonRef} type="button" onClick={onAbrir} className="caja-cerrada-boton">
              <LockOpen className="h-4 w-4" aria-hidden />
              Abrir caja
              <ArrowRight className="caja-cerrada-flecha h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="caja-cerrada-info">
            {info.map((pieza, i) => (
              // El punto separador va pegado a la pieza que sigue: si la línea se parte, no queda colgando al final.
              <span key={pieza} className="caja-cerrada-pieza">
                {i > 0 && <i aria-hidden />}
                {pieza}
              </span>
            ))}
          </p>
          <p className="caja-cerrada-atajo">
            o presiona <kbd>Enter</kbd>
          </p>
          <div className="caja-cerrada-cola">{aviso}</div>
        </div>
      </div>
    </section>,
    document.body,
  );
}
