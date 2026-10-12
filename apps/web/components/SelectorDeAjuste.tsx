"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { limpiarTextoAjuste, textoTrasPaso, type ModoAjuste } from "@/lib/ajuste-reglas";
import { Aviso } from "@/components/ui/Aviso";

/** Una talla del ajuste, ya dicha en voz de tienda (la arma `AjustarInventarioModal` con las reglas de `lib/ajuste-reglas.ts`). */
export type FilaDeAjuste = {
  varianteId: string;
  talla: string;
  /** La primera línea: cuánto hay en el lugar («2 en el almacén»). */
  principal: string;
  /** La segunda línea: cómo queda, lo apartado, si es nueva en la tienda. Vacía: no se dibuja. */
  detalle: string;
  /** Lo que dice el sistema que hay: al contar, el primer toque de «+» o «−» parte de aquí. */
  actual: number;
  /** El tope de abajo de los botones «−» (`minimoDeAjuste`): más abajo la base lo rechazaría. */
  minimo: number;
};

// La lista de tallas de «Ajustar» (ADR-0300): la talla en una insignia, dos líneas de texto y un control − 0 +. (Hasta ADR-0317 «Reponer» y «Subir» usaban la misma
// forma; desde 2026-10-06 se hacen paso a paso en el panel de la talla, `FlujoTalla`.) Se distingue en una
// cosa: aquí el número puede ser negativo (restar) o «sin contar» (vacío), según el motivo: con «Conteo físico», cuántas hay; con
// los demás, cuánto se suma o se resta. El valor se guarda tal cual lo escribió la persona (texto): `lineasDeAjuste` decide qué es
// un ajuste. Los botones y el teclado pasan por `textoTrasPaso` y `limpiarTextoAjuste` (lógica pura, con sus pruebas).
export function SelectorDeAjuste({
  filas,
  textos,
  modo,
  etiquetaControl,
  problemas,
  bloqueado,
  onTexto,
  extra,
}: {
  filas: readonly FilaDeAjuste[];
  /** Lo escrito en cada talla, por variante. Lo que no está aquí está vacío. */
  textos: Readonly<Record<string, string>>;
  modo: ModoAjuste;
  /** Qué se escribe, para el lector de pantalla («Suma o resta», «Contaste en el piso»). */
  etiquetaControl: string;
  /** Por qué una talla no se puede ajustar con lo escrito, por variante (`textoProblemaTalla`). */
  problemas: Readonly<Record<string, string>>;
  /** Tras un corte de red las cifras quedan fijas hasta reenviar lo mismo; mientras guarda, también. */
  bloqueado: boolean;
  onTexto: (varianteId: string, texto: string) => void;
  /** Lo que va bajo una talla (la pregunta «¿es la que faltó en el conteo?»). */
  extra?: (varianteId: string) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-tinta/10 rounded-lg border border-tinta/10 px-3">
      {filas.map((f) => {
        const texto = textos[f.varianteId] ?? "";
        const menos = textoTrasPaso(texto, -1, modo, f.actual, f.minimo);
        const mas = textoTrasPaso(texto, 1, modo, f.actual, f.minimo);
        const problema = problemas[f.varianteId];
        return (
          <li key={f.varianteId} className="py-2.5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-hueso px-1.5 text-sm font-semibold text-tinta">{f.talla}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-tinta">{f.principal}</p>
                {f.detalle && <p className="text-xs text-taupe">{f.detalle}</p>}
              </div>
              <span className="inline-flex h-9 shrink-0 items-center rounded-lg border border-sand bg-papel">
                <button
                  type="button"
                  aria-label={`Una menos de la talla ${f.talla}`}
                  disabled={bloqueado || menos === null}
                  onClick={() => menos !== null && onTexto(f.varianteId, menos)}
                  className="grid h-9 w-9 place-items-center text-tinta/70 disabled:opacity-30"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden />
                </button>
                <input
                  // Al sumar o restar hace falta el «−»: un teclado solo numérico no lo trae.
                  inputMode={modo === "contado" ? "numeric" : "text"}
                  aria-label={`${etiquetaControl} · talla ${f.talla}`}
                  // Vacío no es lo mismo al contar («no la conté») que al sumar o restar (0): el marcador lo dice.
                  placeholder={modo === "contado" ? "—" : "0"}
                  value={texto}
                  disabled={bloqueado}
                  onChange={(e) => onTexto(f.varianteId, limpiarTextoAjuste(e.target.value, modo))}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-10 bg-transparent text-center text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/35"
                />
                <button
                  type="button"
                  aria-label={`Una más de la talla ${f.talla}`}
                  disabled={bloqueado || mas === null}
                  onClick={() => mas !== null && onTexto(f.varianteId, mas)}
                  className="grid h-9 w-9 place-items-center text-tinta/70 disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            </div>
            {problema && (
              <Aviso tono="error" chico className="ml-12 mt-1.5">
                {problema}
              </Aviso>
            )}
            {extra?.(f.varianteId)}
          </li>
        );
      })}
    </ul>
  );
}
