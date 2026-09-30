// La guía de foco de la ventana «Editar marca» (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: decir qué está hecho y qué hay que corregir en la edición de una marca con la MISMA regla que la rechaza al guardar
//            (`problemaEdicionMarca`, lib/marcas.ts): el nombre, y que «¿Quién la trae?» quede con al menos un proveedor bien armado.
//   ASUME:   la marca ya existe, así que sus campos llegan hechos: la guía solo se mueve cuando la persona rompe algo. Quién firma lo
//            agrega quien llama (viene del combo «Responsable»).
//   NO HACE: no agrega reglas. Una prueba exige que «se puede guardar» según la guía sea exactamente `problemaEdicionMarca === null`.
import type { CampoDeGuia } from "./guia-campos";
import { problemaEdicionMarca, type BorradorMarca, type ParejaDeMarca } from "./marcas";

export function camposDeEdicionMarca(actuales: ParejaDeMarca[], b: BorradorMarca, responsableListo: boolean): CampoDeGuia[] {
  const nombreBien = b.nombre.trim() !== "";
  // `problemaEdicionMarca` revisa el nombre primero y se detiene ahí: para juzgar solo a los proveedores se le da un nombre bueno.
  const problemaProveedores = problemaEdicionMarca(actuales, nombreBien ? b : { ...b, nombre: "x" });
  return [
    { id: "nombre", nombre: "Nombre de la marca", requerido: true, hecho: nombreBien, pendiente: "Escribe el nombre de la marca." },
    { id: "proveedores", nombre: "¿Quién la trae?", requerido: true, hecho: problemaProveedores === null, pendiente: problemaProveedores ?? "" },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsableListo, pendiente: "Elige quién registra." },
  ];
}
