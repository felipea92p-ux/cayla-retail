// Único archivo del repo con `server-only`, y es a propósito: acá se usa
// ANTHROPIC_API_KEY, que se paga por llamada. Sin el prefijo NEXT_PUBLIC_ Next
// no la inyecta al bundle, así que importar esto desde el cliente no filtraría
// la clave — pero dejaría un `undefined` que falla recién en producción y en
// runtime. Con esta línea, ese error ocurre en el build y dice por qué.
//
// Por eso también la parte pura vive en `anclar.ts` y no acá: `claveTexto` y
// `anclarPorNombre` no tocan la API, se testean sin red y sirven igual en el
// navegador para previsualizar. Mezclarlas obligaría a todo a ser server-only.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { anclarPorNombre, type Anclaje, type TerminoPropio, type TerminoUniversal } from "./anclar";

/**
 * Esquema de la respuesta, en JSON Schema y no en Zod a propósito:
 * `packages/shared` usa Zod v3 y el helper `zodOutputFormat` del SDK exige la
 * API de `zod/v4`. Tener dos dialectos de Zod conviviendo en el repo es justo
 * el detalle que en seis meses hace que alguien importe el equivocado. JSON
 * Schema es además lo que la API consume de verdad — Zod se convertiría a esto.
 *
 * `as const` no es decorativo: sin él `json-schema-to-ts` no puede inferir el
 * tipo de `parsed_output` y todo vuelve a ser `any`.
 */
const ESQUEMA_RESPUESTA = {
  type: "object",
  properties: {
    anclajes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clave: { type: "string", description: "La clave del término propio, copiada tal cual de la lista" },
          universalId: {
            type: "string",
            description: "El id del término universal del que cuelga, o cadena vacía si ninguno calza",
          },
          confianza: { type: "string", enum: ["alta", "media", "baja"] },
          porque: { type: "string", description: "Una frase corta en español explicando la elección" },
        },
        required: ["clave", "universalId", "confianza", "porque"],
        additionalProperties: false,
      },
    },
  },
  required: ["anclajes"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Eres el traductor entre el vocabulario propio de una marca de moda y un estándar universal de clasificación de productos.

Para cada término propio, elige el término universal del que debe COLGAR. No estás renombrando ni reemplazando: el término propio se conserva tal cual y la marca lo sigue viendo. Solo decides bajo qué término universal se agrupa.

Reglas:
- Elige siempre el universal más específico que sea correcto, nunca uno más general "por si acaso".
- Los términos propios pueden ser regionalismos peruanos o nombres comerciales. "Polera" es una sudadera; "casaca" es una chaqueta; "chompa" es un suéter; "palo rosa" es un rosa apagado; "camel" es un marrón claro.
- Si un término describe un patrón o acabado y no un color liso (estampado, animal print, multicolor), ánclalo al universal que exprese eso, no a un color concreto.
- Si de verdad ninguno calza, devuelve universalId vacío. Es preferible dejarlo sin anclar a forzar una equivalencia falsa: un anclaje incorrecto es invisible, uno faltante es visible y se corrige.
- La confianza es "alta" cuando es la misma cosa con otro nombre, "media" cuando es el pariente más cercano, "baja" cuando dudarías.

Devuelve exactamente un anclaje por cada término propio que recibas, con su clave copiada tal cual.`;

/**
 * Segunda pasada: lo que el código no pudo. Un solo viaje para todos los
 * pendientes — no uno por término.
 */
export async function anclarConIA(
  pendientes: TerminoPropio[],
  universales: TerminoUniversal[],
  queSon: string
): Promise<Anclaje[]> {
  if (pendientes.length === 0) return [];

  const client = new Anthropic();

  const catalogo = universales.map((u) => `${u.id}\t${u.ruta ?? u.nombre}`).join("\n");
  const lista = pendientes
    .map((p) => `${p.clave}\t${p.nombre}${p.contexto ? `\t(${p.contexto})` : ""}`)
    .join("\n");

  const respuesta = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: INSTRUCCIONES },
      {
        // El catálogo universal es idéntico en cada llamada y para cada cliente:
        // es el candidato perfecto a caché. Va DESPUÉS de las instrucciones y
        // ANTES de los términos volátiles, porque el caché es un match de
        // prefijo y cualquier byte que cambie antes lo invalida entero. El ttl
        // largo cubre el onboarding completo de un cliente.
        type: "text",
        text: `Términos universales disponibles (${queSon}), como "id<TAB>nombre":\n\n${catalogo}`,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Ancla estos ${pendientes.length} términos propios, como "clave<TAB>nombre<TAB>(contexto)":\n\n${lista}`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(ESQUEMA_RESPUESTA) },
  });

  // `parsed_output` es null si el modelo no produjo algo que valide contra el
  // esquema. Fallar acá es correcto: devolver una lista vacía haría creer que
  // no había nada que anclar.
  const salida = respuesta.parsed_output;
  if (!salida) {
    throw new Error("El modelo no devolvió un anclaje que calce con el esquema esperado.");
  }

  // El modelo puede inventar un id que no existe, o devolver un término que no
  // se le pidió. Las dos cosas se filtran acá: a la base solo llegan ids reales
  // y claves que salieron de esta misma consulta.
  const idsValidos = new Set(universales.map((u) => u.id));
  const clavesPedidas = new Set(pendientes.map((p) => p.clave));

  return salida.anclajes
    .filter((a) => clavesPedidas.has(a.clave))
    .map((a) => ({
      clave: a.clave,
      universalId: idsValidos.has(a.universalId) ? a.universalId : null,
      confianza: a.confianza as Anclaje["confianza"],
      porque: a.porque,
    }));
}

/** Las dos pasadas juntas: lo obvio por código, el resto por criterio. */
export async function anclar(
  propios: TerminoPropio[],
  universales: TerminoUniversal[],
  queSon: string
): Promise<{ anclajes: Anclaje[]; conIA: number }> {
  const { resueltos, pendientes } = anclarPorNombre(propios, universales);
  const deIA = await anclarConIA(pendientes, universales, queSon);

  // Un pendiente que el modelo no devolvió queda explícitamente sin anclar en
  // vez de desaparecer del resultado: la pantalla tiene que poder mostrarlo.
  const devueltas = new Set(deIA.map((a) => a.clave));
  const faltantes: Anclaje[] = pendientes
    .filter((p) => !devueltas.has(p.clave))
    .map((p) => ({
      clave: p.clave,
      universalId: null,
      confianza: "baja" as const,
      porque: "El modelo no lo clasificó.",
    }));

  return { anclajes: [...resueltos, ...deIA, ...faltantes], conIA: pendientes.length };
}
