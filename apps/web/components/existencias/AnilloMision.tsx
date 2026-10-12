"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { avanceDeMision, claveMision, leerFotoMision, objetivosDeHoy } from "@/lib/existencias-mision";
import { hoyLima } from "@/lib/apartados-reglas";
import type { FilaExistencias } from "@/lib/inventario-v2";

const LARGO = 2 * Math.PI * 13;
const nada = () => () => {};

/* ====================================================================
   El anillo «N de M hoy» (maqueta `existencias-tactil-2026-10`, «anilloMision»): cuántas tallas de la foto del día ya se resolvieron
   (`lib/existencias-mision.ts`). Tocarlo abre «Pendientes». El anillo se llena con un trazo corto al avanzar (ADR-0136: responde a una
   acción, sin rebote ni bucle; quieto con `prefers-reduced-motion`).

   Vive al costado de «Filtros» (2026-10-06), del alto de esa fila (40 px). Con poco ancho (bajo 1024 px) se queda solo el círculo, con la
   cifra adentro (lo que falta, o ✓), y el buscador gana ese lugar.
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
  // «Al día» solo si de verdad no queda nada: sin tallas por resolver pero con pendientes (cuadrar el piso, ventas sin registrar…), el anillo
  // dice cuántos y va en ámbar (2026-10-06). Desde que el aviso del piso sin cuadrar dejó de ser una franja sobre las tarjetas, este es el
  // recordatorio que queda a la vista: un «Al día» con el piso sin cuadrar haría que nadie lo cuadre.
  const alDia = total === 0 && pendientes === 0;
  const listo = alDia || (total > 0 && hechas === total && pendientes === 0);
  const texto = total > 0 ? `${hechas} de ${total}` : pendientes > 0 ? `${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}` : "Al día";
  // Dentro del círculo, cuando el texto no cabe: lo que falta por hacer (tallas, o si no, pendientes); al día, un visto.
  const adentro = total > hechas ? String(total - hechas) : pendientes > 0 ? String(pendientes) : "✓";
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={
        total === 0
          ? pendientes > 0
            ? `Hoy no hay tallas por resolver, pero hay ${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"} de la sede. Toca para verlos`
            : "Hoy está todo al día"
          : `Hoy: ${hechas} de ${total} tallas resueltas. Pendientes: ${pendientes}`
      }
      title="Lo de hoy: tallas por colgar y agotadas que otra tienda tiene. Toca para ver los pendientes de la sede."
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-sand bg-crema p-[3px] text-left text-[13px] transition-colors hover:border-taupe lg:pr-3.5"
    >
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <circle cx="16" cy="16" r="13" fill="none" strokeWidth="3.5" stroke="var(--color-hueso)" />
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          stroke={listo ? "var(--color-verde)" : "var(--color-ambar)"}
          transform="rotate(-90 16 16)"
          strokeDasharray={LARGO}
          strokeDashoffset={LARGO * (1 - fraccion)}
          className="transition-[stroke-dashoffset] duration-500 ease-[var(--ease-cayla)] motion-reduce:transition-none"
        />
        <text x="16" y="16" textAnchor="middle" dominantBaseline="central" className="fill-tinta text-[11px] font-semibold tabular-nums lg:hidden">
          {adentro}
        </text>
      </svg>
      <span className="leading-tight max-lg:hidden">
        <b className="block whitespace-nowrap text-[13.5px] font-semibold tabular-nums text-tinta">{texto}</b>
        <small className="text-[11px] text-taupe">hoy</small>
      </span>
    </button>
  );
}
