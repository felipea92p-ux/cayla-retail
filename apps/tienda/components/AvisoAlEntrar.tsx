"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { entendiElAviso } from "@/app/acciones/inicio";
import { TEXTO_ENLACE_RESPUESTA, presentacionDelAviso, textoDeMas, type AvisoAlEntrar as Aviso } from "@/lib/inicio-aviso";
import { Icono } from "./Icono";

/** Cuánto se ve el aviso al entrar antes de ocultarse solo (Felipe, 2026-10-19). */
const DURACION_AVISO_MS = 5000;

/**
 * El aviso al entrar (ADR-0408; Felipe, 2026-10-14): lo que la persona tiene a su favor en el Club (su descuento de cumpleaños, su vale,
 * la talla que esperaba y ya llegó), con hasta cuándo y el camino a «Mi cuenta». Lo arma el servidor (`lib/inicio-aviso.ts`); aquí solo
 * se dibuja y se cierra. «Entendido» lo pliega en el momento y le pide al servidor que lo recuerde en este aparato (una cookie por
 * aviso): no vuelve a salir para esos mismos beneficios; uno nuevo, sí. Desde el 2026-10-17 también trae «CAYLA te respondió» (la
 * respuesta a una recomendación suya): la ceja y el enlace siguen lo que trae (`presentacionDelAviso`).
 *
 * Desde el 2026-10-19 flota sobre la página (`.t-aviso-flotante`, centrado bajo la cabecera) y se oculta solo a los 5 s. Ocultarse solo
 * NO lo marca como leído: sigue contando en la campanita; solo «Entendido» lo recuerda en el aparato.
 */
export function AvisoAlEntrar({ aviso, activas }: { aviso: Aviso; activas: string[] }) {
  const id = useId();
  const [cerrado, setCerrado] = useState(false);
  const [, iniciar] = useTransition();
  const { ceja, enlace, enlaceEnCadaLinea } = presentacionDelAviso(aviso);

  useEffect(() => {
    const reloj = setTimeout(() => setCerrado(true), DURACION_AVISO_MS);
    return () => clearTimeout(reloj);
  }, []);

  // La tarjeta va justo debajo de la barra «Ver lo que hay en…», y la sigue al bajar la página o cambiar el tamaño (Felipe, 2026-10-19).
  // Se mueve directo en el DOM, sin volver a dibujar el componente en cada movimiento. Sin barra (otra pantalla), queda bajo la cabecera.
  const flotante = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const barra = document.querySelector<HTMLElement>(".t-filtro-tienda");
    const cabecera = document.querySelector<HTMLElement>("header");
    function ubicar() {
      const ancla = barra ?? cabecera;
      if (!ancla || !flotante.current) return;
      flotante.current.style.top = `${ancla.getBoundingClientRect().bottom+5}px`;
    }
    ubicar();
    window.addEventListener("scroll", ubicar, { passive: true });
    window.addEventListener("resize", ubicar);
    const medidor = barra ? new ResizeObserver(ubicar) : null;
    if (barra) medidor?.observe(barra);
    return () => {
      window.removeEventListener("scroll", ubicar);
      window.removeEventListener("resize", ubicar);
      medidor?.disconnect();
    };
  }, []);

  function entendido() {
    setCerrado(true);
    iniciar(() => entendiElAviso(aviso.claves, activas));
  }

  return (
    <div className="t-aviso-flotante" ref={flotante}>
      {/* El pliegue: al cerrar, la fila de la grilla pasa de su alto a cero (sin rebote) y lo de abajo sube con ella. */}
      <div className="t-aviso-club-envol" data-cerrado={cerrado || undefined} inert={cerrado || undefined}>
        <div className="t-aviso-club-pliegue">
          <div className="t-ancho">
            <section className="t-aviso-club" aria-labelledby={id}>
              <div className="t-aviso-club-cuerpo">
                <span className="t-ceja" id={id}>
                  {ceja}
                </span>
                <ul className="t-aviso-club-lista">
                  {aviso.lineas.map((l) => (
                    <li key={l.clave}>
                      <span className="t-aviso-club-ic">
                        <Icono nombre={l.icono} />
                      </span>
                      <span>
                        <b>{l.titulo}</b>
                        <small>{l.texto}</small>
                        {enlaceEnCadaLinea && l.tipo === "respuesta" && l.href && (
                          <Link className="t-enlace" href={l.href}>
                            {TEXTO_ENLACE_RESPUESTA}
                          </Link>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {aviso.mas > 0 && <p className="t-aviso-club-mas">{textoDeMas(aviso.mas)}</p>}
              </div>
              <div className="t-aviso-club-acc">
                <Link className="t-enlace" href={enlace.href}>
                  {enlace.texto} <Icono nombre="flecha" />
                </Link>
                <button type="button" className="t-btn t-btn-chico" onClick={entendido}>
                  Entendido
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
