"use client";

import { CircleMinus, CirclePlus, ShoppingBag } from "lucide-react";

export type EventoCaja = {
  id: string;
  minutos: number;
  horaTexto: string;
  icono: "venta" | "ingreso" | "egreso";
  titulo: string;
  meta: string;
  monto: number;
  color: string;
};

const money = (n: number) => "S/" + n.toFixed(2);

/** Una fila de «Movimientos recientes» y de «Ver todo». Las ventas son un botón que abre su
 *  detalle; los ingresos y egresos no (no hay más que ver de ellos). */
export function FilaMovimientoCaja({ e, nuevo, onAbrirVenta }: { e: EventoCaja; nuevo: boolean; onAbrirVenta: (ventaId: string) => void }) {
  const esVenta = e.icono === "venta";
  const clases = `anim-revelar relative isolate flex w-full items-center gap-3 py-2.5 text-left @[640px]:break-inside-avoid ${
    esVenta ? "cursor-pointer transition-colors hover:bg-sand/30 focus-visible:bg-sand/30 focus-visible:outline-none" : ""
  }`;
  const contenido = (
    <>
      {/* `isolate` + el velo en `-z-10`: el resaltado de una fila nueva queda DETRÁS de su texto. */}
      {nuevo && <span aria-hidden className="anim-vivo-fila pointer-events-none absolute -inset-x-2 inset-y-0.5 -z-10 rounded-lg bg-verde/15" />}
      <div
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${e.color} 14%, transparent)`, color: e.color }}
      >
        {e.icono === "venta" ? <ShoppingBag size={14} /> : e.icono === "ingreso" ? <CirclePlus size={14} /> : <CircleMinus size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-tinta">{e.titulo}</p>
        <p className="text-[11.5px] text-tinta/50">
          {e.horaTexto} · {e.meta}
        </p>
      </div>
      <p key={e.monto} className={`anim-asentar shrink-0 text-sm font-bold tabular-nums ${e.monto < 0 ? "text-rojo" : "text-verde-profundo"}`}>
        {e.monto < 0 ? "−" : "+"}
        {money(Math.abs(e.monto))}
      </p>
    </>
  );
  // Dos ramas y no una etiqueta variable: `type`/`onClick` no existen en un `div` y TypeScript lo rechaza.
  return esVenta ? (
    <button type="button" onClick={() => onAbrirVenta(e.id)} aria-label={`Ver el detalle de la venta de ${money(e.monto)}, ${e.horaTexto}`} className={clases}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}
