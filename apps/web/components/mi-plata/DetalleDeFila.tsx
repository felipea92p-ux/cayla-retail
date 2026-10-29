"use client";

import type { RefObject } from "react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { horaDeMovimiento, queHaraCompras, type MovimientoCompradora } from "@/lib/mi-plata-reglas";

/** La hoja de una fila: la cuenta como en un cuaderno (hora, detalle, monto), su estado y qué hará Compras. Solo se lee: se cierra con la ×. */
export function DetalleDeFila({ m, onClose, volverA }: { m: MovimientoCompradora; onClose: () => void; volverA: RefObject<HTMLButtonElement | null> }) {
  const hora = horaDeMovimiento(m);
  const filas: [string, string][] = [...(hora ? ([["Hora", hora]] as [string, string][]) : []), ["Detalle", m.detalle]];
  return (
    <Modal titulo={m.titulo} onClose={onClose} variante="hoja" conCerrar alCerrarEnfocar={volverA}>
      <div className="space-y-3.5">
        <dl className="rounded-[14px] bg-hueso px-3.5 py-1.5 text-sm tabular-nums">
          {filas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-t border-sand py-2 first:border-t-0">
              <dt className="text-taupe">{k}</dt>
              <dd className="text-right text-tinta">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t-2 border-tinta py-2 font-semibold">
            <dt>{m.entra ? "Te dieron" : m.tipo === "compra" ? "Pagaste" : "Gastaste"}</dt>
            <dd>{m.monto}</dd>
          </div>
        </dl>
        <Chip tono={m.estado.pendiente ? "pizarra" : "verde"} title={m.estado.detalle}>
          {m.estado.texto}
        </Chip>
        <p className="text-sm text-taupe">{queHaraCompras(m)}</p>
      </div>
    </Modal>
  );
}
