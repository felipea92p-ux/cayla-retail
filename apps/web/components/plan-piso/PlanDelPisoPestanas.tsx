"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pestanas, type Pestana } from "@/components/ui/Pestanas";

// Las tres vistas del Plan del piso en una sola pantalla (estado, no ruta): «Propuesta» —cuánto lugar le toca a cada grupo—, «Grupos» —
// a cuál pertenece cada categoría— e «Historia» —las fotos semanales del espacio—. Las tres las arma el servidor y llegan ya dibujadas; aquí solo se elige cuál se ve. La propuesta va
// primero porque es lo que se viene a mirar; los grupos son la base que el líder revisa (y su pestaña lleva cuántas faltan por revisar).
// Desde ADR-0358 («Una función, una pieza») las pestañas son `<Pestanas>`, la única del ERP: la vista es estado de la pantalla (`onCambio`).
export type VistaPlanDelPiso = "propuesta" | "grupos" | "historia";

// Quien vive DENTRO de una vista (el aviso «45 categorías por revisar», de la Propuesta) puede llevar a otra: las vistas son estado de esta pantalla,
// no rutas, y lo que se dibuja adentro llega desde el servidor como `children`. El contexto cruza esa frontera; sin él (fuera de esta pantalla) no hay a
// dónde llevar y `useIrALaVista` devuelve `null`.
const IrALaVista = createContext<((vista: VistaPlanDelPiso) => void) | null>(null);
export const useIrALaVista = () => useContext(IrALaVista);

export function PlanDelPisoPestanas({ propuesta, grupos, historia, porRevisar, inicial = "propuesta" }: { propuesta: ReactNode; grupos: ReactNode; historia: ReactNode; porRevisar: number; inicial?: VistaPlanDelPiso }) {
  const [vista, setVista] = useState<VistaPlanDelPiso>(inicial);
  const caja = useRef<HTMLDivElement>(null);
  const enfocarAlCambiar = useRef(false);
  // Cambiar de vista desde un botón de adentro (el del aviso) lo deja sin dónde estar: ese botón ya no se ve. El foco pasa a la pestaña que se abrió —el patrón de
  // pestañas: el foco vive en la fila— y, de paso, la página sube hasta ella. Con el teclado, el siguiente Tab entra al panel. Se hace en un efecto (ya con la vista
  // dibujada), no en un `requestAnimationFrame`: ese se pausa si la ventana está oculta.
  const irALaVista = useCallback((v: VistaPlanDelPiso) => {
    enfocarAlCambiar.current = true;
    setVista(v);
  }, []);
  useEffect(() => {
    if (!enfocarAlCambiar.current) return;
    enfocarAlCambiar.current = false;
    caja.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, [vista]);
  const items: Pestana[] = [
    { clave: "propuesta", etiqueta: "Propuesta" },
    // El conteo de «por revisar» pide algo (ámbar) y su texto es lo que oye quien usa lector de pantalla tras el número.
    { clave: "grupos", etiqueta: "Grupos", conteo: porRevisar > 0 ? porRevisar : undefined, pide: porRevisar > 0 ? "por revisar" : undefined },
    { clave: "historia", etiqueta: "Historia" },
  ];
  return (
    <IrALaVista.Provider value={irALaVista}>
    <div ref={caja} className="space-y-6">
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
    </IrALaVista.Provider>
  );
}
