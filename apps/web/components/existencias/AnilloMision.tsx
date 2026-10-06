"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { avanceDeMision, claveMision, leerFotoMision, objetivosDeHoy } from "@/lib/existencias-mision";
import { hoyLima } from "@/lib/apartados-reglas";
import type { FilaExistencias } from "@/lib/inventario-v2";

const LARGO = 2 * Math.PI * 17;
const nada = () => () => {};

/* ====================================================================
   El anillo «N de M hoy» (maqueta `existencias-tactil-2026-10`, «anilloMision»): cuántas tallas de la foto del día ya se resolvieron
   (`lib/existencias-mision.ts`). Tocarlo abre «Pendientes». El anillo se llena con un trazo corto al avanzar (ADR-0136: responde a una
   acción, sin rebote ni bucle; quieto con `prefers-reduced-motion`).
   ==================================================================== */
export function AnilloMision({
  ubicacionId,
  filas,
  tiendas,
  pendientes,
  onAbrir,
}: {
  ubicacionId: string;
  filas: readonly FilaExistencias[];
  /** Los nombres de las tiendas a las que se les puede pedir (la red de stock viene por nombre). */
  tiendas: ReadonlySet<string>;
  /** Cuántas tareas hay en «Pendientes», para decirlo al lector de pantalla. */
  pendientes: number;
  onAbrir: () => void;
}) {
  const clave = claveMision(ubicacionId, hoyLima());
  // La foto guardada de hoy (en el servidor no hay: se dibuja con la de ahora y el navegador corrige al hidratar).
  const guardada = useSyncExternalStore(
    nada,
    () => {
      try {
        return window.localStorage.getItem(clave);
      } catch {
        return null;
      }
    },
    () => null
  );
  const ahora = useMemo(() => objetivosDeHoy(filas, tiendas), [filas, tiendas]);
  const foto = leerFotoMision(guardada) ?? ahora;
  // La primera vez del día en este equipo, la foto se guarda: desde ahí el anillo mide contra la mañana.
  useEffect(() => {
    try {
      if (!leerFotoMision(window.localStorage.getItem(clave))) window.localStorage.setItem(clave, JSON.stringify(ahora));
    } catch {
      // Sin almacenamiento (ventana privada): el anillo mide contra la foto de ahora.
    }
  }, [clave, ahora]);

  const { hechas, total } = avanceDeMision(foto, filas, tiendas);
  const fraccion = total === 0 ? 1 : hechas / total;
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={total === 0 ? `Hoy no hay tallas por resolver. Pendientes: ${pendientes}` : `Hoy: ${hechas} de ${total} tallas resueltas. Pendientes: ${pendientes}`}
      title="Lo de hoy: tallas por colgar y agotadas que otra tienda tiene. Toca para ver los pendientes de la sede."
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sand bg-crema py-[3px] pl-[3px] pr-3.5 text-left text-[13px] transition-colors hover:border-taupe"
    >
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="shrink-0">
        <circle cx="20" cy="20" r="17" fill="none" strokeWidth="4" stroke="var(--color-hueso)" />
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          stroke={total === 0 || hechas === total ? "var(--color-verde)" : "var(--color-ambar)"}
          transform="rotate(-90 20 20)"
          strokeDasharray={LARGO}
          strokeDashoffset={LARGO * (1 - fraccion)}
          className="transition-[stroke-dashoffset] duration-500 ease-[var(--ease-cayla)] motion-reduce:transition-none"
        />
      </svg>
      <span className="leading-tight">
        <b className="block text-[15px] font-semibold tabular-nums text-tinta">{total === 0 ? "Al día" : `${hechas} de ${total}`}</b>
        <small className="text-[11.5px] text-taupe">hoy</small>
      </span>
    </button>
  );
}
