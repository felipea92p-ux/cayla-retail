"use client";

import { useState } from "react";
import { CirclePause, Play } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { NOMBRE_ESPERA_MAX, nombreDeEspera } from "@/lib/vender-hoy-reglas";

type Espera = { id: string; nombre?: string; creadoEn: string; carrito: { cantidad: number; precioUnitario: number; descuentoUnitario: number }[] };

const totalDe = (t: Espera) => t.carrito.reduce((acc, it) => acc + it.cantidad * (it.precioUnitario - it.descuentoUnitario), 0);
const minutosDesde = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

/**
 * La tira de tickets en espera arriba del ticket (spike 2026-09-26, hallazgo 6; referentes: los «tickets abiertos» de
 * Square y los carritos guardados de Shopify POS llevan nombre). Con dos clientas en probador, «En espera · 2» no
 * decía cuál era cuál; aquí cada una tiene nombre, monto y hace cuánto, y se retoma de un toque.
 */
export function TiraDeEsperas({ enEspera, onRetomar, bloqueado }: { enEspera: readonly Espera[]; onRetomar: (id: string) => void; bloqueado: boolean }) {
  if (enEspera.length === 0) return null;
  return (
    <div className="scroll-cayla flex gap-1.5 overflow-x-auto border-b border-sand bg-crema px-5 py-2" role="group" aria-label="Tickets en espera">
      {enEspera.map((t, i) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onRetomar(t.id)}
          disabled={bloqueado}
          title={`Retomar ${nombreDeEspera(t.nombre, i)}`}
          className="anim-revelar inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-tinta/25 bg-papel px-3 text-xs text-tinta transition-colors hover:border-taupe"
        >
          <CirclePause className="h-3.5 w-3.5 text-tinta/60" aria-hidden />
          <b className="font-semibold">{nombreDeEspera(t.nombre, i)}</b>
          <span className="text-tinta/60 tabular-nums">
            S/{totalDe(t).toFixed(2)} · {minutosDesde(t.creadoEn)} min
          </span>
          <span className="flex items-center gap-0.5 font-semibold underline underline-offset-2">
            <Play className="h-3 w-3" aria-hidden />
            Retomar
          </span>
        </button>
      ))}
    </div>
  );
}

const SUGERENCIAS = ["Probador 1", "Probador 2", "Probador 3"];

/** Antes de dejar un ticket en espera, un nombre corto para reconocerlo al volver. Opcional: Enter sin escribir lo
 *  deja como «Ticket N». Las sugerencias son de un toque porque la clienta está esperando. */
export function DejarEnEsperaModal({ onDejar, onClose, ocupados }: { onDejar: (nombre: string) => void; onClose: () => void; ocupados: readonly string[] }) {
  const [nombre, setNombre] = useState("");
  const libres = SUGERENCIAS.filter((s) => !ocupados.includes(s));
  return (
    <Modal titulo="Dejar en espera" subtitulo="Un nombre corto para reconocerlo al volver. Opcional." variante="hoja" ancho="max-w-sm" onClose={onClose}>
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onDejar(nombre.trim());
            cerrar();
          }}
        >
          <input
            autoFocus
            value={nombre}
            maxLength={NOMBRE_ESPERA_MAX}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Probador 2, señora del abrigo…"
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-sand bg-crema px-3 text-sm text-tinta outline-none placeholder:text-tinta/40 focus:border-rojo focus:ring-2 focus:ring-rojo/20"
          />
          {libres.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {libres.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    onDejar(s);
                    cerrar();
                  }}
                  className="label-cayla h-8 rounded-md border border-sand bg-crema px-2.5 text-[10.5px] text-tinta/75 transition-colors hover:border-taupe hover:text-tinta"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <button type="submit" className="label-cayla mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-tinta text-[11px] text-crema transition-colors hover:bg-rojo">
            <CirclePause className="h-4 w-4" aria-hidden />
            Dejar en espera
          </button>
        </form>
      )}
    </Modal>
  );
}
