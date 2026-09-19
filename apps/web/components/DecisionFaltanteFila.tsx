"use client";

import { SelectNativo } from "@/components/ui/campos";
import { ETIQUETA_MOTIVO_CIERRE, type MotivoCierre } from "@/lib/compras-reglas";
import type { DecisionFaltante } from "@/lib/recepciones-reglas";

// Qué pasó con lo que faltó, EN LA MISMA FILA (ADR-0111, corrección 2026-09-18). Cuando una línea llega
// con menos de lo pendiente, debajo de ella se abre este editor: se elige si se espera lo que falta o
// por qué no va a llegar (una píldora, un toque; spike de Recibir, 2026-09-19), y la decisión queda a la
// vista en la columna Estado de la tabla.
//
// Elegir guarda la decisión EN LA GUÍA, no en la base: los cierres son irreversibles (libro
// append-only) y una decisión tomada antes de confirmar la recepción puede cambiar si se corrige el
// conteo. Todo se registra junto, en una sola transacción, con el botón de confirmar de la barra fija.
//
// Todos los botones son `type="button"`: esto vive dentro del <form> de la guía y un botón sin tipo
// la enviaría (y recibiría la mercadería).

export type Decision = DecisionFaltante<MotivoCierre>;

const VALOR_VACIO = "";

export function etiquetaDecision(d: Decision): string {
  return d === "espero" ? "Lo espero: sigue pendiente" : `Se cierra: ${ETIQUETA_MOTIVO_CIERRE[d]}`;
}

export function OpcionesDecision() {
  return (
    <>
      <option value="espero">Aún no llegan: los espero</option>
      <optgroup label="No van a llegar: se cierra el faltante">
        {(Object.keys(ETIQUETA_MOTIVO_CIERRE) as MotivoCierre[]).map((m) => (
          <option key={m} value={m}>
            {ETIQUETA_MOTIVO_CIERRE[m]}
          </option>
        ))}
      </optgroup>
    </>
  );
}

/** Una respuesta posible: una píldora que se elige con un toque. */
function Pildora({ elegida, onClick, children }: { elegida: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={elegida}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12.5px] transition-colors ${elegida ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-papel text-tinta/75 hover:border-rojo hover:text-rojo"}`}
    >
      {children}
    </button>
  );
}

/**
 * El editor: «Faltan 4 · ¿qué pasó?» y las respuestas como píldoras. UN toque decide (antes eran un select y un
 * «Guardar»: tres gestos por fila, y con ocho filas cortas era lo que más cansaba). La regla no cambia: mientras
 * una fila corta no tenga decisión, la barra fija no deja recibir.
 */
export function EditorDecision({
  nombre,
  faltan,
  inicial,
  onGuardar,
  onCancelar,
}: {
  nombre: string;
  faltan: number;
  inicial?: Decision;
  onGuardar: (d: Decision) => void;
  /** Solo cuando ya hay una decisión guardada que se está corrigiendo. */
  onCancelar?: () => void;
}) {
  return (
    <div role="group" aria-label={`Qué pasó con lo que falta de ${nombre}`} className="anim-revelar mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border border-ambar/40 bg-ambar/[0.06] px-4 py-2.5">
      <span className="mr-1 text-[13px] text-tinta">
        ¿Qué pasó con {faltan === 1 ? "la" : `las ${faltan}`} que {faltan === 1 ? "falta" : "faltan"}?
      </span>
      <Pildora elegida={inicial === "espero"} onClick={() => onGuardar("espero")}>
        Aún no llegan: los espero
      </Pildora>
      {(Object.keys(ETIQUETA_MOTIVO_CIERRE) as MotivoCierre[]).map((m) => (
        <Pildora key={m} elegida={inicial === m} onClick={() => onGuardar(m)}>
          {ETIQUETA_MOTIVO_CIERRE[m]}
        </Pildora>
      ))}
      {onCancelar && (
        <button type="button" onClick={onCancelar} className="label-cayla ml-1 text-[11px] text-tinta/65 hover:text-rojo">
          Cancelar
        </button>
      )}
    </div>
  );
}

/** La decisión ya guardada, bajo el chip de estado de la fila, con su «Editar». */
export function ResumenDecision({ decision, onEditar }: { decision: Decision; onEditar: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className={`text-[11px] leading-tight ${decision === "espero" ? "text-tinta/65" : "font-semibold text-tinta"}`}>{etiquetaDecision(decision)}</span>
      <button type="button" onClick={onEditar} className="label-cayla text-[10px] text-rojo hover:underline">
        Editar
      </button>
    </span>
  );
}

/** «Decidir todas»: aplica la misma decisión a todas las filas con faltante de un comprobante. */
export function DecidirTodas({ cuantas, onDecidir }: { cuantas: number; onDecidir: (d: Decision) => void }) {
  return (
    <div className="w-72 max-w-full">
      <SelectNativo
        aria-label={`Decidir las ${cuantas} filas con faltante`}
        value={VALOR_VACIO}
        onChange={(e) => e.target.value !== VALOR_VACIO && onDecidir(e.target.value as Decision)}
      >
        <option value={VALOR_VACIO} disabled>
          Decidir las {cuantas} filas con faltante…
        </option>
        <OpcionesDecision />
      </SelectNativo>
    </div>
  );
}
