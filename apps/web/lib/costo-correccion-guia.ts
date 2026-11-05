// La guía de foco de la hoja «Corregir el costo» de la última compra (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: decir qué está hecho y qué sigue con la MISMA regla que rechaza al guardar (`problemaDelCosto`, `problemaDelMotivo` de
//            lib/costo-correccion-reglas.ts, las que la base repite): el costo correcto, el motivo y quién firma.
//   ASUME:   quien llama pasa `costoActual` (lo que costó lo que llegó, hoy) y si el responsable ya está elegido (viene del combo).
//   NO HACE: no agrega reglas. Una prueba exige que «se puede guardar» según la guía sea exactamente `problemaDeLaCorreccion === null`.
import type { CampoDeGuia } from "./guia-campos";
import { problemaDelCosto, problemaDelMotivo, type BorradorCorreccion } from "./costo-correccion-reglas";

export function camposDeCorreccionCosto(b: BorradorCorreccion, responsableListo: boolean): CampoDeGuia[] {
  const problemaCosto = problemaDelCosto(b.costo, b.costoActual);
  const problemaMotivo = problemaDelMotivo(b.motivo);
  return [
    { id: "costo", nombre: "Costo correcto", requerido: true, hecho: problemaCosto === null, pendiente: problemaCosto ?? "" },
    { id: "motivo", nombre: "Qué estaba mal", requerido: true, hecho: problemaMotivo === null, pendiente: problemaMotivo ?? "" },
    { id: "responsable", nombre: "Quién corrige", requerido: true, hecho: responsableListo, pendiente: "Elige quién corrige." },
  ];
}
