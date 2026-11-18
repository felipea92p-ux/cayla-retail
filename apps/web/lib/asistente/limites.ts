// Los dos límites de «Pregúntale a CAYLA» que también lee el navegador: cuánto se puede gastar en IA en un mes y qué tan larga puede ser una
// pregunta. Viven solos, sin importar nada (ADR-0674 act. g): estaban en `respuesta.ts`, que arma un esquema de zod al cargarse, y por leer
// una constante de ahí Configuración bajaba zod entero (52 KB). `respuesta.ts` sigue exportando lo que usa el servidor.

/**
 * Lo que se puede gastar en IA en un mes de Lima (ADR-0536, decisión 9): al llegar, el asistente sigue sin IA hasta el día 1. Lo suma
 * la base (`fn_asistente_gasto_del_mes`) con el costo que anota cada pregunta. Cambiarlo es decisión de Felipe.
 */
export const TOPE_MENSUAL_USD = 30;

/** ¿Ya se gastó el mes? Un gasto que no se pudo leer (`null`: la base no respondió) no corta la IA: el tope de Anthropic queda de respaldo. */
export function seLlegoAlTope(gastado: number | null): boolean {
  return gastado !== null && Number.isFinite(gastado) && gastado >= TOPE_MENSUAL_USD;
}

/** Lo más largo que se acepta preguntar: una pregunta de tienda cabe de sobra; más es otra cosa (un texto pegado). */
export const LARGO_MAXIMO_PREGUNTA = 300;
