"use client";

import { useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import type { CandidataVendedora } from "@/lib/vender-reglas";

/**
 * «¿Quiénes atienden en caja?» — solo lo abre un líder (la RPC lo exige). Marca qué colaboradoras de la sede
 * aparecen como chips en el ticket del Punto de venta. No toca ventas ya hechas. Las filas llegan del
 * servidor (`getCandidatasVendedora`); cada casilla guarda sola y, al cerrar, si algo cambió se vuelve a
 * pedir la página para que la fila del ticket se actualice.
 */
export function ElegirVendedorasModal({
  candidatas,
  ubicacionEtiqueta,
  onClose,
  alCerrarEnfocar,
}: {
  candidatas: CandidataVendedora[];
  ubicacionEtiqueta: string;
  onClose: () => void;
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [filas, setFilas] = useState(candidatas);
  const [guardando, setGuardando] = useState(false);
  const [huboCambio, setHuboCambio] = useState(false);

  async function alternar(c: CandidataVendedora) {
    setGuardando(true);
    const { error } = await createClient().rpc("marcar_atiende_en_caja", { p_persona_id: c.personaId, p_atiende: !c.atiende });
    setGuardando(false);
    if (error) {
      avisar.error(traducirError(error, "guardar quién atiende en caja"));
      return;
    }
    setFilas((actual) => actual.map((x) => (x.personaId === c.personaId ? { ...x, atiende: !c.atiende } : x)));
    setHuboCambio(true);
  }

  function alCerrar() {
    if (huboCambio) router.refresh();
    onClose();
  }

  return (
    <Modal titulo="¿Quiénes atienden en caja?" subtitulo={ubicacionEtiqueta} onClose={alCerrar} alCerrarEnfocar={alCerrarEnfocar}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-sm text-tinta/70">
            Solo ellas aparecen en la fila «Atendió» del ticket. Puedes cambiarlo cuando quieras; no toca las ventas ya hechas.
          </p>
          {filas.length === 0 ? (
            <p className="card-cayla px-4 py-4 text-center text-sm text-tinta/60">
              No hay colaboradoras asignadas a esta sede, o no se pudieron leer.
            </p>
          ) : (
            <ul className="divide-y divide-sand rounded-xl border border-sand">
              {filas.map((c) => (
                <li key={c.personaId}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm text-tinta">
                    <span>{c.nombre}</span>
                    <input
                      type="checkbox"
                      checked={c.atiende}
                      disabled={guardando}
                      onChange={() => alternar(c)}
                      className="h-5 w-5 accent-[var(--color-rojo)]"
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={cerrar} className={`${botonPrimario} w-full`}>
            Listo
          </button>
        </div>
      )}
    </Modal>
  );
}
