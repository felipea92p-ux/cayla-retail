// La guía de foco del modal «Beneficios del club» (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: decir qué campo está bien y cuál hay que corregir con la MISMA regla que apaga «Guardar» (`problemasBeneficios`,
//            lib/club-beneficios-reglas.ts); el texto de lo que falta es el de esa regla.
//   ASUME:   el modal abre con los beneficios vigentes, así que sus campos llegan hechos (como «Editar marca»): la guía solo se mueve
//            cuando la persona borra o escribe mal algo. Quién firma lo agrega quien llama (viene del combo «Responsable»).
//   NO HACE: no agrega reglas. Una prueba exige que «se puede confirmar» según la guía sea exactamente «la regla no tiene problemas».
import type { CampoDeGuia } from "./guia-campos";
import { problemasBeneficios, type BorradorBeneficios, type CampoBeneficio } from "./club-beneficios-reglas";

/** Cómo llama la persona a cada campo, en el orden en que aparecen en el modal. */
export const NOMBRES_CAMPOS_BENEFICIOS: readonly { id: CampoBeneficio; nombre: string }[] = [
  { id: "pct", nombre: "% de cumpleaños" },
  { id: "compras", nombre: "Compras en el año" },
  { id: "monto", nombre: "Monto en el año" },
  { id: "dias", nombre: "Días para usar el vale" },
  { id: "escala", nombre: "Vale de cada año" },
];

export function camposDeBeneficios(b: BorradorBeneficios, responsableListo: boolean): CampoDeGuia[] {
  const problemas = problemasBeneficios(b);
  return [
    ...NOMBRES_CAMPOS_BENEFICIOS.map(({ id, nombre }) => ({ id, nombre, requerido: true, hecho: problemas[id] === null, pendiente: problemas[id] ?? "" })),
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsableListo, pendiente: "Elige quién hace el cambio." },
  ];
}
