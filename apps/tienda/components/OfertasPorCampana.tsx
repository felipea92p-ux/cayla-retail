"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icono } from "./Icono";

export type CampanaDeOfertas = {
  /** `null` = «Todas». */
  id: string | null;
  /** Lo que dice la píldora: «Día del Gato −15 %». */
  nombre: string;
  /** «hasta 30 oct.» (solo las campañas). */
  hasta: string | null;
  cuantas: number;
  /** El enlace de la píldora (la misma dirección de siempre: sin JavaScript sigue funcionando) y el de «Ver todas». */
  href: string;
  verTodas: string;
  /** Las tarjetas de esa campaña, armadas en el servidor. */
  grilla: ReactNode;
};

/**
 * Las píldoras de «Las ofertas» (2026-10-24): cambiar de campaña ya no pide la página entera al servidor. En producción esa espera era de
 * 2 a 9 s y, mientras tanto, las tarjetas se quedaban apagadas con la píldora ya marcada. El servidor arma la lista de CADA campaña (hasta
 * 8 tarjetas cada una; las que no se ven llevan `hidden`, así sus fotos no bajan) y aquí solo se elige cuál se muestra. La dirección se
 * actualiza con `replaceState` (compartir o recargar sigue llevando a la misma campaña) y el enlace de cada píldora conserva su `href`:
 * sin JavaScript, navega como antes.
 */
export function OfertasPorCampana({ campanas, inicial, titulo }: { campanas: CampanaDeOfertas[]; inicial: string | null; titulo: ReactNode }) {
  const [elegida, setElegida] = useState<string | null>(campanas.some((c) => c.id === inicial) ? inicial : null);
  const actual = campanas.find((c) => c.id === elegida) ?? campanas[0];

  return (
    <>
      <div className="t-sec-cab">
        {titulo}
        <Link className="t-ver" href={actual.verTodas}>
          Ver todas <b>{actual.cuantas}</b>
          <Icono nombre="flecha" />
        </Link>
      </div>
      <nav className="t-pildoras" aria-label="Campañas">
        {campanas.map((c) => (
          <Link
            key={c.id ?? "todas"}
            className="t-pildora"
            href={c.href}
            scroll={false}
            prefetch={false}
            aria-current={c.id === actual.id ? "true" : undefined}
            onClick={(e) => {
              // Un clic con tecla (nueva pestaña) sigue su camino normal.
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              setElegida(c.id);
              window.history.replaceState(null, "", c.href);
            }}
          >
            {c.id === null ? (
              <>
                Todas <small>{c.cuantas}</small>
              </>
            ) : (
              <>
                {c.nombre} <small>{c.hasta ?? "sin fecha"}</small>
              </>
            )}
          </Link>
        ))}
      </nav>
      {campanas.map((c) => (
        <div key={c.id ?? "todas"} className="t-grilla t-ofertas-grilla" hidden={c.id !== actual.id}>
          {c.grilla}
        </div>
      ))}
    </>
  );
}
