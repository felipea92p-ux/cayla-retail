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
import { pedirJSON, sumarUso, SIN_USO, type Uso } from "@/lib/ia/cliente";
import { anclarPorNombre, type Anclaje, type TerminoPropio, type TerminoUniversal } from "./anclar";

/**
 * Lo que costó la llamada viaja hasta la pantalla en vez de quedarse en un log:
 * así el costo real se contrasta con el estimado en vez de creerlo. La forma
 * (`Uso`) y la aritmética viven en lib/ia/cliente.ts.
 */
export type { Uso };

/**
 * Cuántos términos van por llamada. Con 60, la respuesta son ~3.000 tokens de
 * JSON — lejos del techo de 16.000. Sin tope, un cliente con 400 colores
 * distintos (pasa: cada tono con nombre comercial) pedía 400 anclajes en una
 * sola respuesta, se cortaba por max_tokens y perdía TODO, no solo el
 * excedente. Revisión del 2026-09-11.
 */
const LOTE = 60;

/**
 * Esquema de la respuesta, en JSON Schema y no en Zod a propósito:
 * `packages/shared` usa Zod v3 y el helper `zodOutputFormat` del SDK exige la
 * API de `zod/v4`. Tener dos dialectos de Zod conviviendo en el repo es justo
 * el detalle que en seis meses hace que alguien importe el equivocado. JSON
 * Schema es además lo que la API consume de verdad — Zod se convertiría a esto.
 *
 * El tipo TypeScript de la salida (`SalidaAnclaje`, abajo) se escribe a mano y
 * tiene que decir lo mismo que este esquema: la API valida contra el esquema,
 * el código confía en el tipo. Si divergen, el bug es de tipos, no de datos.
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
): Promise<{ anclajes: Anclaje[]; uso: Uso }> {
  if (pendientes.length === 0) return { anclajes: [], uso: SIN_USO };

  // Por lotes, en paralelo: el catálogo universal es el mismo bloque cacheado
  // en todos, así que el segundo lote en adelante paga solo la lectura de caché.
  const lotes: TerminoPropio[][] = [];
  for (let i = 0; i < pendientes.length; i += LOTE) lotes.push(pendientes.slice(i, i + LOTE));

  const resultados = await Promise.all(lotes.map((lote) => anclarLote(lote, universales, queSon)));
  return {
    anclajes: resultados.flatMap((r) => r.anclajes),
    uso: sumarUso(...resultados.map((r) => r.uso)),
  };
}

type SalidaAnclaje = {
  anclajes: { clave: string; universalId: string; confianza: string; porque: string }[];
};

async function anclarLote(
  pendientes: TerminoPropio[],
  universales: TerminoUniversal[],
  queSon: string
): Promise<{ anclajes: Anclaje[]; uso: Uso }> {
  const catalogo = universales.map((u) => `${u.id}\t${u.ruta ?? u.nombre}`).join("\n");
  const lista = pendientes
    .map((p) => `${p.clave}\t${p.nombre}${p.contexto ? `\t(${p.contexto})` : ""}`)
    .join("\n");

  const { salida, uso } = await pedirJSON<SalidaAnclaje>({
    /**
     * Haiku 4.5, decidido con Felipe (2026-09-10) después de medir: anclar los 30
     * colores y 37 categorías cuesta ~$0.03 con Haiku contra ~$0.15 con Opus 5, y
     * a 100 clientes al año la diferencia total del sistema son ~15 dólares. El
     * ahorro no es lo que decide — es que la tarea está acotada: elegir entre 19
     * colores y 567 hojas de un árbol, con el catálogo entero delante.
     *
     * Se descartó el tier gratuito de Gemini, que sale aún más barato, por una
     * razón que no es de precio: ahí los prompts se usan para entrenar. Lo que
     * viaja acá es el catálogo de un cliente —sus productos, precios y costos—, y
     * eso no se manda a entrenar el modelo de nadie.
     *
     * Si el anclaje de CAYLA sale torcido, éste es el string que se sube: los 37
     * términos que Felipe conoce de memoria son el examen de admisión del modelo.
     * (El id del modelo vive en lib/ia/cliente.ts, MODELO.)
     */
    max_tokens: 16000,
    /**
     * Haiku 4.5 no acepta `thinking: {type: "adaptive"}` ni `output_config.effort`
     * —los dos dan 400—, así que acá va el presupuesto fijo, que es la forma que
     * esta generación sí entiende. Debe ser menor que `max_tokens` y mínimo 1024.
     * 4.000 no es un número al azar: elegir entre 567 rutas jerárquicas es la
     * parte donde un modelo pequeño se equivoca, y es lo único que amerita que
     * piense antes de responder.
     */
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: [
      { type: "text", text: INSTRUCCIONES },
      {
        // El catálogo universal es idéntico en cada llamada y para cada cliente:
        // es el candidato perfecto a caché. Va DESPUÉS de las instrucciones y
        // ANTES de los términos volátiles, porque el caché es un match de
        // prefijo y cualquier byte que cambie antes lo invalida entero. El ttl
        // largo cubre el onboarding completo de un cliente.
        //
        // OJO al leer `usage.cache_read_input_tokens`: en CATEGORÍAS cachea (el
        // árbol son ~18.500 tokens), en COLORES no — 19 valores más las
        // instrucciones no llegan al mínimo cacheable de Haiku. Un cero ahí no es
        // un bug ni cuesta nada: esa llamada entera vale una fracción de centavo.
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
    esquema: ESQUEMA_RESPUESTA,
    siNoCabe: `La respuesta para ${pendientes.length} términos no cupo. Es un límite del sistema, no del archivo: avisar.`,
  });
  // Si el modelo no produjo algo que valide contra el esquema, pedirJSON lanza.
  // Fallar acá es correcto: devolver una lista vacía haría creer que no había
  // nada que anclar.

  // El modelo puede inventar un id que no existe, o devolver un término que no
  // se le pidió. Las dos cosas se filtran acá: a la base solo llegan ids reales
  // y claves que salieron de esta misma consulta.
  const idsValidos = new Set(universales.map((u) => u.id));
  const clavesPedidas = new Set(pendientes.map((p) => p.clave));

  const anclajes = salida.anclajes
    .filter((a) => clavesPedidas.has(a.clave))
    .map((a) => {
      const valido = idsValidos.has(a.universalId);
      // Tres casos distintos que ANTES se veían iguales, y por eso el examen del
      // 2026-09-10 mostraba "SIN ANCLAR" junto a un texto que decía "coincide
      // exactamente con Bolsos": el modelo señalaba un id que el catálogo no
      // traía y acá se volvía null en silencio. Un descarte mudo convierte un
      // fallo del sistema en lo que parece una decisión del modelo — y manda a
      // revisar el término equivocado.
      if (valido) {
        return { clave: a.clave, universalId: a.universalId, confianza: a.confianza as Anclaje["confianza"], porque: a.porque };
      }
      if (!a.universalId) {
        return { clave: a.clave, universalId: null, confianza: "baja" as const, porque: a.porque || "Ninguno calzó." };
      }
      return {
        clave: a.clave,
        universalId: null,
        confianza: "baja" as const,
        porque: `El modelo señaló "${a.universalId}", que no está en el catálogo que se le pasó. Revisar. (Dijo: ${a.porque})`,
      };
    });

  return { anclajes, uso };
}

/** Las dos pasadas juntas: lo obvio por código, el resto por criterio. */
export async function anclar(
  propios: TerminoPropio[],
  universales: TerminoUniversal[],
  queSon: string
): Promise<{ anclajes: Anclaje[]; conIA: number; uso: Uso }> {
  const { resueltos, pendientes } = anclarPorNombre(propios, universales);
  const { anclajes: deIA, uso } = await anclarConIA(pendientes, universales, queSon);

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

  return { anclajes: [...resueltos, ...deIA, ...faltantes], conIA: pendientes.length, uso };
}
