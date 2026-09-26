import { Chip } from "@/components/ui/Chip";
import { estadoTraslado, type SituacionTraslado } from "@/lib/traslados-reglas";

// El ESTADO de un traslado, dicho desde la sede que mira (no con el nombre
// interno): un chip pequeño y suave, con su punto de color. Es información, no
// un botón — la acción va aparte y con otra forma (ver `TrasladosLista`).
// El color reparte el énfasis: coral para lo que tengo que recibir; ámbar para
// lo que no cuadra; pizarra para lo que viaja hacia otra sede (el informativo de
// la guía oficial, ADR-0169); verde para lo cerrado sin problemas; neutro para lo
// cerrado con diferencia; apagado y tachado para lo anulado (como toda anulación del ERP).
// Las palabras y el tono salen de `estadoTraslado` (traslados-reglas.ts, con pruebas): la lista y el
// detalle dicen lo mismo con las mismas palabras, y un estado tiene un solo nombre en toda la pantalla
// («Por recibir», «Cerrado», «Cerrado con diferencia», «Anulado»; hallazgo 16, ADR-0238).
// `cerradoConDiferencia` sigue para quien pasa «cerrado» con el dato aparte (el título del detalle).
export function TrasladoEstado({ situacion, cerradoConDiferencia = false }: { situacion: SituacionTraslado; cerradoConDiferencia?: boolean }) {
  const e = estadoTraslado(situacion, cerradoConDiferencia);
  // `font-sans font-normal`: en el título del detalle la insignia vive dentro de un <h1> en serif 600.
  return (
    <Chip tono={e.tono} className="font-sans font-normal tracking-normal">
      {e.texto}
    </Chip>
  );
}
