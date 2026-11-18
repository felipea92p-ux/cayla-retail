// «Quién eres» en un solo viaje (ADR-0657, innovar «cambiar de módulo» #15, paso 1).
//
// EL PROBLEMA. `requirePersonaActualV2` (persona-actual.ts) le hacía SEIS preguntas a la base en cada render del servidor
// (`fn_persona_actual_resumen`, `fn_mi_terminal`, `fn_mis_modulos`, `fn_mi_persona_id`, `fn_es_admin`, `fn_mi_pantalla_principal`): seis
// peticiones a PostgREST, cada una con su transacción, y adentro las mismas preguntas repetidas. `retail.fn_mi_sesion()`
// (20261113200000) devuelve las seis en un jsonb. Este archivo lo traduce a las MISMAS seis respuestas que el marco ya sabía leer, con sus
// errores: el resto de `requirePersonaActualV2` no cambia ni una línea, y una cuenta ve exactamente lo de antes.
//
// Lógica pura: la usa `persona-actual.ts` y la prueba `mi-sesion-reglas.test.ts`.

import { esFalloDeLaBase } from "./base-caida-reglas";

/** Lo que se mira de un error de PostgREST (el de supabase-js lo cumple). */
export type ErrorDeLectura = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };

/** Una fila de `fn_persona_actual_resumen()`: la persona (o el aparato) y su sede de partida. */
export type FilaResumen = {
  nombre: string;
  es_lider: boolean;
  ubicacion_id: string;
  ubicacion_nombre: string;
  ubicacion_tipo: string;
};

/** Las seis respuestas, con la forma que tenían cuando eran seis llamadas (`data`, `error` y, en el resumen, el código HTTP). */
export type RespuestasDeIdentidad = {
  resumen: { data: FilaResumen | null; error: ErrorDeLectura | null; status: number };
  terminal: { data: string | null; error: ErrorDeLectura | null };
  modulos: { data: { clave: string; completo: boolean }[] | null; error: ErrorDeLectura | null };
  personaId: { data: string | null; error: ErrorDeLectura | null };
  esAdmin: { data: boolean | null };
  pantalla: { data: string | null; error: ErrorDeLectura | null };
};

/** Lo que devuelve `supabase.rpc("fn_mi_sesion")`. */
export type RespuestaDeLaSesion = { data: unknown; error: ErrorDeLectura | null; status: number };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const textoONulo = (x: unknown): string | null => (typeof x === "string" ? x : null);

// Lo que `.maybeSingle()` le respondía al marco cuando el resumen traía dos filas (una cuenta que es persona y terminal a la vez):
// el error de PostgREST «se pidió un objeto y vinieron varias filas». El marco lo lee como «sin acceso», igual que antes.
const VARIAS_FILAS: ErrorDeLectura = {
  code: "PGRST116",
  message: "JSON object requested, multiple (or no) rows returned",
  details: "Results contain more than one row",
  hint: null,
};

/**
 * Traduce la respuesta de `fn_mi_sesion()` a las seis de siempre. Devuelve `null` cuando hay que preguntar las seis como antes:
 *   · la función todavía no existe en esa base (web publicada antes de pegar la migración: PGRST202) o falló por otra razón que no es
 *     «la base no responde» (principio 9: un tropiezo de la función nueva no deja a nadie afuera);
 *   · la respuesta no tiene la forma esperada (nunca se adivina una identidad a medias).
 * Si la base no respondió (ADR-0450), NO se pregunta seis veces más: el resumen lleva ese error y el marco manda a `/sin-base`.
 */
export function respuestasDeLaSesion(respuesta: RespuestaDeLaSesion): RespuestasDeIdentidad | null {
  const { data, error, status } = respuesta;
  if (error) {
    if (!esFalloDeLaBase({ error, status })) return null;
    return {
      resumen: { data: null, error, status },
      terminal: { data: null, error },
      modulos: { data: null, error },
      personaId: { data: null, error },
      esAdmin: { data: null },
      pantalla: { data: null, error },
    };
  }
  if (!esObjeto(data) || !Array.isArray(data.resumen) || !Array.isArray(data.modulos)) return null;

  const filas = data.resumen;
  if (!filas.every(esObjeto)) return null;
  const modulos: { clave: string; completo: boolean }[] = [];
  for (const m of data.modulos) {
    if (!esObjeto(m) || typeof m.clave !== "string" || typeof m.completo !== "boolean") return null;
    modulos.push({ clave: m.clave, completo: m.completo });
  }

  // `.maybeSingle()`: ninguna fila = sin dato y sin error (sin acceso); una = la persona; dos o más = el error de PostgREST.
  const resumen: RespuestasDeIdentidad["resumen"] =
    filas.length === 0
      ? { data: null, error: null, status: 200 }
      : filas.length === 1
        ? { data: filas[0] as FilaResumen, error: null, status: 200 }
        : { data: null, error: VARIAS_FILAS, status: 406 };

  return {
    resumen,
    terminal: { data: textoONulo(data.terminal), error: null },
    modulos: { data: modulos, error: null },
    personaId: { data: textoONulo(data.persona_id), error: null },
    esAdmin: { data: data.es_admin === true },
    pantalla: { data: textoONulo(data.pantalla_principal), error: null },
  };
}
