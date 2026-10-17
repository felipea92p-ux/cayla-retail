import "server-only";
import { capturarError } from "./errores";
import {
  avisoDeFalla,
  AVISOS_CADA_MS,
  conTope,
  crearFrenoDeAvisos,
  TOPE_LECTURA_MS,
  type MotivoAviso,
  type PiezaAnalisis,
  type ResultadoLectura,
} from "./analisis-con-tope";

// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras»): CÓMO se lee cada pieza de la pantalla. Todas las
// lecturas de `analisis-*.ts` pasan por `leerPieza`, que hace tres cosas por ellas:
//   1. no espera más de `TOPE_LECTURA_MS` (la base o la red colgadas no dejan la pantalla esperando);
//   2. nunca lanza: lo que falla vuelve como `ResultadoLectura` y quien llama dice «no se pudo leer», nunca «sin ventas» (principio 9);
//   3. avisa a Sentry de lo que se degrada, por pieza, como máximo una vez por hora (ADR-0424: `capturarError`, solo ids y códigos).
// Sin Sentry (local, vistas previas) el aviso queda en la línea JSON de los logs y no sale a ningún lado. Sentry caído o sin configurar
// no cambia nada de lo que ve la persona.

/**
 * Un aviso por pieza y por hora, para toda la instancia. La clave es el `donde` del aviso: 11 lecturas fallando a la vez son UN aviso, y
 * «lenta» (`analisis.sede.lenta`) cuenta aparte para que una lectura lenta no calle, una hora, a la que después falla de verdad.
 */
const puedeAvisar = crearFrenoDeAvisos(AVISOS_CADA_MS);

function avisar(pieza: PiezaAnalisis, motivo: MotivoAviso, ms: number, ids: Readonly<Record<string, string>>, causa?: unknown): void {
  // Todo va dentro del `try`, `avisoDeFalla` y el freno incluidos: avisar es lo último que debe romper una pantalla que ya se degradó, y
  // `leerPieza` promete no lanzar nunca.
  try {
    const { donde, error, contexto } = avisoDeFalla(pieza, motivo, ms, ids, causa);
    if (!puedeAvisar(donde)) return;
    capturarError(donde, error, contexto);
  } catch {
    // Si el aviso falla, se pierde en silencio.
  }
}

/**
 * Solo en desarrollo (`next dev`): lo que dijo quien falló, para saber por qué en la terminal. El aviso que sale (log JSON y Sentry) lleva
 * el código pero NUNCA este mensaje (puede traer lo que devolvió la base); en producción y en las pruebas esto no escribe nada.
 */
function contarEnDesarrollo(pieza: PiezaAnalisis, causa: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const detalle = typeof causa === "object" && causa !== null && "message" in causa ? String((causa as { message: unknown }).message) : String(causa);
    console.warn(`Análisis (${pieza}): ${detalle}`);
  } catch {
    // Un error que ni se puede escribir no rompe la lectura.
  }
}

/** Lo que da `conTope` cuando el tope vence (un valor que ninguna lectura puede devolver). */
const TOPE_VENCIDO = Symbol("tope vencido");

/**
 * Lee UNA pieza de Análisis con tope de espera.
 *
 * `leer` hace la lectura y devuelve sus datos; si la base dio un error lo LANZA (`if (error) throw error`), y si respondió algo que no
 * se entiende devuelve `null`. Una lista vacía es un dato (`[]`), no una falla.
 *
 * `ids` son los de lo que se lee (`{ ubicacion_id }`): solo los uuid llegan al aviso. `lentaDesdeMs`: si la lectura SANA tarda eso o
 * más, también se avisa (para saber cuándo una lectura se acerca al tope de la base antes de que falle).
 */
export async function leerPieza<T>(
  pieza: PiezaAnalisis,
  ids: Readonly<Record<string, string>>,
  leer: () => PromiseLike<T | null>,
  lentaDesdeMs?: number,
): Promise<ResultadoLectura<T>> {
  const inicio = Date.now();
  try {
    const respuesta = await conTope(leer(), TOPE_LECTURA_MS, TOPE_VENCIDO);
    const ms = Date.now() - inicio;
    if (respuesta === TOPE_VENCIDO) {
      avisar(pieza, "tope_vencido", ms, ids);
      return { estado: "tope_vencido" };
    }
    if (respuesta === null) {
      avisar(pieza, "sin_datos", ms, ids);
      return { estado: "no_se_pudo" };
    }
    if (lentaDesdeMs !== undefined && ms >= lentaDesdeMs) avisar(pieza, "lenta", ms, ids);
    return { estado: "ok", datos: respuesta };
  } catch (e) {
    contarEnDesarrollo(pieza, e);
    avisar(pieza, "error", Date.now() - inicio, ids, e);
    return { estado: "no_se_pudo" };
  }
}
