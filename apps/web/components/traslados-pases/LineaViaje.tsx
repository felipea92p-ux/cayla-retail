"use client";

import { useRef, type CSSProperties } from "react";
import { useAlVerse } from "@/components/movimientos/useAlVerse";
import { CAMION } from "@/components/traslados-pases/SelloPase";

/** La línea punteada entre las dos sedes y el camión donde va la caja (lo que pasó del tiempo estimado). Corre una vez al verse;
 *  `quieto` la dibuja ya en su lugar (la franja de la billetera). */
export function LineaViaje({ progreso, conCamion, tarde, quieto = false }: { progreso: number; conCamion: boolean; tarde: boolean; quieto?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useAlVerse(ref);
  return (
    <div ref={ref} aria-hidden className="tp-linea" data-quieto={quieto ? "" : undefined} style={{ "--tp-p": progreso } as CSSProperties}>
      <i className="tp-linea-base" />
      <i className="tp-linea-hecha" />
      {conCamion && (
        <span className="tp-camion" data-tarde={tarde ? "" : undefined}>
          <svg viewBox="0 0 24 24">{CAMION}</svg>
        </span>
      )}
      <i className="tp-linea-fin" />
    </div>
  );
}
