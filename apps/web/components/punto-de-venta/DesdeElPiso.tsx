"use client";

import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { nombreDelTicketDelPiso, type TicketCompartido } from "@/lib/tickets-compartidos-reglas";
import { haceCuanto } from "@/lib/vender-hoy-reglas";

/**
 * Los tickets que el piso mandó a la caja (ADR-0701, las tres estaciones del cobro). Cada fila dice de quién es el cliente (la asesora
 * que lo mandó), cuánto lleva y hace cuánto espera; «Abrir» lo pasa a este equipo como un ticket más, con los precios del día.
 * La misma lista va dentro del ticket vacío (donde mira la caja entre un cliente y otro) y en una hoja, con el ticket ocupado.
 */
export function ListaDesdeElPiso({
  tickets,
  ahora,
  abriendo,
  onAbrir,
}: {
  tickets: readonly TicketCompartido[];
  ahora: number;
  /** El id que se está abriendo: su botón espera y los demás no se tocan hasta que termine. */
  abriendo: string | null;
  onAbrir: (t: TicketCompartido) => void;
}) {
  return (
    <ul className="divide-y divide-sand" data-guia="vender.desde-el-piso">
      {tickets.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-tinta">
              {nombreDelTicketDelPiso(t)}
            </p>
            <p className="text-sm text-tenue">
              {t.prendas} {t.prendas === 1 ? "prenda" : "prendas"} · {haceCuanto(t.enviadoEn, ahora)}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">S/{t.total.toFixed(2)}</span>
          <Boton
            type="button"
            peso="fantasma"
            className="shrink-0"
            disabled={abriendo !== null && abriendo !== t.id}
            cargando={abriendo === t.id}
            textoCargando="Abriendo…"
            onClick={() => onAbrir(t)}
          >
            Abrir
          </Boton>
        </li>
      ))}
    </ul>
  );
}

/** El bloque dentro del ticket vacío: lo primero que ve la caja cuando termina con un cliente. */
export function DesdeElPisoEnElTicket(props: Parameters<typeof ListaDesdeElPiso>[0]) {
  if (props.tickets.length === 0) return null;
  return (
    <section className="anim-sube border-b border-sand px-5 py-3" aria-label="Tickets que esperan en la caja">
      <TituloGrupo nivel={3} cuenta={props.tickets.length}>
        Del piso
      </TituloGrupo>
      <ListaDesdeElPiso {...props} />
    </section>
  );
}

/** La hoja «Del piso», con el ticket ocupado: se abre desde el chip de la cabecera. */
export function DesdeElPisoModal({ onClose, ...props }: Parameters<typeof ListaDesdeElPiso>[0] & { onClose: () => void }) {
  return (
    <Modal titulo="Del piso" subtitulo="Tickets que las asesoras mandaron a la caja" variante="hoja" onClose={onClose}>
      {() =>
        props.tickets.length === 0 ? (
          <p className="text-sm text-secundario">Ya no queda ninguno esperando.</p>
        ) : (
          <ListaDesdeElPiso {...props} />
        )
      }
    </Modal>
  );
}
