"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Vacio } from "@/components/ui/Vacio";
import { CampanasArchivadasModal } from "@/components/plan-compra/CampanasArchivadasModal";
import { NuevaCampanaModal } from "@/components/plan-compra/NuevaCampanaModal";
import { PestanasPlan, type PestanaDelPlan } from "@/components/plan-compra/PestanasPlan";
import { hoyLima } from "@/lib/fechas-lima";
import { campanasArchivadas, ranurasSinPlan, type CampanasLeidas, type RanuraCalendario } from "@/lib/plan-compra-reglas";

// Lo que se ve cuando no hay ninguna campaña que mostrar (o la lectura falló): el mismo vacío en todas las pestañas del Plan, con el camino para armar
// la próxima. Antes vivía dentro de `PlanCampana`; sale de ahí para que Presupuesto y Calendario no lo copien (Kent Beck: primero se vuelve fácil el
// cambio). Si la lectura falló, lo dice (principio 9): nunca una hoja vacía que parezca «sin plan».

export function SinCampana({ activa, campanas, falla, esLider }: { activa: PestanaDelPlan; campanas: CampanasLeidas | null; falla: string | null; esLider: boolean }) {
  // La hoja de una campaña: una del calendario para armar su plan (`ranura`) o una nueva (`ranura: null`). Act. 2026-10-12 f.
  const [hojaCampana, setHojaCampana] = useState<{ ranura: RanuraCalendario | null } | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const hayArchivadas = !!campanas && campanasArchivadas(campanas).length > 0;
  const proxima = campanas ? (ranurasSinPlan(campanas, hoyLima()).at(0) ?? null) : null;
  return (
    <div className="space-y-6">
      <EncabezadoPagina sede="Todas las tiendas" titulo="Plan de campaña" subtitulo="Cuánto comprar de cada categoría para una campaña." />
      <PestanasPlan activa={activa} />
      {falla ? (
        <Aviso tono="error">{falla}.</Aviso>
      ) : (
        <div className="card-cayla">
          <Vacio
            icono={<CalendarDays />}
            titulo={hayArchivadas ? "No hay campañas activas" : "Todavía no hay ninguna campaña para planificar"}
            acciones={
              campanas ? (
                <>
                  {/* Lo primero que ofrece es la próxima campaña del calendario, ya con sus fechas (quien tiene el módulo, ADR-0387);
                      «Campaña nueva», para lo que no está, sigue siendo de un líder: escribe en Etiquetas. */}
                  {proxima ? (
                    <>
                      <Boton peso="primario" onClick={() => setHojaCampana({ ranura: proxima })}>
                        Armar el plan de {proxima.nombre}
                      </Boton>
                      {esLider && <Boton onClick={() => setHojaCampana({ ranura: null })}>Campaña nueva</Boton>}
                    </>
                  ) : (
                    esLider && (
                      <Boton peso="primario" onClick={() => setHojaCampana({ ranura: null })}>
                        Campaña nueva
                      </Boton>
                    )
                  )}
                  {hayArchivadas && <Boton onClick={() => setVerArchivadas(true)}>Ver campañas archivadas</Boton>}
                </>
              ) : undefined
            }
          >
            {hayArchivadas
              ? "Las que quitaste siguen en «Campañas archivadas»: restaura una o crea otra a partir de Catálogo ▸ Insignias."
              : "Crea una a partir de una campaña de Catálogo ▸ Insignias y aquí armas cuánto comprar de cada categoría."}
          </Vacio>
        </div>
      )}
      {hojaCampana && campanas && (
        <NuevaCampanaModal
          key={hojaCampana.ranura ? `${hojaCampana.ranura.etiquetaId}|${hojaCampana.ranura.anio}` : "nueva"}
          etiquetas={campanas.etiquetas}
          nombresEnUso={campanas.planes.map((c) => c.nombre)}
          ranura={hojaCampana.ranura}
          onClose={() => setHojaCampana(null)}
        />
      )}
      {verArchivadas && campanas && <CampanasArchivadasModal archivadas={campanasArchivadas(campanas)} onClose={() => setVerArchivadas(false)} />}
    </div>
  );
}
