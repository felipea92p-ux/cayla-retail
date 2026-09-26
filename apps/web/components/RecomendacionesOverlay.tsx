"use client";

import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { Recomendacion, TipoAccionHoy } from "@/lib/existencias-recomendaciones";

/* ====================================================================
   RecomendacionesOverlay · «Ver recomendaciones» (2026-09-22, motor propio desde 2026-09-25)

   `recomendaciones` ya viene ordenada por urgencia (`recomendacionesDeSede`): acá solo se
   dibuja. El texto y el motivo de cada fila son los que YA escribe `calcularAccionHoy` — la
   MISMA fuente que la columna «Acción hoy» de la tabla y la tarjeta «Reponer a piso hoy», nunca
   una frase inventada acá aparte. */

// `recomendacionesDeSede` hoy solo produce «reponer_a_piso» — «sin_accion» queda acá solo para
// que el `Record` sea total y no necesite un cast en el render.
const TONO_ACCION: Record<TipoAccionHoy, string> = {
  reponer_a_piso: "border-l-ambar",
  sin_accion: "border-l-tinta/10",
};

export function RecomendacionesOverlay({ recomendaciones, onClose }: { recomendaciones: Recomendacion[]; onClose: () => void }) {
  return (
    <Modal
      titulo="Recomendaciones de hoy"
      subtitulo="Lo que Acción hoy sugiere para cada prenda, de más a menos urgente."
      onClose={onClose}
      ancho="max-w-xl"
      variante="papel"
    >
      {recomendaciones.length === 0 ? (
        <p className="py-6 text-sm text-tinta/55">Nada pide acción hoy: todo lo que se vende tiene stock a mano o ya viene en camino.</p>
      ) : (
        <div className="-mx-2 max-h-[26rem] space-y-2 overflow-y-auto">
          {recomendaciones.map(({ fila: f, accion }) => (
            <div key={f.varianteId} className={`flex items-start gap-3 rounded-md border-l-2 bg-sand/20 px-3 py-2.5 ${TONO_ACCION[accion.tipo]}`}>
              <MiniaturaPrenda fotoUrl={f.fotoUrl} colorHex={f.colorHex} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-tinta">{f.referencia}</p>
                <p className="truncate text-xs text-tinta/55">
                  <span className="font-mono">{f.sku}</span>
                  {f.talla && ` · ${f.talla}`}
                </p>
                <p className="mt-1 text-sm font-medium text-tinta">{accion.texto}</p>
                <p className="text-xs text-tinta/60">{accion.motivo}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
