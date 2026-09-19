"use client";

import { useEffect, type ReactNode, type RefObject } from "react";
import { AlertTriangle, ArrowLeft, Check, Clock } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { ImpactoVista, ListaValidaciones } from "@/components/CambioResumen";
import type { ImpactoOperacion, Validacion } from "@/lib/cambios-reglas";

// Las piezas que Cambios y Devoluciones comparten (2026-09-18): las dos son un flujo
// guiado en la misma página —sin modal, ADR-0044— con "Paso X de N", validaciones en vivo
// y los mismos botones. Vivían dentro de `CambiosFlujo`; se extraen al armar Devoluciones
// para no mantener dos copias que se desalineen.

/** Las opciones de un campo de elección (motivo, talla, estado): elegido = tinta, no rojo —
 *  un paso marca varias a la vez y varios rojos juntos pasan el tope de
 *  `MAX_ROJO_POR_PANTALLA` (design-tokens.ts). */
export const OPCION =
  "min-h-11 rounded-[14px] border px-[17px] py-2 text-[14.5px] font-medium transition-[background-color,border-color,color,transform] duration-300 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0";
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

/** Los pasos son un hilo (Atelier, 2026-09-19): una línea punteada de nudo a nudo, y encima
 *  el tramo ya cosido, en tinta, que se dibuja al entrar y avanza al cambiar de paso; una
 *  chispa de luz lo recorre de vez en cuando. Los nudos hechos son botones: se puede volver. */
function Pasos({ pasos, actual, onIr }: { pasos: readonly string[]; actual: number; onIr: (n: number) => void }) {
  const total = pasos.length;
  // Cada nudo está al centro de su columna: el hilo va del primero al último.
  const inicio = 50 / total;
  const largo = 100 - 100 / total;
  const avance = ((actual - 1) / (total - 1)) * largo;
  return (
    <ol className="relative grid pt-0.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-label="Pasos">
      <span
        aria-hidden
        className="absolute top-[17px] h-0.5 rounded-full"
        style={{ left: `${inicio}%`, width: `${largo}%`, backgroundImage: "repeating-linear-gradient(90deg, rgba(164,120,101,0.5) 0 6px, transparent 6px 11px)" }}
      />
      <span
        aria-hidden
        className="hilo-dibuja absolute top-[17px] h-0.5 rounded-full bg-tinta transition-[width] duration-700 ease-[var(--ease-cayla)]"
        style={{ left: `${inicio}%`, width: `${avance}%` }}
      />
      <span aria-hidden className="pointer-events-none absolute top-3 h-3 transition-[width] duration-700" style={{ left: `${inicio}%`, width: `${avance}%` }}>
        <i className="aguja-hilo absolute top-0 -ml-1.5 h-3 w-3 rounded-full bg-[radial-gradient(circle,#fff,rgba(255,255,255,0)_70%)]" />
      </span>
      {pasos.map((nombre, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const esActual = n === actual;
        return (
          <li key={nombre} className="relative flex justify-center">
            <button
              type="button"
              disabled={!hecho}
              onClick={() => onIr(n)}
              aria-current={esActual ? "step" : undefined}
              title={hecho ? `Volver a «${nombre}»` : undefined}
              className="group flex flex-col items-center gap-2.5 rounded-md disabled:cursor-default"
            >
              <span
                style={hecho ? { animationDelay: `${i * 260 + 500}ms` } : undefined}
                className={`flex h-[34px] w-[34px] items-center justify-center rounded-full text-sm font-semibold transition-colors duration-200 ${
                  hecho
                    ? "anim-pop bg-tinta text-crema group-hover:bg-tinta/80"
                    : esActual
                      ? "bg-papel text-tinta shadow-[0_0_0_8px_rgba(26,26,24,0.06)] ring-2 ring-tinta"
                      : "bg-crema text-tinta/65 ring-[1.5px] ring-taupe/60"
                }`}
              >
                {hecho ? <Check className="h-4 w-4" aria-hidden /> : n}
              </span>
              <span className={`text-sm ${esActual ? "font-semibold text-tinta" : `hidden sm:inline ${hecho ? "text-tinta/80 group-hover:underline" : "text-tinta/65"}`}`}>
                {nombre}
              </span>
              <span className="sr-only">{hecho ? `${nombre}, hecho` : esActual ? `${nombre}, paso actual` : `${nombre}, pendiente`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** El anillo de «cuántas revisiones van»: se llena solo al ir cumpliéndose. */
function AnilloProgreso({ pct }: { pct: number }) {
  return (
    <svg viewBox="0 0 36 36" className="anillo-progreso h-full w-full" aria-hidden>
      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="3" />
      <circle
        className="rg"
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        style={{ strokeDasharray: `${pct} 100` }}
      />
    </svg>
  );
}

/** "Lo que el sistema revisa": las validaciones en vivo, pegadas al costado en escritorio.
 *  Arriba, un anillo con cuántas van cumplidas (un aviso —como el plazo vencido en una
 *  devolución— no frena, así que cuenta como revisado) y el plazo de la compra, verde o
 *  rojo. Con `impacto`, debajo una segunda tarjeta con lo que va a pasar en el inventario
 *  y en la caja: se ve mientras se elige, no solo al final. */
export function PanelValidaciones({ validaciones, impacto }: { validaciones: readonly Validacion[]; impacto?: ImpactoOperacion | null }) {
  const total = validaciones.length;
  const cumplidas = validaciones.filter((v) => v.estado === "ok" || v.estado === "aviso").length;
  const completo = cumplidas === total;
  const plazo = validaciones.find((v) => v.clave === "plazo");
  return (
    <aside className="grid gap-4 self-start lg:sticky lg:top-24">
      <div className="rounded-[22px] bg-papel p-6 ring-1 ring-tinta/[0.07]">
        <div className="mb-5 flex items-center gap-4">
          <div className={`relative h-[68px] w-[68px] shrink-0 transition-colors duration-500 ${completo ? "text-verde" : "text-ambar"}`}>
            <AnilloProgreso pct={total ? (cumplidas / total) * 100 : 0} />
            <span aria-hidden className="font-display absolute inset-0 grid place-items-center text-xl tabular-nums text-tinta">
              {cumplidas}/{total}
            </span>
            <span className="sr-only">
              {cumplidas} de {total} revisiones cumplidas
            </span>
          </div>
          <div className="min-w-0 space-y-1.5">
            <h3 className="font-display text-[22px] leading-tight text-tinta">Lo que revisa el sistema</h3>
            {plazo &&
              (plazo.tono === "rojo" ? (
                <Chip tono="rojo" versalitas={false}>
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  Fuera del plazo
                </Chip>
              ) : (
                <Chip tono="verde" versalitas={false}>
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  Dentro del plazo
                </Chip>
              ))}
          </div>
        </div>
        <ListaValidaciones validaciones={validaciones} />
      </div>
      {impacto && (
        <div className="rounded-[22px] bg-papel p-6 ring-1 ring-tinta/[0.07]">
          <h3 className="font-display mb-4 text-xl text-tinta">Impacto</h3>
          <ImpactoVista impacto={impacto} compacto />
        </div>
      )}
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
      className="boton-brillo alza-cayla inline-flex h-12 items-center gap-2 rounded-full bg-tinta px-7 text-sm font-semibold text-crema transition-colors duration-200 hover:bg-tinta/90 disabled:opacity-60"
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
      className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-tinta ring-1 ring-tinta/15 transition-colors duration-200 hover:bg-papel hover:ring-tinta/30 disabled:opacity-50"
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
      className="boton-brillo alza-cayla inline-flex h-12 items-center gap-2 rounded-full bg-rojo px-7 text-sm font-semibold text-crema transition-colors duration-200 hover:bg-rojo-profundo disabled:opacity-70"
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
