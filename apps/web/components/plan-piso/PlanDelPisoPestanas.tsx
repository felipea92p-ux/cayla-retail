"use client";

import { useState, type ReactNode } from "react";
import { Pestanas, type Pestana } from "@/components/ui/Pestanas";

// Las tres vistas del Plan del piso en una sola pantalla (estado, no ruta): «Propuesta» —cuánto lugar le toca a cada grupo—, «Grupos» —
// a cuál pertenece cada categoría— e «Historia» —las fotos semanales del espacio—. Las tres las arma el servidor y llegan ya dibujadas; aquí solo se elige cuál se ve. La propuesta va
// primero porque es lo que se viene a mirar; los grupos son la base que el líder revisa (y su pestaña lleva cuántas faltan por revisar).
// Desde ADR-0358 («Una función, una pieza») las pestañas son `<Pestanas>`, la única del ERP: la vista es estado de la pantalla (`onCambio`).
export type VistaPlanDelPiso = "propuesta" | "grupos" | "historia";

export function PlanDelPisoPestanas({ propuesta, grupos, historia, porRevisar, inicial = "propuesta" }: { propuesta: ReactNode; grupos: ReactNode; historia: ReactNode; porRevisar: number; inicial?: VistaPlanDelPiso }) {
  const [vista, setVista] = useState<VistaPlanDelPiso>(inicial);
  const items: Pestana[] = [
    { clave: "propuesta", etiqueta: "Propuesta" },
    // El conteo de «por revisar» pide algo (ámbar) y su texto es lo que oye quien usa lector de pantalla tras el número.
    { clave: "grupos", etiqueta: "Grupos", conteo: porRevisar > 0 ? porRevisar : undefined, pide: porRevisar > 0 ? "por revisar" : undefined },
    { clave: "historia", etiqueta: "Historia" },
  ];
  return (
    <div className="space-y-6">
      <Pestanas items={items} activa={vista} onCambio={(c) => setVista(c as VistaPlanDelPiso)} etiquetaAccesible="Vistas del plan del piso" idIndicador="plan-piso" />
      {/* Las tres quedan montadas y solo se oculta la que no se mira: lo que el líder dejó preparado en «Grupos» no se pierde al mirar la
          propuesta (un panel desmontado olvida su estado), y al volver está donde lo dejó. */}
      <div role="tabpanel" aria-label="Propuesta" hidden={vista !== "propuesta"}>
        {propuesta}
      </div>
      <div role="tabpanel" aria-label="Grupos" hidden={vista !== "grupos"}>
        {grupos}
      </div>
      <div role="tabpanel" aria-label="Historia" hidden={vista !== "historia"}>
        {historia}
      </div>
    </div>
  );
}
