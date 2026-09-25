"use client";

import type { ReactNode } from "react";

// Piezas compartidas del formulario "Nuevo producto" (ADR-0109).
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

/**
 * Un paso del alta en acordeón (spike 2026-09-24): reemplaza a `Bloque` en Nuevo producto. Solo uno está abierto; el
 * hecho se pliega en UNA línea con su resumen y «Cambiar»; el que viene es una línea punteada, sin texto que leer.
 * El paso abierto lleva abajo qué le falta y el botón «Seguir» (el último no: ahí manda «Crear producto»).
 */
export function PasoAlta({
  numero,
  titulo,
  estado,
  resumen,
  onAbrir,
  falta,
  onSeguir,
  textoSeguir = "Seguir",
  children,
}: {
  numero: number;
  titulo: string;
  estado: "abierto" | "hecho" | "pendiente";
  /** La línea del paso plegado («Blusa Lirio · CAYLA (Taller Lima)»). */
  resumen?: ReactNode;
  onAbrir: () => void;
  /** Lo primero que le falta; null = el paso está completo. */
  falta?: string | null;
  /** Sin esto, el paso no lleva pie (el paso 1 avanza solo al elegir la categoría). */
  onSeguir?: () => void;
  textoSeguir?: string;
  children: ReactNode;
}) {
  const id = `paso-${numero}`;
  if (estado === "hecho") {
    return (
      <section aria-labelledby={id} className="rounded-xl border border-sand bg-papel">
        <button type="button" onClick={onAbrir} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-3.5 text-left sm:flex-nowrap sm:px-5">
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verde text-[11px] text-crema">
            ✓
          </span>
          <h2 id={id} className="flex-1 text-[14.5px] font-semibold text-tinta sm:flex-none">
            {titulo}
          </h2>
          <span className="order-3 w-full min-w-0 truncate pl-9 text-[13px] text-taupe sm:order-none sm:w-auto sm:flex-1 sm:pl-0 sm:text-[13.5px]">{resumen}</span>
          <span className="btn-cayla btn-enlace shrink-0 text-[12.5px]">Cambiar</span>
        </button>
      </section>
    );
  }
  if (estado === "pendiente") {
    return (
      <section aria-labelledby={id} className="rounded-xl border border-dashed border-sand">
        <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-tinta/25 text-[11px] tabular-nums text-tinta/60">
            {numero}
          </span>
          <h2 id={id} className="text-[14.5px] font-medium text-tinta/45">
            {titulo}
          </h2>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby={id} className="rounded-xl border border-sand bg-papel">
      <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tinta text-[11px] tabular-nums text-crema">
          {numero}
        </span>
        <h2 id={id} className="text-[14.5px] font-semibold text-tinta">
          {titulo}
        </h2>
      </div>
      {/* La entrada SIN `fill-mode: both` (a diferencia de `anim-revelar`): terminada, no le deja un `transform` puesto al
          contenedor. Si se lo dejara, las listas en `position: fixed` de adentro (ComboBuscable, el combo Responsable) se
          medirían contra este cuadro y no contra la ventana, y abrirían corridas lejos de su campo. */}
      <div className="px-4 pb-5 pt-3 [animation:cayla-revelar_240ms_var(--ease-cayla)] sm:pl-14 sm:pr-5">
        {children}
        {onSeguir && (
          <div className="mt-5 flex items-center justify-end gap-3 border-t border-sand pt-4">
            <p className="mr-auto text-[12.5px] text-taupe">{falta}</p>
            <button type="button" onClick={onSeguir} disabled={Boolean(falta)} className="btn-cayla btn-primario">
              {textoSeguir} →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Una fila de campo dentro de un paso: etiqueta y ayuda a la izquierda, controles a la derecha (apilados en celular). */
export function FilaAlta({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-2 border-t border-sand py-3.5 first:border-t-0 first:pt-1 md:grid-cols-[8rem_minmax(0,1fr)]">
      <div className="md:pt-2">
        <p className="text-[12.5px] font-semibold text-tinta">{etiqueta}</p>
        {ayuda && <p className="text-[11.5px] leading-snug text-taupe">{ayuda}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
