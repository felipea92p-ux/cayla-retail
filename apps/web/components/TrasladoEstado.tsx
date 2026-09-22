import { Chip, type TonoChip } from "@/components/ui/Chip";
import type { SituacionTraslado } from "@/lib/traslados-reglas";

// El ESTADO de un traslado, dicho desde la sede que mira (no con el nombre
// interno): un chip pequeño y suave, con su punto de color. Es información, no
// un botón — la acción va aparte y con otra forma (ver `TrasladosLista`).
// El color reparte el énfasis: coral solo para lo que me toca ya; ámbar para
// lo que no cuadra; neutro para lo que viaja bien; verde para lo terminado.
// «En camino» va en pizarra, el estado informativo de la guía oficial (2026-09-22,
// ADR-0169): viaja bien, no pide nada, pero tampoco está terminado.
const ETIQUETA: Record<SituacionTraslado, string> = {
  requiere_recepcion: "Requiere confirmación",
  requiere_revision: "Con diferencia",
  en_camino_entrante: "En camino",
  en_camino_saliente: "En camino",
  con_diferencia: "Con diferencia",
  cerrado: "Completado",
};

const TONO: Record<SituacionTraslado, TonoChip> = {
  requiere_recepcion: "rojo",
  requiere_revision: "ambar",
  en_camino_entrante: "pizarra",
  en_camino_saliente: "pizarra",
  con_diferencia: "ambar",
  cerrado: "verde",
};

export function TrasladoEstado({ situacion }: { situacion: SituacionTraslado }) {
  return (
    <Chip tono={TONO[situacion]}>
      {ETIQUETA[situacion]}
    </Chip>
  );
}
