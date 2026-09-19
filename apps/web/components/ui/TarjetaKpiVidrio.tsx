"use client";

import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { TonoKpi } from "@/lib/facturacion-resumen-reglas";

// Tono de la cifra cuando la tarjeta la colorea (solo «Por enviar»: el número es la alerta).
const COLOR_DE_LA_CIFRA: Record<TonoKpi, string> = {
  verde: "text-verde-profundo",
  ambar: "text-ambar-profundo",
  rojo: "text-rojo-profundo",
  taupe: "text-tinta",
};

/**
 * Una tarjeta de indicador de la isla de vidrio de Facturación (ADR-0124): borde izquierdo de 3 px
 * en el color del estado, un tinte que se difumina hacia la derecha y una luz que sigue al cursor.
 * Mismo criterio de color que `TarjetaKpi` de Caja: verde va bien, ámbar hay algo pendiente, rojo
 * exige acción, taupe solo informa. El color no va solo: cada tarjeta lo dice también con texto.
 *
 * Es cliente solo por la luz: escribe `--mx` y `--my` sobre su propio nodo con una ref, sin
 * re-render. Todo lo demás (la cifra, el contexto y la visualización) llega de servidor.
 * `valor` es un nodo para poder recibir una `CifraAnimada`; `indice` escalona la entrada.
 */
export function TarjetaKpiVidrio({
  etiqueta,
  valor,
  tono,
  icono,
  indice = 0,
  contexto,
  colorearCifra = false,
  children,
}: {
  etiqueta: string;
  valor: ReactNode;
  tono: TonoKpi;
  icono: ReactNode;
  indice?: number;
  contexto?: ReactNode;
  colorearCifra?: boolean;
  children?: ReactNode;
}) {
  const tarjeta = useRef<HTMLDivElement>(null);

  function seguirCursor(e: PointerEvent<HTMLDivElement>) {
    const el = tarjeta.current;
    if (!el) return;
    const caja = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - caja.left}px`);
    el.style.setProperty("--my", `${e.clientY - caja.top}px`);
  }

  return (
    <div className="kpi-vidrio-envoltura anim-sube" data-tono={tono} style={{ "--i": indice } as CSSProperties}>
      <div ref={tarjeta} className="kpi-vidrio" onPointerMove={seguirCursor}>
        <div className="flex items-center justify-between gap-2">
          <span className="label-cayla text-[11px] text-tinta/65">{etiqueta}</span>
          <span className="kpi-vidrio__icono" aria-hidden>
            {icono}
          </span>
        </div>
        <p className={`font-display mt-1 text-3xl tabular-nums ${colorearCifra ? COLOR_DE_LA_CIFRA[tono] : "text-tinta"}`}>{valor}</p>
        {contexto && <p className="mt-1 text-[13px] leading-[1.45] text-tinta/65">{contexto}</p>}
        {children}
      </div>
    </div>
  );
}
