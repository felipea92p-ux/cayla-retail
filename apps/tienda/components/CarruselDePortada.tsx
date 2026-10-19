"use client";

import { useEffect, useState, useSyncExternalStore, type FocusEvent, type ReactNode } from "react";
import { Icono } from "@/components/Icono";

/** Cada cuánto pasa a la campaña siguiente («cada ciertos segundos», Felipe 2026-10-17): lo justo para leer el nombre y la frase. */
const CADA_MS = 7000;

const MOVIMIENTO_REDUCIDO = "(prefers-reduced-motion: reduce)";
const suscribirMovimiento = (avisar: () => void) => {
  const mq = window.matchMedia(MOVIMIENTO_REDUCIDO);
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
};

/**
 * El carrusel de la portada (ADR-0436, actividad 6b): cuando corre más de una campaña, la portada las pasa una tras otra, deslizándose
 * cada 7 segundos, en el orden de la base (la de descuento primero). Se detiene con el mouse encima, con el foco adentro o con su botón
 * (WCAG 2.2.2: lo que se mueve solo se puede detener), y no se mueve nunca con `prefers-reduced-motion`: ahí se pasa con los puntos. Las
 * campañas que no se ven no las lee el lector de pantalla ni llega a ellas el teclado (`inert`).
 */
export function CarruselDePortada({ nombres, children }: { nombres: readonly string[]; children: readonly ReactNode[] }) {
  const total = children.length;
  const [actual, setActual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [encima, setEncima] = useState(false);
  const [conFoco, setConFoco] = useState(false);
  // En el servidor (y hasta saberlo) quieto: un carrusel no arranca antes de que la página diga cómo prefiere el movimiento.
  const sinMovimiento = useSyncExternalStore(suscribirMovimiento, () => window.matchMedia(MOVIMIENTO_REDUCIDO).matches, () => true);
  const corre = total > 1 && !pausado && !encima && !conFoco && !sinMovimiento;

  useEffect(() => {
    if (!corre) return;
    const reloj = setTimeout(() => setActual((i) => (i + 1) % total), CADA_MS);
    return () => clearTimeout(reloj);
  }, [corre, actual, total]);

  const salirDelFoco = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setConFoco(false);
  };

  return (
    <section
      className="t-carrusel"
      aria-roledescription="carrusel"
      aria-label="Campañas"
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      onFocus={() => setConFoco(true)}
      onBlur={salirDelFoco}
    >
      <div className="t-carrusel-pista" style={{ transform: `translateX(-${actual * 100}%)` }} aria-live={corre ? "off" : "polite"}>
        {children.map((dia, i) => (
          <div
            key={i}
            className="t-carrusel-dia"
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${total}: ${nombres[i] ?? ""}`}
            aria-hidden={i !== actual}
            inert={i !== actual}
          >
            {dia}
          </div>
        ))}
      </div>
      <div className="t-carrusel-controles">
        <button
          type="button"
          className="t-carrusel-pausa"
          onClick={() => setPausado((p) => !p)}
          aria-label={pausado ? "Seguir pasando las campañas" : "Detener las campañas"}
        >
          <Icono nombre={pausado ? "seguir" : "pausa"} />
        </button>
        {nombres.map((nombre, i) => (
          <button
            key={nombre + i}
            type="button"
            className="t-carrusel-punto"
            aria-label={`Ver ${nombre}`}
            aria-current={i === actual ? "true" : undefined}
            onClick={() => setActual(i)}
          >
            <span aria-hidden />
          </button>
        ))}
      </div>
    </section>
  );
}
