"use client";

import type { ReactNode } from "react";

// Piezas compartidas del formulario "Nuevo producto" (ADR-0106).
//
// Regla de marca (globals.css): el rojo es acento, máx. 2 por pantalla. El
// formulario anterior pintaba de rojo cada chip elegido; acá "elegido" se
// dice con tinta (borde y fondo oscuros suaves + marca ✓), el rojo queda para
// lo que bloquea, y el ámbar para lo que avisa pero deja seguir.

/** Un paso del recorrido. Cerrado = se ve atenuado y no se puede tocar, pero NO se oculta: la persona ve el camino completo. */
export function Bloque({
  numero,
  titulo,
  ayuda,
  bloqueado = false,
  bloqueadoTexto,
  listo = false,
  derecha,
  children,
}: {
  numero: number;
  titulo: string;
  ayuda?: ReactNode;
  bloqueado?: boolean;
  /** Qué falta para abrir este paso, en la voz de la persona ("Elige primero la categoría"). */
  bloqueadoTexto?: string;
  listo?: boolean;
  derecha?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`bloque-${numero}`}
      className={`card-cayla p-5 transition-opacity ${bloqueado ? "opacity-55" : ""}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums ${
              listo ? "border-verde bg-verde text-crema" : "border-tinta/30 text-tinta/70"
            }`}
          >
            {listo ? "✓" : numero}
          </span>
          <div>
            <h2 id={`bloque-${numero}`} className="label-cayla text-[11px] text-tinta/80">
              {titulo}
            </h2>
            {ayuda && !bloqueado && <p className="mt-1 text-xs text-tinta/60">{ayuda}</p>}
            {bloqueado && bloqueadoTexto && <p className="mt-1 text-xs text-tinta/60">{bloqueadoTexto}</p>}
          </div>
        </div>
        {derecha && !bloqueado && <div className="shrink-0">{derecha}</div>}
      </header>
      {/* `inert`: un bloque cerrado no recibe foco ni clics, ni con teclado. */}
      <div className={bloqueado ? "hidden" : "mt-4"} {...(bloqueado ? { inert: true } : {})}>
        {children}
      </div>
    </section>
  );
}

/** El chip de elegir/desmarcar. `aria-pressed` para que un lector de pantalla diga "activado". */
export function ChipOpcion({
  elegido,
  onClick,
  children,
  className = "",
  disabled = false,
}: {
  elegido: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={elegido}
      disabled={disabled}
      className={`flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors disabled:opacity-40 ${
        elegido ? "border-tinta bg-tinta/[0.07] text-tinta" : "border-tinta/15 text-tinta/75 hover:border-tinta/40"
      } ${className}`}
    >
      {elegido && (
        <span aria-hidden className="text-[11px] leading-none">
          ✓
        </span>
      )}
      {children}
    </button>
  );
}

type TonoAvisoInline = "rojo" | "ambar" | "neutro";

const TONOS: Record<TonoAvisoInline, string> = {
  rojo: "border-rojo/40 bg-rojo/[0.05] text-rojo-profundo",
  ambar: "border-ambar/40 bg-ambar/[0.06] text-ambar-profundo",
  neutro: "border-tinta/15 bg-tinta/[0.03] text-tinta/75",
};

/** Franja de aviso dentro de un bloque. `role=alert` solo cuando bloquea. */
export function AvisoInline({ tono, children, alerta = false }: { tono: TonoAvisoInline; children: ReactNode; alerta?: boolean }) {
  return (
    <div role={alerta ? "alert" : "status"} className={`rounded-md border px-3 py-2.5 text-sm ${TONOS[tono]}`}>
      {children}
    </div>
  );
}
