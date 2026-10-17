"use client";

import { useState } from "react";

// La casilla de Configuración ▸ Tiendas y caja (ADR-0195 F1), compartida por las metas de la semana tipo, las de cada mes y las de
// cada fecha (ADR-0435): un número que se guarda SOLO al salir de ella si su texto cambió.

/** Lo que cada casilla llama para guardar: firma con el responsable, avisa y refresca. `true` si la base lo aceptó. */
export type Guardar = (hacer: () => PromiseLike<{ error: unknown }>, que: string, listo: string) => Promise<boolean>;

/** Una casilla numérica que se guarda al salir (blur) si su texto cambió. Si el guardado falla, vuelve a lo de antes. */
export function Casilla({ valor, etiqueta, ancho, alGuardar, placeholder = "—" }: { valor: string; etiqueta: string; ancho: string; alGuardar: (nuevo: string) => Promise<boolean>; placeholder?: string }) {
  const [t, setT] = useState(valor);
  const [antes, setAntes] = useState(valor);
  // Si la base trae otro valor (otro guardado, un refresco), la casilla lo toma.
  if (valor !== antes) {
    setAntes(valor);
    setT(valor);
  }
  return (
    <input
      aria-label={etiqueta}
      inputMode="decimal"
      value={t}
      placeholder={placeholder}
      onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setT(valor);
      }}
      onBlur={async () => {
        if (t.trim() === valor.trim()) return;
        const ok = await alGuardar(t);
        if (!ok) setT(valor);
      }}
      className={`fin-control fin-num inline-block ${ancho}`}
    />
  );
}
