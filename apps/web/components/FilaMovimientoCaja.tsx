"use client";

import { CircleMinus, CirclePlus, Receipt, ShoppingBag } from "lucide-react";
import type { MetodoRitmo } from "@/lib/caja-panel-reglas";

export type EventoCaja = {
  id: string;
  minutos: number;
  horaTexto: string;
  icono: "venta" | "ingreso" | "egreso";
  titulo: string;
  meta: string;
  monto: number;
  color: string;
  /** Con qué medios se pagó la venta (vacío o ausente en un ingreso/egreso manual): lo que usa el filtro por medio de pago. */
  metodos?: readonly MetodoRitmo[];
  /** La salida es un gasto registrado (`lib/caja-movimiento-reglas.ts`): lleva la boleta como ícono, no el «−» de un retiro. */
  esGasto?: boolean;
};

const money = (n: number) => "S/" + n.toFixed(2);

/** Una fila de «Movimientos recientes» y de «Ver todo». TODA fila abre su detalle (Felipe, 2026-10-12: un gasto que al
 *  tocarlo no abría nada se lee como una pantalla rota, no como «no hay más que ver»): la venta abre el suyo, la entrada
 *  o la salida del cajón, el suyo. */
export function FilaMovimientoCaja({ e, nuevo, onAbrir }: { e: EventoCaja; nuevo: boolean; onAbrir: (e: EventoCaja) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(e)}
      aria-label={`Ver el detalle de ${e.titulo}, ${money(Math.abs(e.monto))}, ${e.horaTexto}`}
      className="anim-revelar relative isolate flex w-full cursor-pointer items-center gap-3 py-2.5 text-left transition-colors hover:bg-sand/30 focus-visible:bg-sand/30 focus-visible:outline-none @[640px]:break-inside-avoid"
    >
      {/* `isolate` + el velo en `-z-10`: el resaltado de una fila nueva queda DETRÁS de su texto. */}
      {nuevo && <span aria-hidden className="anim-vivo-fila pointer-events-none absolute -inset-x-2 inset-y-0.5 -z-10 rounded-lg bg-verde/15" />}
      <div
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${e.color} 14%, transparent)`, color: e.color }}
      >
        {e.icono === "venta" ? (
          <ShoppingBag size={16} />
        ) : e.esGasto ? (
          <Receipt size={16} />
        ) : e.icono === "ingreso" ? (
          <CirclePlus size={16} />
        ) : (
          <CircleMinus size={16} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {/* Ronda 19: la fila se lee a 15 px y su detalle a 14 (antes 13,5 y 11,5, gris tenue). */}
        <p className="truncate text-[15px] font-semibold text-tinta">{e.titulo}</p>
        <p className="texto-detalle truncate">
          {e.horaTexto} · {e.meta}
        </p>
      </div>
      <p key={e.monto} className={`anim-asentar shrink-0 text-base font-bold tabular-nums ${e.monto < 0 ? "text-rojo" : "text-verde-profundo"}`}>
        {e.monto < 0 ? "−" : "+"}
        {money(Math.abs(e.monto))}
      </p>
    </button>
  );
}
