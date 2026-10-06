"use client";

import { ArrowLeftRight } from "lucide-react";

/* ====================================================================
   «Casi no hay aquí» (2026-10-06, tarde): las tallas del modelo con 1 o ninguna en esta sede que otra sede sí tiene (`casiNoHay`).
   Una lista con una fila por talla —el color y la talla arriba, qué pasa y quién la tiene debajo, y «Pedir» a la derecha— en vez de
   una franja de color por talla: tres franjas seguidas hacían ver el panel amontonado, y el botón saltaba de línea según el largo del
   texto. La columna del botón es fija, así que nunca baja.

   La misma pieza va en «Esta talla» (con «Pedir») y en «Colgar varias» (sin él: pedir desde ahí cambiaría de paso y se perderían las
   cantidades ya puestas; la nota lo dice).
   ==================================================================== */

export type FilaCasiNoHay = {
  clave: string;
  color: string | null;
  colorHex: string | null;
  talla: string;
  agotada: boolean;
  /** «AQP 2 · LIM 1». */
  sedes: string;
  /** Sin él, la fila solo informa (no hay tienda a la que pedirle, o se está en medio de otro paso). */
  onPedir?: () => void;
};

export function CasiNoHayLista({ filas, nota }: { filas: readonly FilaCasiNoHay[]; /** Una aclaración junto al título. */ nota?: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-[13px] font-medium text-taupe">
        Casi no hay aquí
        {nota && <span className="font-normal"> · {nota}</span>}
      </p>
      <ul className="grid divide-y divide-sand/70">
        {filas.map((f) => (
          <li key={f.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 last:pb-0.5">
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-tinta">
                <i aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: f.colorHex ?? "var(--color-hueso)" }} />
                <span className="truncate">{f.color ? `${f.color} · ${f.talla}` : f.talla}</span>
              </p>
              <p className="text-[12.5px] text-pizarra">
                {f.agotada ? "Agotada aquí" : "Queda 1 aquí"} · <span className="tabular-nums">{f.sedes}</span>
              </p>
            </div>
            {f.onPedir && (
              <button type="button" onClick={f.onPedir} className="btn-cayla btn-secundario btn-chico gap-1.5 border-pizarra/40 text-pizarra">
                <ArrowLeftRight aria-hidden className="h-4 w-4" />
                Pedir
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
