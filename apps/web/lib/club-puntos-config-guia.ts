// La guía de foco de «Beneficios del club» (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: decir qué campo está bien y cuál hay que corregir con la MISMA regla que apaga «Guardar» (`problemasDeConfig`,
//            lib/club-puntos-config-reglas.ts); el texto de lo que falta es el de esa regla.
//   ASUME:   la pantalla abre con lo VIGENTE, así que sus campos llegan hechos (como «Editar marca»): la guía solo se mueve cuando la
//            persona borra o escribe mal algo. Quién firma lo agrega esta lista (viene del combo «Responsable»).
//   NO HACE: no agrega reglas. Una prueba exige que «se puede confirmar» según la guía sea exactamente «la regla no tiene problemas».
import type { CampoDeGuia } from "./guia-campos";
import { problemasDeConfig, type BorradorConfig, type CampoConfig } from "./club-puntos-config-reglas";

/** Cómo llama la persona a cada campo, en el orden en que aparecen en la pantalla. */
export const NOMBRES_CAMPOS_CONFIG: readonly { id: CampoConfig; nombre: string }[] = [
  { id: "puntosPorSol", nombre: "Puntos por cada S/\u00a01 que paga" },
  { id: "regaloCumple", nombre: "Regalo de cumpleaños" },
  { id: "solesPor100", nombre: "Lo que valen 100 puntos" },
  { id: "canjeMinimo", nombre: "Desde cuántos puntos canjea" },
  { id: "compraMinimaX", nombre: "La compra mínima del cupón" },
  { id: "vigenciaDias", nombre: "Cuánto dura el cupón" },
  { id: "topeCostoPct", nombre: "Lo máximo que quieres devolver" },
];

export function camposDeConfig(b: BorradorConfig, responsableListo: boolean): CampoDeGuia[] {
  const problemas = problemasDeConfig(b);
  return [
    ...NOMBRES_CAMPOS_CONFIG.map(({ id, nombre }) => ({ id, nombre, requerido: true, hecho: problemas[id] === null, pendiente: problemas[id] ?? "" })),
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsableListo, pendiente: "Elige quién hace el cambio." },
  ];
}
