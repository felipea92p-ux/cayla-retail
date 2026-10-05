"use client";

import { useState, type ReactNode } from "react";
import { TabsSubrayado, type ItemTab } from "@/components/ui/TabsSubrayado";

// Las dos mitades del Plan del piso en una sola pantalla (estado, no ruta): «Propuesta» —cuánto lugar le toca a cada grupo— y «Grupos» —
// a cuál pertenece cada categoría—. Las dos las arma el servidor y llegan ya dibujadas; aquí solo se elige cuál se ve. La propuesta va
// primero porque es lo que se viene a mirar; los grupos son la base que el líder revisa (y su pestaña lleva cuántas faltan por revisar).
export type VistaPlanDelPiso = "propuesta" | "grupos";

export function PlanDelPisoPestanas({ propuesta, grupos, porRevisar, inicial = "propuesta" }: { propuesta: ReactNode; grupos: ReactNode; porRevisar: number; inicial?: VistaPlanDelPiso }) {
  const [vista, setVista] = useState<VistaPlanDelPiso>(inicial);
  const items: ItemTab[] = [
    { clave: "propuesta", etiqueta: "Propuesta" },
    { clave: "grupos", etiqueta: "Grupos", conteo: porRevisar > 0 ? porRevisar : undefined, tono: porRevisar > 0 ? "ambar" : undefined },
  ];
  return (
    <div className="space-y-6">
      <TabsSubrayado items={items} valor={vista} onCambio={(c) => setVista(c as VistaPlanDelPiso)} etiqueta="Vistas del plan del piso" />
      {/* Las dos quedan montadas y solo se oculta la que no se mira: lo que el líder dejó preparado en «Grupos» no se pierde al mirar la
          propuesta (un panel desmontado olvida su estado), y al volver está donde lo dejó. */}
      <div role="tabpanel" aria-label="Propuesta" hidden={vista !== "propuesta"}>
        {propuesta}
      </div>
      <div role="tabpanel" aria-label="Grupos" hidden={vista !== "grupos"}>
        {grupos}
      </div>
    </div>
  );
}
