"use client";

import { Modal } from "@/components/ui/Modal";
import { FilaMovimientoCaja, type EventoCaja } from "@/components/FilaMovimientoCaja";

/** «Ver todo»: todos los movimientos de la caja en una lista con scroll propio, para que la
 *  tarjeta del tablero no se alargue cuando hay muchos. Al abrir una fila, su detalle se
 *  apila encima y al cerrarlo se vuelve a esta lista. */
export function MovimientosCajaModal({
  eventos,
  idsNuevos,
  ubicacionNombre,
  onAbrir,
  onClose,
}: {
  eventos: EventoCaja[];
  idsNuevos: ReadonlySet<string>;
  ubicacionNombre: string;
  onAbrir: (e: EventoCaja) => void;
  onClose: () => void;
}) {
  return (
    <Modal conCerrar titulo="Movimientos de la caja" subtitulo={`${ubicacionNombre} · ${eventos.length} en total`} onClose={onClose} tamano="ancha">
      {/* El scroll es de la lista, no del modal: el título se queda a la vista. */}
      <div className="scroll-cayla mt-3 max-h-[62vh] divide-y divide-sand overflow-y-auto pr-1">
        {eventos.map((e) => (
          <FilaMovimientoCaja key={e.id} e={e} nuevo={idsNuevos.has(e.id)} onAbrir={onAbrir} />
        ))}
      </div>
    </Modal>
  );
}
