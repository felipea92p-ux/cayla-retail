"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePosicionAnclada } from "@/components/ui/useAnclaje";
import { etiquetaRango } from "@/lib/resumen-periodo";
import { VENTANA_RITMO_RECIENTE_DIAS, type RitmoReciente } from "@/lib/existencias-ritmo";
import { textoRitmoReciente } from "@/lib/resumen-formato";

/* ====================================================================
   RitmoRecientePopover · «Ritmo reciente» clickeable de Existencias (2026-09-25, sección 8-9 del pedido)

   El valor de la celda («0.8/día», «D1: 3 · D2: 1», «Sin salida reciente») es un botón: clic (o
   Enter/Espacio con foco por teclado, sin depender de hover) abre un panel con el cálculo completo y
   el desglose día por día con fecha real — mismo patrón de posicionamiento `position: fixed` que
   `MenuAcciones` (una tabla con scroll horizontal recorta cualquier panel `absolute`).
   ==================================================================== */

const ANCHO = 288; // w-72

export function RitmoRecientePopover({
  ritmo,
  referencia,
  sku,
  minDiasExposicionRitmo,
}: {
  ritmo: RitmoReciente | null;
  referencia: string;
  sku: string;
  /** Jornadas mínimas de exposición antes de calcular un ritmo (`politica-operativa-inventario.ts`). */
  minDiasExposicionRitmo: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const pos = usePosicionAnclada(boton, abierto, ANCHO);

  // El foco se queda en el botón (no hay nada que tabular dentro: es un panel de solo lectura, no
  // un menú) — por eso Escape se escucha en `document`, no en el panel: un `onKeyDown` en el panel
  // nunca vería la tecla porque el evento nace en el botón, fuera de su subárbol (el panel vive en
  // un portal aparte).
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  if (!ritmo) return <span className="text-xs text-tinta/40">N/D</span>;

  const totalVentas = ritmo.dias.reduce((acc, d) => acc + d.ventas, 0);
  const tono = ritmo.tipo === "medida" ? "text-tinta/80" : ritmo.tipo === "sin_salida" ? "text-tinta/50" : "text-tinta/70";

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={`rounded text-xs font-medium tabular-nums underline decoration-tinta/25 decoration-dotted underline-offset-2 transition-colors hover:decoration-tinta/60 ${tono}`}
      >
        {textoRitmoReciente(ritmo)}
      </button>
      {abierto &&
        pos &&
        createPortal(
          <>
            {/* Capa invisible para cerrar al tocar afuera — mismo criterio que `MenuAcciones`. */}
            <div className="fixed inset-0 z-[59]" onClick={() => setAbierto(false)} aria-hidden />
            <div
              role="dialog"
              aria-label={`Ritmo reciente — ${referencia}`}
              style={{ top: pos.top, left: pos.left, width: ANCHO }}
              className="card-cayla fixed z-[60] p-4 text-xs"
            >
              <p className="label-cayla text-[10px] font-bold text-taupe">Ritmo reciente</p>
              <p className="mt-0.5 text-[11px] text-tinta/55">
                {referencia} · <span className="font-mono">{sku}</span>
              </p>

              {ritmo.tipo === "insuficiente" ? (
                <>
                  <p className="mt-3 text-tinta/80">
                    Aún no calculamos un Ritmo reciente: solo hay {ritmo.dias.length} {ritmo.dias.length === 1 ? "jornada" : "jornadas"} de exposición comercial.
                  </p>
                  <DesgloseDias dias={ritmo.dias} />
                  <p className="mt-3 text-[11px] text-tinta/55">
                    Desde {minDiasExposicionRitmo} jornadas completas de exposición se calcula el Ritmo reciente.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-tinta/55">Últimos {VENTANA_RITMO_RECIENTE_DIAS} días</p>
                  <p className="mt-1 text-tinta/80">
                    Vendido comercial: <span className="font-medium tabular-nums text-tinta">{totalVentas}</span> uds
                  </p>
                  <p className="mt-0.5 text-tinta/80">
                    Jornadas de exposición en piso: <span className="font-medium tabular-nums text-tinta">{ritmo.dias.length}</span> {ritmo.dias.length === 1 ? "jornada" : "jornadas"}
                  </p>
                  <p className="mt-2 border-t border-tinta/10 pt-2 font-medium tabular-nums text-tinta">
                    Cálculo: {totalVentas} ÷ {ritmo.dias.length} = {textoRitmoReciente(ritmo)}
                  </p>
                  <p className="mt-2 text-[11px] text-tinta/55">
                    {ritmo.tipo === "sin_salida"
                      ? "No se vendió nada en las jornadas con stock disponible en piso — el número es real, no una falla del cálculo."
                      : "Solo se cuentan las jornadas en que la variante tuvo stock disponible en piso."}
                  </p>
                  <DesgloseDias dias={ritmo.dias} />
                </>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

function DesgloseDias({ dias }: { dias: readonly { fecha: string; ventas: number }[] }) {
  if (dias.length === 0) return null;
  return (
    <div className="mt-3 space-y-1 border-t border-tinta/10 pt-2">
      {dias.map((d, i) => (
        <p key={d.fecha} className="flex items-center justify-between text-tinta/70">
          <span>
            Día {i + 1} — {etiquetaRango({ desde: d.fecha, hasta: d.fecha })}
          </span>
          <span className="tabular-nums text-tinta">
            {d.ventas} {d.ventas === 1 ? "ud" : "uds"}
          </span>
        </p>
      ))}
    </div>
  );
}
