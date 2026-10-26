"use client";

import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { Boton } from "@/components/ui/campos";
import type { PestanaDeTicket } from "@/lib/tickets-abiertos-reglas";

/**
 * Antes de cerrar la caja con tickets que tienen prendas (Felipe, 2026-10-25, pregunta 19): al cerrar la caja la espera se vacía
 * (decisión de siempre: un ticket de ayer no sobrevive a la caja de hoy), y hasta hoy pasaba en silencio. Aquí se dice cuáles y
 * cuánto, y se decide a propósito. «Seguir con el cierre» solo abre el cierre de siempre: nada se descarta hasta que la caja se
 * cierra de verdad, y si ahí se cancela, los tickets siguen donde estaban.
 */
export function TicketsSinCobrarModal({ tickets, onSeguir, onClose }: { tickets: readonly PestanaDeTicket[]; onSeguir: () => void; onClose: () => void }) {
  const total = tickets.reduce((acc, t) => acc + t.total, 0);
  return (
    <Modal
      titulo="Hay tickets sin cobrar"
      subtitulo={`${tickets.length} ${tickets.length === 1 ? "cliente" : "clientes"} · S/${total.toFixed(2)}`}
      variante="hoja"
      onClose={onClose}
    >
      {(cerrar) => (
        <>
          <ul className="divide-y divide-sand rounded-xl border border-sand bg-papel" data-tickets-sin-cobrar>
            {tickets.map((t) => (
              <li key={t.id ?? "caja"} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <b className="min-w-0 flex-1 truncate font-semibold">{t.nombre}</b>
                <span className="shrink-0 text-xs text-tinta/60">
                  {t.prendas} {t.prendas === 1 ? "prenda" : "prendas"}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">S/{t.total.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-tinta/70">Si cierras la caja, estos tickets se descartan y no se pueden recuperar. Cancela para cobrarlos antes, o sigue con el cierre.</p>
          <PieAcciones className="mt-5">
            <Boton type="button" peso="fantasma" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="peligro"
              onClick={() => {
                onSeguir();
                cerrar();
              }}
            >
              Seguir con el cierre
            </Boton>
          </PieAcciones>
        </>
      )}
    </Modal>
  );
}
