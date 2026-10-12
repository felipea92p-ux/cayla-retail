"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useDestinoFlotante, usePosicionAnclada } from "@/components/ui/useAnclaje";
import { esMismoMes, mesAnterior, mesSiguiente, type Mes } from "@/lib/facturacion-reglas";
import { mesesDelSelector, nombreDelMes } from "@/lib/historial-cierres-reglas";

const ANCHO = 268;

/**
 * Elegir un mes (Felipe 2026-10-12, Historial de cierres): «‹ Octubre 2026 ›». Las flechas pasan al mes de al lado; al
 * tocar el nombre se abren los doce meses del año, con los que todavía no llegan bloqueados (se ven con su candado, no se
 * eligen), y arriba «‹ 2026 ›» para ir a los meses del año pasado. Nunca se pasa del mes actual: no hay nada que ver.
 *
 * Dentro de una hoja, el panel se cuelga de su capa flotante (`useDestinoFlotante`, ADR-0211) y su Escape no cierra la
 * hoja: lo usa para cerrarse y corta la propagación (ADR-0136, «Escape dentro de una hoja»).
 */
export function SelectorMes({
  valor,
  actual,
  onCambiar,
  anioMinimo = actual.anio - 3,
}: {
  valor: Mes;
  /** El mes de hoy: el último que se puede elegir. */
  actual: Mes;
  onCambiar: (mes: Mes) => void;
  /** El año más antiguo al que se puede ir. */
  anioMinimo?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [anio, setAnio] = useState(valor.anio);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // El panel se alinea con el borde izquierdo de toda la píldora («‹ Octubre 2026 ›»), no solo del nombre.
  const grupo = useRef<HTMLDivElement>(null);
  const pos = usePosicionAnclada(grupo, abierto, ANCHO);
  const destino = useDestinoFlotante(grupo, abierto);

  const previo = mesAnterior(valor);
  const hayPrevio = previo.anio >= anioMinimo;
  const haySiguiente = valor.anio * 12 + valor.mes < actual.anio * 12 + actual.mes;

  function abrir() {
    setAnio(valor.anio);
    setAbierto(true);
  }

  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  function elegir(mes: Mes) {
    onCambiar(mes);
    cerrar();
  }

  // Al abrir, el foco va al mes elegido (o al primero que se pueda elegir), para seguir con el teclado.
  useEffect(() => {
    if (!abierto || !pos) return;
    const id = requestAnimationFrame(() => {
      const elegido = panel.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? panel.current?.querySelector<HTMLElement>("button[data-mes]:not(:disabled)");
      elegido?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [abierto, pos]);

  // Escape cierra el panel y se queda con la tecla: la hoja de abajo sigue abierta.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  return (
    <div ref={grupo} className="inline-flex items-center gap-0.5 rounded-full border border-sand bg-papel p-[3px]">
      <button
        type="button"
        aria-label={`Ir a ${nombreDelMes(previo)}`}
        disabled={!hayPrevio}
        onClick={() => onCambiar(previo)}
        className="grid h-8 w-8 place-items-center rounded-full text-tinta transition-colors hover:bg-sand/60 disabled:pointer-events-none disabled:text-tinta/25"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => (abierto ? cerrar() : abrir())}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-tinta transition-colors hover:bg-sand/60 aria-expanded:bg-sand/60"
      >
        {nombreDelMes(valor)}
        <ChevronDown className="h-3.5 w-3.5 text-tinta/60" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={haySiguiente ? `Ir a ${nombreDelMes(mesSiguiente(valor))}` : "Ya estás en el mes actual"}
        disabled={!haySiguiente}
        onClick={() => onCambiar(mesSiguiente(valor))}
        className="grid h-8 w-8 place-items-center rounded-full text-tinta transition-colors hover:bg-sand/60 disabled:pointer-events-none disabled:text-tinta/25"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>

      {abierto &&
        pos &&
        destino &&
        createPortal(
          <>
            {/* Tocar afuera cierra, como `MenuAcciones`. */}
            <div className="fixed inset-0 z-[59]" onClick={() => cerrar(false)} aria-hidden />
            <div
              ref={panel}
              role="dialog"
              aria-label="Elegir el mes"
              style={{ top: pos.top, left: pos.left, width: ANCHO }}
              className="anim-revelar fixed z-[60] rounded-[14px] border border-sand bg-papel p-2 shadow-[0_18px_40px_-16px_color-mix(in_srgb,var(--color-sombra)_40%,transparent)]"
            >
              <div className="flex items-center justify-between px-1 pb-2 pt-0.5">
                <button
                  type="button"
                  aria-label={`Ver los meses de ${anio - 1}`}
                  disabled={anio - 1 < anioMinimo}
                  onClick={() => setAnio((a) => a - 1)}
                  className="grid h-8 w-8 place-items-center rounded-full text-tinta transition-colors hover:bg-sand/60 disabled:pointer-events-none disabled:text-tinta/25"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="font-display text-[19px] leading-none text-tinta tabular-nums" aria-live="polite">
                  {anio}
                </span>
                <button
                  type="button"
                  aria-label={`Ver los meses de ${anio + 1}`}
                  disabled={anio + 1 > actual.anio}
                  onClick={() => setAnio((a) => a + 1)}
                  className="grid h-8 w-8 place-items-center rounded-full text-tinta transition-colors hover:bg-sand/60 disabled:pointer-events-none disabled:text-tinta/25"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {mesesDelSelector(anio, actual).map((m) => {
                  const elegido = esMismoMes({ anio, mes: m.mes }, valor);
                  const esActual = esMismoMes({ anio, mes: m.mes }, actual);
                  return (
                    <button
                      key={m.mes}
                      type="button"
                      data-mes={m.mes}
                      disabled={m.bloqueado}
                      aria-current={elegido ? "true" : undefined}
                      aria-label={m.bloqueado ? `${m.nombre} ${anio}: todavía no llega` : `${m.nombre} ${anio}`}
                      onClick={() => elegir({ anio, mes: m.mes })}
                      className={`relative flex h-10 items-center justify-center gap-1 rounded-[10px] text-[13px] font-semibold transition-colors ${
                        elegido
                          ? "bg-tinta text-crema"
                          : m.bloqueado
                            ? "cursor-not-allowed text-tinta/30"
                            : "text-tinta hover:bg-sand/60"
                      }`}
                    >
                      {m.nombre.slice(0, 3)}
                      {m.bloqueado && <Lock className="h-3 w-3" aria-hidden />}
                      {esActual && !elegido && <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-rojo" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          destino,
        )}
    </div>
  );
}
