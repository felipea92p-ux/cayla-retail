// server-only: acá se usa ANTHROPIC_API_KEY. Ver anclar-ia.ts para el porqué.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Lo único que todas las llamadas al modelo tienen en común, en un solo lugar.
 *
 * TRES COSAS QUE ANTES ESTABAN REPETIDAS —Y DISTINTAS— EN CUATRO ARCHIVOS:
 *
 * 1. Pedir JSON validado. `client.messages.parse()` del SDK tiene una trampa
 *    que la revisión del 2026-09-11 destapó: cuando la respuesta se corta por
 *    `max_tokens`, el JSON queda a medias y `parse()` LANZA ("Failed to parse
 *    structured output") antes de devolver el mensaje. El `if (stop_reason ===
 *    "max_tokens")` que había después era código muerto: nunca se llegaba. Acá
 *    se usa `create()` y se mira `stop_reason` ANTES de parsear, así "el
 *    documento no cabe" y "el modelo no respetó el esquema" son dos errores
 *    distintos con dos mensajes distintos.
 *
 * 2. Medir lo que costó. `usage.input_tokens` NO incluye los tokens que
 *    entraron por caché — van aparte en `cache_read_input_tokens` y
 *    `cache_creation_input_tokens`. La pantalla sumaba entrada×$1 + salida×$5 y
 *    se olvidaba del caché: la primera llamada de la hora (que ESCRIBE el
 *    árbol de 18.500 tokens a $2/M) se mostraba a un tercio de su costo real.
 *    Medir mal es peor que no medir: da confianza en un número falso.
 *
 * 3. Traducir los fallos de la API a idioma CAYLA, misma regla que
 *    `traducirError` para Postgres (ADR-0022). Antes solo lo hacía el endpoint
 *    de anclaje; los tres del importador devolvían el crudo en inglés, o un 502
 *    para un 429 que solo pedía esperar.
 */

export const MODELO = "claude-haiku-4-5";

/**
 * Precios de Haiku 4.5 por millón de tokens (console.anthropic.com/pricing,
 * verificado 2026-09-11). El caché de 1 h escribe al doble del precio de
 * entrada y se lee a la décima parte: es lo que hace rentable mandar el árbol
 * entero en cada llamada.
 */
const PRECIO_POR_MILLON = { entrada: 1, salida: 5, cacheLeido: 0.1, cacheEscrito: 2 } as const;

export type Uso = {
  entrada: number;
  salida: number;
  cacheLeido: number;
  cacheEscrito: number;
  /** En dólares, con el caché contado. Lo calcula el servidor: la pantalla solo lo muestra. */
  costo: number;
};

export const SIN_USO: Uso = { entrada: 0, salida: 0, cacheLeido: 0, cacheEscrito: 0, costo: 0 };

export function medirUso(usage: Anthropic.Usage): Uso {
  const entrada = usage.input_tokens;
  const salida = usage.output_tokens;
  const cacheLeido = usage.cache_read_input_tokens ?? 0;
  const cacheEscrito = usage.cache_creation_input_tokens ?? 0;
  const costo =
    (entrada * PRECIO_POR_MILLON.entrada +
      salida * PRECIO_POR_MILLON.salida +
      cacheLeido * PRECIO_POR_MILLON.cacheLeido +
      cacheEscrito * PRECIO_POR_MILLON.cacheEscrito) /
    1e6;
  return { entrada, salida, cacheLeido, cacheEscrito, costo };
}

export function sumarUso(...usos: Uso[]): Uso {
  return usos.reduce(
    (a, b) => ({
      entrada: a.entrada + b.entrada,
      salida: a.salida + b.salida,
      cacheLeido: a.cacheLeido + b.cacheLeido,
      cacheEscrito: a.cacheEscrito + b.cacheEscrito,
      costo: a.costo + b.costo,
    }),
    SIN_USO
  );
}

/**
 * Un fallo del modelo que el código de arriba SÍ sabe explicar. Los demás
 * (red, saldo, clave) los lanza el SDK y los traduce `traducirErrorIA`.
 */
export class ErrorIA extends Error {
  constructor(
    mensaje: string,
    /** `max_tokens`: la respuesta no cupo. `esquema`: no fue JSON válido. */
    public readonly motivo: "max_tokens" | "esquema"
  ) {
    super(mensaje);
  }
}

type ParametrosJSON = Omit<Anthropic.MessageCreateParamsNonStreaming, "output_config" | "model" | "stream"> & {
  /** JSON Schema con `type: "object"` en la raíz. La API valida contra él. */
  esquema: { type: "object"; [k: string]: unknown };
  /** Qué decir si la respuesta se corta por tamaño. Sin él, un mensaje genérico. */
  siNoCabe?: string;
};

/**
 * Una llamada al modelo que devuelve JSON validado contra `esquema`, o lanza
 * `ErrorIA` diciendo POR QUÉ no.
 */
export async function pedirJSON<T>(params: ParametrosJSON): Promise<{ salida: T; uso: Uso }> {
  const { esquema, siNoCabe, ...resto } = params;
  const client = new Anthropic();

  // El formato se arma a mano y no con `jsonSchemaOutputFormat()`: ese helper
  // existe para que `parse()` infiera el tipo del resultado, y acá el parseo
  // es nuestro (ver cabecera). A la API le llega exactamente lo mismo.
  const respuesta = await client.messages.create({
    ...resto,
    model: MODELO,
    output_config: { format: { type: "json_schema", schema: esquema } },
  });

  const uso = medirUso(respuesta.usage);

  if (respuesta.stop_reason === "max_tokens") {
    throw new ErrorIA(
      siNoCabe ?? "La respuesta del modelo no cupo en el tamaño máximo. Prueba con menos datos por vez.",
      "max_tokens"
    );
  }

  const texto = respuesta.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  try {
    return { salida: JSON.parse(texto) as T, uso };
  } catch {
    throw new ErrorIA("El modelo no devolvió una respuesta con la forma esperada. Reintenta.", "esquema");
  }
}

/**
 * Freno de volumen: cuántas llamadas pagadas puede disparar UNA persona por
 * hora, sumando mapeo, valores, documentos y anclaje. La clave de Anthropic es
 * una sola, de prepago, y compartida por todas las sedes: sin esto, un líder
 * subiendo fotos en bucle dejaba sin saldo (402) al resto. 40 alcanza para
 * importar varios catálogos en una tarde; no alcanza para vaciar la cuenta.
 *
 * HONESTIDAD SOBRE EL ALCANCE: vive en memoria del proceso. En Vercel cada
 * instancia tiene la suya, así que el techo real es 40 × instancias activas —
 * un freno, no una garantía. La garantía sería una tabla; el día que haga
 * falta, ésta es la función que se reemplaza. Revisión del 2026-09-11.
 */
const LLAMADAS_POR_HORA = 40;
const historial = new Map<string, number[]>();

export function permitirLlamada(quien: string): { ok: true } | { ok: false; mensaje: string } {
  const ahora = Date.now();
  const recientes = (historial.get(quien) ?? []).filter((t) => ahora - t < 3_600_000);
  if (recientes.length >= LLAMADAS_POR_HORA) {
    historial.set(quien, recientes);
    const minutos = Math.ceil((3_600_000 - (ahora - recientes[0])) / 60_000);
    return {
      ok: false,
      mensaje: `Ya se hicieron ${LLAMADAS_POR_HORA} consultas al modelo en la última hora desde esta cuenta. Espera ${minutos} min, o sigue con lo que no necesita el modelo.`,
    };
  }
  recientes.push(ahora);
  historial.set(quien, recientes);
  return { ok: true };
}

/**
 * Los fallos de la API en idioma CAYLA. El crudo llega en inglés y dice
 * "credit balance is too low" — cierto, pero deja a quien lo lee sin saber si
 * rompió algo, si es su culpa o a quién avisar. Y el más probable de todos no
 * es un bug: es que se acabó el saldo, que le pasa a cualquier cuenta de
 * prepago.
 *
 * `queHacia` completa la frase: "El anclaje automático", "La lectura del
 * documento". `alternativa` es qué sí se puede hacer mientras tanto.
 *
 * Lo que no se reconoce se devuelve tal cual, nunca se traga: un traductor que
 * inventa un mensaje para lo que no entendió es peor que no tenerlo.
 */
export function traducirErrorIA(
  e: unknown,
  queHacia: string,
  alternativa = ""
): { mensaje: string; status: number } {
  const crudo = e instanceof Error ? e.message : String(e);
  const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : 0;
  const cola = alternativa ? ` ${alternativa}` : "";

  if (e instanceof ErrorIA) {
    return { mensaje: e.message, status: 422 };
  }
  if (crudo.includes("credit balance")) {
    return {
      mensaje:
        `La cuenta de Anthropic se quedó sin saldo. ${queHacia} no puede correr hasta que se recargue ` +
        `en console.anthropic.com (Plans & Billing).${cola}`,
      status: 402,
    };
  }
  if (status === 401 || crudo.includes("authentication_error")) {
    return {
      mensaje: "La clave de Anthropic no es válida o fue revocada. Hay que revisar ANTHROPIC_API_KEY.",
      status: 401,
    };
  }
  if (status === 429) {
    return {
      mensaje: "Anthropic está limitando las consultas por volumen. Espera un momento y vuelve a intentar.",
      status: 429,
    };
  }
  if (status === 529 || status >= 500 || crudo.includes("overloaded")) {
    return {
      mensaje: "Anthropic no está respondiendo en este momento. No se guardó nada; reintenta en unos minutos.",
      status: 503,
    };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return {
      mensaje: "No se pudo llegar a Anthropic. Revisa la conexión y vuelve a intentar.",
      status: 503,
    };
  }
  return { mensaje: `${queHacia} falló: ${crudo}`, status: 502 };
}
