"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { textoObligatorioValido, type ConsecuenciaCierre } from "@/lib/traslados-recepcion-reglas";

// «Cerrar con esta diferencia» (solo líder). Es lo único irreversible del traslado —da prendas por perdidas— y
// antes se ejecutaba al primer clic (docs/pantallas/traslados.md, hallazgo 14). Ahora pasa por el modal del sistema
// con la consecuencia escrita («Se da por perdida 1 prenda: Blusa Valentina S blanco») y una nota obligatoria.

export function TrasladoCerrarModal({
  numero,
  origenNombre,
  consecuencia,
  ocupado,
  motivoSinResponsable,
  onCerrarTraslado,
  onClose,
}: {
  numero: number;
  origenNombre: string;
  consecuencia: ConsecuenciaCierre;
  ocupado: boolean;
  motivoSinResponsable: string | null;
  onCerrarTraslado: (nota: string, cerrar: () => void) => void;
  onClose: () => void;
}) {
  const [nota, setNota] = useState("");
  const valida = textoObligatorioValido(nota);

  return (
    <Modal titulo={`Cerrar el Traslado ${numero} con esta diferencia`} subtitulo="No se puede deshacer." ancho="max-w-md" bloqueado={ocupado} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <div className="space-y-1.5 rounded-xl bg-hueso px-4 py-3 text-sm text-tinta">
            {consecuencia.perdidas && <p className="font-medium">{consecuencia.perdidas}</p>}
            <p>{consecuencia.entran}</p>
            {consecuencia.deMas && <p>{consecuencia.deMas}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nota-cierre" className="text-xs text-taupe">
              Qué pasó con la diferencia (obligatorio)
            </label>
            <textarea
              id="nota-cierre"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={`Ej.: la blusa no venía en la caja; ${origenNombre} la buscó y no está.`}
              rows={3}
              disabled={ocupado}
              className="caja-cayla w-full px-3 py-2 text-sm text-tinta outline-none placeholder:text-taupe"
            />
          </div>
          {motivoSinResponsable && <p className="text-sm text-rojo-profundo">{motivoSinResponsable}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={cerrar} disabled={ocupado} className="btn-cayla btn-secundario">
              Volver
            </button>
            <button
              type="button"
              onClick={() => onCerrarTraslado(nota.trim(), cerrar)}
              disabled={ocupado || !valida || motivoSinResponsable !== null}
              title={!valida ? "Escribe qué pasó con la diferencia." : undefined}
              className="btn-cayla btn-primario"
            >
              {ocupado ? "Cerrando…" : "Cerrar con esta diferencia"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
