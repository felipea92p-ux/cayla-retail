"use client";

import { useLayoutEffect, useRef } from "react";
import type { SedeDeRendimiento } from "@/lib/rendimiento";
import { avance, resumenDeSede } from "@/lib/rendimiento-meta-reglas";

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });

/**
 * Las tiendas (ADR-0610): cada una dice cuánto lleva contra SU meta del mes antes de entrar. Nunca un ranking: el orden es el de siempre y no se
 * comparan entre sí (D-113). Cambiar de tienda es estado del navegador (Felipe, 2026-10-03): no navega, no pide nada y no mueve la vista.
 */
export function SedesConAnillo({ sedes, activaId, sesionId, hoy, onElegir }: { sedes: SedeDeRendimiento[]; activaId: string; sesionId: string; hoy: string; onElegir: (id: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const gota = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const poner = () => {
      const b = caja.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (b && gota.current) {
        gota.current.style.width = `${b.offsetWidth}px`;
        gota.current.style.transform = `translateX(${b.offsetLeft}px)`;
      }
    };
    poner();
    const ro = new ResizeObserver(poner);
    if (caja.current) ro.observe(caja.current);
    return () => ro.disconnect();
  }, [activaId]);

  return (
    // unificar-fijo: tarjetas-pestaña por tienda con su anillo, ADR-0325 y ADR-0610
    <div ref={caja} role="tablist" aria-label="Tienda" className="mesa-sedes" data-guia="rendimiento.tiendas">
      <span ref={gota} aria-hidden className="mesa-sedes-gota" />
      {sedes.map((s) => {
        const activa = s.ubicacionId === activaId;
        const mes = s.panelDisponible ? resumenDeSede(s.serie, "mes", hoy) : null;
        const pct = mes ? avance(mes.soles, mes.meta) : null;
        const detalle = mes === null ? "No se pudo leer" : pct !== null && mes.meta !== null ? `${SOLES.format(mes.soles)} de ${SOLES.format(mes.meta)} este mes` : `${SOLES.format(mes.soles)} este mes, sin meta cargada`;
        return (
          <button
            key={s.ubicacionId}
            type="button"
            role="tab" // unificar-fijo: tarjetas-pestaña por tienda, ADR-0325
            aria-selected={activa}
            aria-controls="panel-tienda"
            title={`${s.nombre}${s.ubicacionId === sesionId ? " (tu sesión)" : ""}: ${detalle}`}
            className="mesa-sede"
            onClick={() => onElegir(s.ubicacionId)}
            data-guia={activa ? "rendimiento.tienda-activa" : "rendimiento.tienda-otra"}
          >
            <svg className="mesa-sede-aro" viewBox="0 0 36 36" aria-hidden>
              <circle className="pista" cx="18" cy="18" r="15" pathLength={100} />
              {/* unificar-fijo: el anillito de la pestaña de una tienda; la pieza <Anillo> no baja de 40 px */}
              <circle className="arco" cx="18" cy="18" r="15" pathLength={100} style={{ strokeDasharray: `${Math.min(100, pct ?? 0)} 100` }} />
            </svg>
            <span>{s.nombre.replace(/^Tienda\s+/, "")}</span>
            {pct !== null && <small>{pct} %</small>}
          </button>
        );
      })}
    </div>
  );
}
