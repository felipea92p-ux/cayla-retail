"use client";

import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { useIrALaVista } from "@/components/plan-piso/PlanDelPisoPestanas";
import { avisoDeGruposPorRevisar } from "@/lib/plan-piso-grupos";

// El aviso de la Propuesta sobre las categorías «por revisar» o «sin grupo» (Formidable 2026-10-10, ley 2: una pregunta, una respuesta). Antes era una nota que
// decía «…siguen "por revisar" en la pestaña Grupos» y obligaba a ir a buscarla; ahora el botón abre esa pestaña. El texto sale de
// `avisoDeGruposPorRevisar` (lógica pura, con su prueba): las revisa quien ve el Plan del piso (ADR-0534).
//
// Es cliente porque cambiar de pestaña es estado de `PlanDelPisoPestanas`. Fuera de esa pantalla (sin el contexto) no hay a dónde llevar: queda
// el aviso sin botón, nunca un botón que no hace nada.
export function AvisoPorRevisar({ porRevisar, sinGrupo, guia }: { porRevisar: number; sinGrupo: number; /** El ancla de la guía interactiva (`data-guia`, ADR-0389). */ guia?: string }) {
  const irALaVista = useIrALaVista();
  const aviso = avisoDeGruposPorRevisar(porRevisar, sinGrupo);
  if (!aviso) return null;
  return (
    <Aviso
      tono="atencion"
      guia={guia}
      titulo={aviso.titulo}
      accion={
        irALaVista ? (
          <Boton peso="fantasma" onClick={() => irALaVista("grupos")}>
            {aviso.accion}
          </Boton>
        ) : undefined
      }
    >
      {aviso.detalle}
    </Aviso>
  );
}
