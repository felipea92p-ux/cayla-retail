import { Chip } from "@/components/ui/Chip";
import { estadoTraslado, type SituacionTraslado } from "@/lib/traslados-reglas";

// El ESTADO de un traslado, dicho desde la sede que mira (no con el nombre
// interno): un chip pequeño y suave, con su punto de color. Es información, no
// un botón — la acción va aparte y con otra forma (ver `TrasladosLista`).
// El color reparte el énfasis: coral solo para lo que me toca ya; ámbar para
// lo que no cuadra; pizarra para lo que viaja bien; verde para lo terminado.
// «En camino» va en pizarra, el estado informativo de la guía oficial (2026-09-22,
// ADR-0169): viaja bien, no pide nada, pero tampoco está terminado.
// Las palabras y el tono salen de `estadoTraslado` (traslados-reglas.ts, con pruebas): la lista y el
// detalle dicen lo mismo con las mismas palabras. Desde el rediseño del 2026-09-22 la insignia dice lo que
// le TOCA a quien mira («Por confirmar», «Por revisar») y un cerrado que tuvo diferencia no sale en verde.
export function TrasladoEstado({ situacion, cerradoConDiferencia = false }: { situacion: SituacionTraslado; cerradoConDiferencia?: boolean }) {
  const e = estadoTraslado(situacion, cerradoConDiferencia);
  // `font-sans font-normal`: en el título del detalle la insignia vive dentro de un <h1> en serif 600.
  return (
    <Chip tono={e.tono} className="font-sans font-normal tracking-normal">
      {e.texto}
    </Chip>
  );
}
