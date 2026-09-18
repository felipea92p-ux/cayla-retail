"use client";

import { useEffect, type ReactNode, type RefObject } from "react";
import { AlertTriangle, ArrowLeft, Check } from "lucide-react";
import { ListaValidaciones } from "@/components/CambioResumen";
import type { Validacion } from "@/lib/cambios-reglas";

// Las piezas que Cambios y Devoluciones comparten (2026-09-18): las dos son un flujo
// guiado en la misma página —sin modal, ADR-0044— con "Paso X de N", validaciones en vivo
// y los mismos botones. Vivían dentro de `CambiosFlujo`; se extraen al armar Devoluciones
// para no mantener dos copias que se desalineen.

/** Las opciones de un campo de elección (motivo, talla, estado): elegido = tinta, no rojo —
 *  un paso marca varias a la vez y varios rojos juntos pasan el tope de
 *  `MAX_ROJO_POR_PANTALLA` (design-tokens.ts). */
export const OPCION =
  "h-10 rounded-lg border px-4 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40";
export const OPCION_INACTIVA = `${OPCION} border-tinta/15 bg-papel text-tinta/80 hover:border-tinta/40 hover:text-tinta`;
export const OPCION_ACTIVA = `${OPCION} border-tinta bg-tinta text-crema`;

/** El foco sigue al paso: quien navega con teclado o lector de pantalla oye dónde está. */
export function useFocoAlCambiarDePaso(ref: RefObject<HTMLElement | null>, paso: unknown) {
  useEffect(() => {
    ref.current?.focus();
  }, [ref, paso]);
}

/** Escape retrocede un paso. Dentro de un campo (input, select, textarea) Escape es del
 *  campo —borrar, cerrar su lista—, no del flujo; y mientras se guarda o en la pantalla
 *  de éxito no hace nada. */
export function useEscapeRetrocede(retroceder: () => void, activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    function alTeclado(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const destino = e.target as HTMLElement | null;
      if (destino && ["INPUT", "SELECT", "TEXTAREA"].includes(destino.tagName)) return;
      retroceder();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [retroceder, activo]);
}

/**
 * Lo primero de cada paso: cómo salir, "Paso X de N", la barra de pasos y el título.
 * `actual` va de 1 (la búsqueda, ya hecha al entrar) a `pasos.length`.
 */
export function EncabezadoFlujo({
  volverA,
  onVolver,
  deshabilitado,
  pasos,
  actual,
  onIrAPaso,
  titulo,
  refTitulo,
}: {
  volverA: string;
  onVolver: () => void;
  deshabilitado: boolean;
  pasos: readonly string[];
  actual: number;
  onIrAPaso: (n: number) => void;
  titulo: string;
  refTitulo: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onVolver}
          disabled={deshabilitado}
          className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-tinta/75 transition-colors duration-200 hover:bg-papel hover:text-tinta disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {volverA}
        </button>
        <p className="text-sm text-tinta/70" aria-live="polite">
          Paso {actual} de {pasos.length} · <span className="font-semibold text-tinta">{pasos[actual - 1]}</span>
        </p>
      </div>
      <Pasos pasos={pasos} actual={actual} onIr={onIrAPaso} />
      <h2 ref={refTitulo} tabIndex={-1} className="font-display scroll-mt-28 text-2xl text-tinta outline-none">
        {titulo}
      </h2>
    </>
  );
}

function Pasos({ pasos, actual, onIr }: { pasos: readonly string[]; actual: number; onIr: (n: number) => void }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Pasos">
      {pasos.map((nombre, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const esActual = n === actual;
        return (
          <li key={nombre} className={`flex items-center gap-2 sm:gap-3 ${n < pasos.length ? "min-w-0 flex-1" : ""}`}>
            <button
              type="button"
              disabled={!hecho}
              onClick={() => onIr(n)}
              aria-current={esActual ? "step" : undefined}
              title={hecho ? `Volver a «${nombre}»` : undefined}
              className="group flex shrink-0 items-center gap-2 rounded-md disabled:cursor-default"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 ${
                  hecho
                    ? "bg-tinta text-crema group-hover:bg-tinta/80"
                    : esActual
                      ? "bg-papel text-tinta ring-2 ring-tinta"
                      : "bg-papel text-tinta/65 ring-1 ring-tinta/20"
                }`}
              >
                {hecho ? <Check className="h-3.5 w-3.5" aria-hidden /> : n}
              </span>
              <span
                className={`hidden text-sm md:inline ${esActual ? "font-semibold text-tinta" : hecho ? "text-tinta/80 group-hover:underline" : "text-tinta/65"}`}
              >
                {nombre}
              </span>
              <span className="sr-only">{hecho ? `${nombre}, hecho` : esActual ? `${nombre}, paso actual` : `${nombre}, pendiente`}</span>
            </button>
            {n < pasos.length && <span aria-hidden className={`h-px min-w-3 flex-1 transition-colors duration-200 ${hecho ? "bg-tinta/50" : "bg-tinta/15"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** "Lo que el sistema revisa": las validaciones en vivo, pegadas al costado en escritorio. */
export function PanelValidaciones({ validaciones }: { validaciones: readonly Validacion[] }) {
  return (
    <aside className="self-start rounded-xl bg-papel p-5 ring-1 ring-tinta/[0.07] lg:sticky lg:top-24">
      <h3 className="mb-4 text-sm font-semibold text-tinta">Lo que el sistema revisa</h3>
      <ListaValidaciones validaciones={validaciones} />
    </aside>
  );
}

/** Un dato con su título arriba — para los resúmenes de confirmación y de éxito. */
export function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-tinta/70">{titulo}</dt>
      <dd className="mt-0.5 text-tinta">{children}</dd>
    </div>
  );
}

/** Los botones del paso, y debajo —pegado a ellos— el motivo por el que no se puede seguir. */
export function PieDelPaso({ aviso, children }: { aviso: string | null; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>
      {aviso && (
        <p className="anim-revelar flex items-start justify-end gap-1.5 text-sm text-ambar-profundo" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {aviso}
        </p>
      )}
    </div>
  );
}

export function BotonPrincipal({ onClick, children, disabled = false }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="alza-cayla inline-flex h-11 items-center gap-2 rounded-lg bg-tinta px-6 text-sm font-semibold text-crema transition-colors duration-200 hover:bg-tinta/85 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function BotonSecundario({ onClick, children, disabled = false }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium text-tinta ring-1 ring-tinta/15 transition-colors duration-200 hover:bg-papel hover:ring-tinta/30 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** El único rojo del flujo: la acción que mueve stock o plata de verdad. */
export function BotonRojo({ onClick, children, disabled = false }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="alza-cayla inline-flex h-11 items-center gap-2 rounded-lg bg-rojo px-6 text-sm font-semibold text-crema transition-colors duration-200 hover:bg-rojo-profundo disabled:opacity-70"
    >
      {children}
    </button>
  );
}

/** El aviso de que la base rechazó la operación. Recibe el foco (por su `refAviso`) para
 *  que se lea y se oiga sin buscarlo. `traducirError` abre con "No se pudo …" cuando no
 *  reconoce el error; con un mensaje de la base ("Stock insuficiente…") hay que decir además
 *  que no se guardó nada. */
export function AvisoDeError({ error, refAviso, queNoSeHizo }: { error: string; refAviso: RefObject<HTMLDivElement | null>; queNoSeHizo: string }) {
  return (
    <div
      ref={refAviso}
      tabIndex={-1}
      role="alert"
      className="anim-revelar flex gap-3 rounded-xl border border-rojo/30 bg-rojo/[0.06] px-4 py-3 text-sm text-rojo-profundo outline-none"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        {!error.startsWith("No se pudo") && <span className="font-semibold">{queNoSeHizo} </span>}
        {error}
      </p>
    </div>
  );
}
