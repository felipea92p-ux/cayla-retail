"use client";

import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { motivoLegible } from "@/lib/cola-arranque-reglas";
import { textoDeDiferencia } from "@/lib/por-regularizar-mesa";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { MosaicoDeVenta, IconoVisto } from "./piezas";
import { LineaCorregida } from "./LineaCorregida";

/** Lo que se dice de una venta que ya no está pendiente (regularizada, cerrada sin prenda, anulada): sin prendas que elegir. Un líder
 *  puede reabrir una cerrada (la base lo exige, `reabrir_prenda_cerrada`). */
export function ResumenResuelta({
  fila,
  esLider,
  onReabrir,
  onCorregir,
}: {
  fila: FilaPorRegularizar;
  esLider: boolean;
  onReabrir: (f: FilaPorRegularizar) => void;
  /** Una cerrada sin prenda sigue contando en la demanda con lo anotado: también se corrige (ADR-0369). */
  onCorregir: (f: FilaPorRegularizar) => void;
}) {
  const titulo = fila.estado === "regularizada" ? "Se identificó como" : fila.estado === "cerrada_sin_prenda" ? "Cerrada sin identificar" : "La venta se anuló";
  return (
    <div className="vsr-resumen">
      <p className="label-cayla text-[11px] text-tinta/65">{titulo}</p>
      <div className="vsr-resumen-foto">
        <MosaicoDeVenta venta={fila} />
      </div>
      <div>
        <p className="text-base font-semibold text-tinta">{fila.estado === "regularizada" ? fila.prendaReal : fila.descripcion}</p>
        {fila.estado === "regularizada" && fila.diferencia !== null && (
          <p className="mt-0.5 text-[13px] text-taupe-profundo">
            {textoDeDiferencia(fila.diferencia)}
            {fila.forma === "llego_nueva" ? " · llegó nueva" : " · perdió la etiqueta"}
          </p>
        )}
        {fila.estado === "cerrada_sin_prenda" && fila.cierre && (
          <p className="mt-0.5 text-[13px] text-taupe-profundo">
            {motivoLegible(fila.cierre.motivo)}. Cerrada el {diaYHoraLima(fila.cierre.cerradoEn).dia}: el stock no cambió.
          </p>
        )}
        {fila.estado === "cerrada_sin_prenda" && (
          <p className="mt-0.5 text-[13px] text-taupe-profundo">
            <LineaCorregida fila={fila} />
          </p>
        )}
      </div>
      {fila.estado === "cerrada_sin_prenda" && (
        <div className="flex flex-wrap gap-2 self-start">
          <button type="button" onClick={() => onCorregir(fila)} className="btn-cayla btn-secundario">
            Corregir lo anotado
          </button>
          {esLider && (
            <button type="button" onClick={() => onReabrir(fila)} className="btn-cayla btn-secundario">
              Reabrir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** No queda nada por identificar: el visto se dibuja una vez. */
export function TodoCuadrado({ sede }: { sede: string }) {
  return (
    <div className="vsr-celebra">
      <div className="vsr-celebra-ic">
        <IconoVisto className="h-9 w-9" />
      </div>
      <p className="font-display text-3xl text-tinta">Todo cuadrado</p>
      <p className="text-sm">El stock de {sede} ya coincide con lo que caja vendió.</p>
    </div>
  );
}
