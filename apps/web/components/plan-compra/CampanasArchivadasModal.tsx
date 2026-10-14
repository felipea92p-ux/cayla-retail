"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { RPC_RESTAURAR_CAMPANA, rotuloDeCampana, type CampanaPlan } from "@/lib/plan-compra-reglas";

// «Campañas archivadas» del plan (ADR-0372, B5): las que se quitaron teniendo algo (categorías armadas o un tope) no se borran; viven aquí, se
// pueden mirar tal como quedaron y volver al selector con «Restaurar». La abre quien tiene el módulo Plan de campaña (la base lo exige también; ADR-0387: ya no solo un líder). Restaurar firma con el
// responsable del combo.

export function CampanasArchivadasModal({ archivadas, onClose }: { archivadas: readonly CampanaPlan[]; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const enviando = useRef(false);

  async function restaurar(c: CampanaPlan, cerrar: () => void) {
    if (enviando.current) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviando.current = true;
    setRestaurando(c.id);
    const { error } = await firmar(createClient().rpc(RPC_RESTAURAR_CAMPANA as never, { p_plan_id: c.id } as never), responsable.firma());
    responsable.despues(error);
    setRestaurando(null);
    enviando.current = false;
    if (error) return void avisar.error(traducirError(error, "restaurar la campaña"));
    avisar.exito("Campaña restaurada", { detalle: `${c.nombre} vuelve a salir en el selector.` });
    cerrar();
    router.push(`/compras/plan?plan=${c.id}`);
  }

  return (
    <Modal conCerrar titulo="Campañas archivadas" subtitulo="Las que se quitaron teniendo categorías armadas o un tope: no se borran. Restaurar las devuelve al selector." onClose={onClose} variante="hoja" tamano="mediana">
      {(cerrar) =>
        archivadas.length === 0 ? (
          <Vacio tamano="chico" icono={<Archive />}>
            No hay campañas archivadas.
          </Vacio>
        ) : (
          <div className="space-y-4">
            <ul className="divide-y divide-sand rounded-xl border border-sand">
              {archivadas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-tinta">{rotuloDeCampana(c)}</span>
                    <span className="block text-[12.5px] text-tinta/70">
                      {[c.conPlan > 0 ? `${c.conPlan} ${c.conPlan === 1 ? "categoría armada" : "categorías armadas"}` : null, c.conTope ? "con tope" : null].filter(Boolean).join(" · ") || "Sin categorías armadas"}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <BotonEnlace href={`/compras/plan?plan=${c.id}`}>Ver</BotonEnlace>
                    <Boton type="button" peso="primario" cargando={restaurando === c.id} disabled={restaurando !== null || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => void restaurar(c, cerrar)}>
                      Restaurar
                    </Boton>
                  </span>
                </li>
              ))}
            </ul>
            <ComboResponsable control={responsable} deshabilitado={restaurando !== null} />
          </div>
        )
      }
    </Modal>
  );
}
