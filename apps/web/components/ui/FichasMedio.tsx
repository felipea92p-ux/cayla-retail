"use client";

import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import type { MetodoPagoVenta } from "@cayla-retail/shared";
import { iconoMetodo } from "@/components/PuntoDeVentaTicket";

/**
 * Las fichas de medio de pago, ACOSTADAS (50 px): las mismas de la hoja de cobro de Vender —el ícono y el color de cada medio, se
 * rellenan al elegir—, sin ocupar tanto espacio (Felipe 2026-10-12, «similar al de cobrar»). Nació en el gasto rápido de Caja
 * («¿Cómo lo pagaste?», `GastoRapidoModal`, que todavía tiene su copia local) y aquí queda como pieza para toda hoja que pregunta
 * cómo se pagó: hoy, el pago de un pedido web (ADR-0408, actividad 9). Estilos: `.hoja-cobro-medio.es-acostada` (globals.css).
 *
 * Un radiogroup: una sola parada de Tab (la elegida o, sin ninguna, la primera) y las flechas cambian de medio. `valor` null: todavía
 * no se eligió ninguno (la guía de foco lo pide). `guia(clave)`: el `data-guia` de cada ficha, para que la demo la toque.
 */
export function FichasMedio<M extends MetodoPagoVenta>({
  opciones,
  valor,
  onValor,
  etiqueta,
  className = "grid grid-cols-3 gap-2",
  guia,
  deshabilitado = false,
}: {
  /** `corta`: el nombre en una ficha angosta (un celular): «Transf.» en vez de «Transferencia», que no cabe acostada. */
  opciones: readonly { clave: M; etiqueta: string; corta?: string }[];
  valor: M | null;
  onValor: (m: M) => void;
  /** Para el lector de pantalla: «Cómo pagó». */
  etiqueta: string;
  /** La grilla (cuántas por fila). */
  className?: string;
  guia?: (clave: M) => string | undefined;
  deshabilitado?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function alTeclado(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta || deshabilitado) return;
    e.preventDefault();
    const siguiente = (i + delta + opciones.length) % opciones.length;
    onValor(opciones[siguiente]!.clave);
    refs.current[siguiente]?.focus();
  }
  const hayElegida = opciones.some((o) => o.clave === valor);
  return (
    <div role="radiogroup" aria-label={etiqueta} className={className}>
      {opciones.map((o, i) => {
        const elegida = o.clave === valor;
        return (
          <button
            key={o.clave}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={elegida}
            tabIndex={elegida || (!hayElegida && i === 0) ? 0 : -1}
            disabled={deshabilitado}
            data-guia={guia?.(o.clave)}
            onClick={() => onValor(o.clave)}
            onKeyDown={(e) => alTeclado(e, i)}
            className={`metodo-${o.clave} hoja-cobro-medio es-acostada ${elegida ? "es-elegido" : ""}`}
          >
            {elegida && (
              <span className="hoja-cobro-marca">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
              </span>
            )}
            <span className="hoja-cobro-acostada">
              <span className="hoja-cobro-icono">{iconoMetodo(o.clave, "h-full w-full")}</span>
              <span className="hoja-cobro-nombre label-cayla font-bold leading-none">
                {o.corta ? (
                  <>
                    <span className="max-sm:hidden">{o.etiqueta}</span>
                    <span className="sm:hidden">{o.corta}</span>
                  </>
                ) : (
                  o.etiqueta
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
