"use client";

import type { ReactNode } from "react";
import { chispasDe } from "@/lib/comprobante-linea-tiempo";

// El botón que confirma un pago (ADR-0136). Tres estados, una sola pieza:
//   reposo   → «Registrar pago de S/ X», tinta;
//   cargando → el texto sube y se desvanece y una rueda gira (mientras la base responde);
//   hecho    → el botón se pone verde y un «visto» se dibuja (`check-trazo`, globals.css).
// Los estilos y las transiciones viven en `app/estilos/comprobantes-detalle.css` (`cd-btn-confirmar`).
// Un botón `disabled` en reposo se atenúa; en cargando/hecho NO se atenúa (ya está haciendo algo: debe verse
// vivo) y deja de recibir clics por CSS (`pointer-events: none`) — la guarda real está en el manejador del envío.

export type EstadoConfirmar = "reposo" | "cargando" | "hecho";

const MENSAJE: Record<EstadoConfirmar, string> = { reposo: "", cargando: "Registrando el pago…", hecho: "Pago registrado." };

export function BotonConfirmar({
  estado,
  disabled = false,
  className = "px-3",
  children,
}: {
  estado: EstadoConfirmar;
  /** Solo se atenúa en reposo (formulario incompleto o con un error a la vista). */
  disabled?: boolean;
  /** Relleno horizontal y ancho (por defecto `px-3`). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      data-estado={estado}
      data-confirmar
      disabled={estado === "reposo" && disabled}
      aria-busy={estado === "cargando"}
      className={`cd-btn-confirmar label-cayla rounded-md py-2.5 text-[11px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60 ${className}`}
    >
      <span className="cd-btn-txt">{children}</span>
      <span className="cd-btn-giro" aria-hidden>
        <i />
      </span>
      <span className="cd-btn-visto" aria-hidden>
        {estado === "hecho" && (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="check-trazo" style={{ "--d": "60ms" } as React.CSSProperties}>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      {/* Lo que un lector de pantalla necesita saber: el cambio de estado no se ve con la vista. */}
      <span className="sr-only" role="status">
        {MENSAJE[estado]}
      </span>
    </button>
  );
}

export function prefiereMovimientoReducido(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const COLORES_CHISPA = ["var(--color-verde)", "var(--color-taupe)", "var(--color-ambar)"] as const;

/**
 * El destello de «comprobante saldado»: unas 10 partículas salen desde el centro de `origen` y se apagan en
 * ~700 ms. Sobrio a propósito —confirma, no celebra— y con la curva del sistema. Se salta por completo con
 * movimiento reducido. Cada partícula es un <i> fijo en el `body` que se borra solo al terminar; si algo falla
 * (sin WAAPI, sin `origen`) simplemente no pasa nada: es un adorno de la confirmación, nunca parte del pago.
 */
export function lanzarChispas(origen: Element | null | undefined) {
  if (!origen || typeof document === "undefined" || prefiereMovimientoReducido()) return;
  if (typeof origen.getBoundingClientRect !== "function") return;
  const r = origen.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (const c of chispasDe(10)) {
    const p = document.createElement("i");
    p.className = "cd-chispa";
    p.setAttribute("aria-hidden", "true");
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.background = COLORES_CHISPA[c.color];
    document.body.appendChild(p);
    if (typeof p.animate !== "function") {
      p.remove();
      continue;
    }
    const animacion = p.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(c.angulo) * c.distancia}px), calc(-50% + ${Math.sin(c.angulo) * c.distancia}px)) scale(0.2)`, opacity: 0 },
      ],
      { duration: c.duracion, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)", fill: "forwards" },
    );
    animacion.onfinish = () => p.remove();
  }
}
