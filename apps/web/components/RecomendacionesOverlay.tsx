"use client";

import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { Recomendacion } from "@/lib/existencias-recomendaciones";

/* ====================================================================
   RecomendacionesOverlay · «Ver recomendaciones» (2026-09-22)

   `recomendaciones` ya viene ordenada por urgencia (`recomendacionesDeSede`): acá solo
   se dibuja. El texto y el motivo de cada paso son los que YA escribe `planDeReposicion`
   —nunca se inventa una frase nueva—, así que lo que dice acá es palabra por palabra lo
   que el motor de reposición del resto del sistema ya sabía decir. */

const TONO_URGENCIA: Record<Recomendacion["plan"]["urgencia"], string> = {
  alta: "border-l-rojo",
  media: "border-l-ambar",
  baja: "border-l-tinta/20",
  ninguna: "border-l-tinta/10",
};

export function RecomendacionesOverlay({ recomendaciones, onClose }: { recomendaciones: Recomendacion[]; onClose: () => void }) {
  return (
    <Modal
      titulo="Recomendaciones de hoy"
      subtitulo="Lo que el motor de reposición sugiere para cada prenda, de más a menos urgente."
      onClose={onClose}
      ancho="max-w-xl"
      variante="papel"
    >
      {recomendaciones.length === 0 ? (
        <p className="py-6 text-sm text-tinta/55">Nada pide acción hoy: todo lo que se vende tiene stock a mano o ya viene en camino.</p>
      ) : (
        <div className="-mx-2 max-h-[26rem] space-y-2 overflow-y-auto">
          {recomendaciones.map(({ fila: f, plan }) => (
            <div key={f.varianteId} className={`flex items-start gap-3 rounded-md border-l-2 bg-sand/20 px-3 py-2.5 ${TONO_URGENCIA[plan.urgencia]}`}>
              <MiniaturaPrenda fotoUrl={f.fotoUrl} colorHex={f.colorHex} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-tinta">{f.referencia}</p>
                <p className="truncate text-xs text-tinta/55">
                  <span className="font-mono">{f.sku}</span>
                  {f.talla && ` · ${f.talla}`}
                </p>
                <p className="mt-1 text-sm font-medium text-tinta">{plan.principal?.texto}</p>
                <p className="text-xs text-tinta/60">{plan.principal?.motivo}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
