"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { CampanasArchivadasModal } from "@/components/plan-compra/CampanasArchivadasModal";
import { MarcoMinimo } from "@/components/plan-compra/MarcoMinimo";
import { NuevaCampanaModal } from "@/components/plan-compra/NuevaCampanaModal";
import type { PestanaDelPlan } from "@/components/plan-compra/PestanasPlan";
import { hoyLima } from "@/lib/fechas-lima";
import { campanasArchivadas, claveDeRanura, ranurasSinPlan, type CampanasLeidas, type RanuraCalendario } from "@/lib/plan-compra-reglas";

// Lo que se ve cuando no hay ninguna campaña que mostrar (o la lectura falló): el mismo vacío en todas las pestañas del Plan, con el camino para armar la próxima. Antes vivía
// dentro de `PlanCampana`; sale de ahí para que Presupuesto y Calendario no lo copien (Kent Beck: primero se vuelve fácil el cambio). Si la lectura falló, lo dice (principio 9):
// nunca una hoja vacía que parezca «sin plan». Desde ADR-0525 las campañas se eligen en el Calendario: lo primero que ofrece es armar la próxima que ya está en tu plan; si ninguna
// lo está, llevarte al Calendario a elegir.

export function SinCampana({ activa, campanas, falla }: { activa: PestanaDelPlan; campanas: CampanasLeidas | null; falla: string | null }) {
  // La hoja de una campaña del calendario para armar su plan (`ranura`).
  const [armando, setArmando] = useState<RanuraCalendario | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const hayArchivadas = !!campanas && campanasArchivadas(campanas).length > 0;
  const proxima = campanas ? (ranurasSinPlan(campanas, hoyLima()).at(0) ?? null) : null;
  return (
    <MarcoMinimo activa={activa} subtitulo="Cuánto comprar de cada categoría para una campaña.">
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
                  {/* Lo primero que ofrece es la próxima campaña de tu calendario, ya con sus fechas (quien tiene el módulo, ADR-0387); si no hay ninguna en tu plan,
                      el camino es elegirlas en el Calendario. */}
                  {proxima ? (
                    <Boton peso="primario" onClick={() => setArmando(proxima)}>
                      Armar el plan de {proxima.nombre}
                    </Boton>
                  ) : (
                    <BotonEnlace peso="primario" href="/compras/plan/calendario">
                      Elegir mis campañas
                    </BotonEnlace>
                  )}
                  {proxima && <BotonEnlace href="/compras/plan/calendario">Ver mi calendario</BotonEnlace>}
                  {hayArchivadas && <Boton onClick={() => setVerArchivadas(true)}>Ver campañas archivadas</Boton>}
                </>
              ) : undefined
            }
          >
            {hayArchivadas
              ? "Las que quitaste siguen en «Campañas archivadas»: restaura una o elige otra en tu calendario."
              : "Elige en el Calendario con cuáles campañas te quedas el año, y aquí armas cuánto comprar de cada categoría."}
          </Vacio>
        </div>
      )}
      {armando && campanas && (
        <NuevaCampanaModal
          key={claveDeRanura(armando)}
          etiquetas={campanas.etiquetas}
          nombresEnUso={campanas.planes.map((c) => c.nombre)}
          propias={campanas.calendario?.decisiones ?? []}
          ranura={armando}
          onClose={() => setArmando(null)}
        />
      )}
      {verArchivadas && campanas && <CampanasArchivadasModal archivadas={campanasArchivadas(campanas)} onClose={() => setVerArchivadas(false)} />}
    </MarcoMinimo>
  );
}
