"use client";

import { useRef, useState, type ComponentProps } from "react";
import { PanelRightOpen } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { CifrasExistencias } from "@/components/existencias/CifrasExistencias";
import { ValorInventarioExistencias } from "@/components/existencias/ValorInventarioExistencias";

/* ====================================================================
   «Resumen» de Existencias en el celular (Felipe 2026-11-17: «realizar un resumen u otro ícono para ver lo del KPI y el valor a costo»)

   Bajo 640 px, las cifras de la cabecera (colgadas · guardadas · en camino) y «Ver el valor a costo» se van detrás de un ícono, junto a
   «Ajustar stock», y la lista de prendas sube unos 170 px: antes ocupaban media pantalla antes de la primera prenda. Desde 640 px no
   cambia nada: las cifras siguen a la derecha de la cabecera y el valor a costo bajo ella, y este botón no se dibuja.

   El ícono es el del «Resumen» del Plan de campaña (`PanelRightOpen`, `PlanCampana.tsx`). La hoja es un `<Modal>` y no un `<Cajon>` como
   allá: en el celular el cajón mide siempre el 92 % de la pantalla y con dos cifras quedaba vacío; la hoja mide lo que tiene adentro y,
   como solo se lee, lleva la × (ADR-0358, «Las hojas»). Adentro van las MISMAS piezas con sus props: tocar «Colgadas» o «Guardadas»
   filtra la lista igual que en la cabecera y cierra la hoja para que se vea el resultado.
   ==================================================================== */

export function ResumenExistencias({
  cifras,
  valor,
}: {
  cifras: Omit<ComponentProps<typeof CifrasExistencias>, "alElegir">;
  /** `null` si la cuenta no ve el valor a costo: la hoja muestra solo las cifras. */
  valor: ComponentProps<typeof ValorInventarioExistencias> | null;
}) {
  const [abierto, setAbierto] = useState(false);
  // Al cerrar, el foco vuelve a este botón (`alCerrarEnfocar`): sin esto caía al `body` y quien va con teclado perdía su lugar
  // (auditoría /milimetro, 2026-11-17). Se guarda en el clic porque `<Boton>` no expone su `ref`.
  const disparador = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso="fantasma"
        onClick={(e) => {
          disparador.current = e.currentTarget;
          setAbierto(true);
        }}
        aria-expanded={abierto}
        title="Resumen"
        data-guia="existencias.resumen"
        className="min-w-11 !px-3 sm:hidden"
      >
        <PanelRightOpen aria-hidden className="h-4 w-4" />
        <span className="sr-only">Resumen</span>
      </Boton>
      {abierto && (
        <Modal titulo="Resumen" subtitulo={cifras.sede} onClose={() => setAbierto(false)} conCerrar alCerrarEnfocar={disparador}>
          <div className="space-y-5">
            <CifrasExistencias {...cifras} alElegir={() => setAbierto(false)} />
            {valor && <ValorInventarioExistencias {...valor} />}
          </div>
        </Modal>
      )}
    </>
  );
}
