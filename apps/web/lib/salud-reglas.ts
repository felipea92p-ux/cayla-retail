// ¿Responde la base? — la pregunta mínima que repiten la pantalla `/sin-base` y el vigía de GitHub (ADR-0450). Lógica pura: la usa
// `app/api/salud/route.ts` y la prueba `salud-reglas.test.ts`.

/** Por qué la base «no está sana», dicho en una palabra que sirve en un aviso (nunca trae un mensaje de Postgres ni un dato). */
export type MotivoDeSalud =
  | "no_responde" // la puerta no contestó a tiempo, o contestó un error del servidor / «demasiadas peticiones»
  | "falta_fn_salud" // la base contesta pero `retail.fn_salud()` no está pegada (20261017225000): el vigía no puede dar un sí
  | "llave_rechazada" // la puerta rechazó la llave pública: un error de configuración, no de la base
  | "respuesta_inesperada";

export type ResultadoDeSalud = { ok: true } | { ok: false; motivo: MotivoDeSalud };

/**
 * Lee la respuesta de `POST /rest/v1/rpc/fn_salud`. `status` es el código HTTP y `codigo` el `code` del cuerpo JSON de PostgREST, si
 * lo trajo. `status: null` = no hubo respuesta (el `fetch` falló o se agotó el tiempo). Solo un 200 es un sí: el sí quiere decir que
 * una consulta de verdad corrió dentro de Postgres.
 */
export function leerRespuestaDeSalud(status: number | null, codigo?: string | null): ResultadoDeSalud {
  if (status === null || status === 0 || status === 429 || status >= 500) return { ok: false, motivo: "no_responde" };
  if (status === 200) return { ok: true };
  if (status === 404 && codigo === "PGRST202") return { ok: false, motivo: "falta_fn_salud" };
  if (status === 401 || status === 403) return { ok: false, motivo: "llave_rechazada" };
  return { ok: false, motivo: "respuesta_inesperada" };
}

/** Cuánto se guarda la respuesta en cada instancia: un monitor que pregunta cada minuto y cien pantallas esperando no deben sumar cien consultas. */
export const MS_DE_LA_RESPUESTA_GUARDADA = 10_000;
