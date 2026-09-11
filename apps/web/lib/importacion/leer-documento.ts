// server-only por lo mismo que anclar-ia.ts: acá se usa ANTHROPIC_API_KEY.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { pedirJSON, type Uso } from "@/lib/ia/cliente";
import { detectarCabecera, type Tabla } from "./tabla";
import { ErrorDeLectura } from "./leer-archivo";

/**
 * El carril de PDF y foto: cuando no hay parser, lee el modelo.
 *
 * LA DIFERENCIA CON EL CARRIL DE EXCEL, dicha sin rodeos: en Excel y CSV el
 * modelo NUNCA ve las filas — ve cabeceras y una muestra, produce un plan, y
 * código determinista lo aplica. Acá no hay forma de leer un PDF escaneado o la
 * foto de un cuaderno sin que el modelo mire cada renglón. Es el carril CARO
 * (~2.000 tokens por página) y el menos exacto (un 7 manuscrito puede leerse
 * como 1). Por eso:
 *
 *   1. Termina en la MISMA tabla que el carril de Excel. De ahí en adelante todo
 *      es igual: la persona ve las filas, corrige, mapea, revisa, importa. La IA
 *      hizo el 90% del tipeo; la persona corrige el 10%.
 *   2. Se le pide al modelo que transcriba, no que interprete: "S/ 89,90" sale
 *      como "S/ 89,90". Convertir sigue siendo trabajo del mapeo.
 *   3. El costo real viaja a pantalla, para que se vea qué costó esa foto.
 *
 * LO QUE NO ES: no es para un catálogo de 900 prendas en PDF de 60 páginas. Para
 * eso el cliente casi siempre puede exportar a Excel, y hay que pedírselo.
 */

/** 4 MB, el mismo techo que leer-archivo.ts y por la misma razón (Vercel corta
 *  en 4,5). Una foto de celular pesa 2-4; un PDF de texto de 20 páginas, menos
 *  de 1. Más que esto es un PDF escaneado a alta resolución, que conviene
 *  convertir. */
export const MAX_BYTES_DOCUMENTO = 4 * 1024 * 1024;

/**
 * Páginas máximas de un PDF. Cada página son ~2.000 tokens de entrada y, si
 * trae tabla, ~1.500 de salida; a 20 páginas la salida roza el techo de 16.000
 * y el costo pasa de centavos a dólares. Un PDF más largo casi siempre salió
 * de un sistema que también exporta a Excel — y eso es lo que hay que pedir.
 * Antes no había tope: un PDF de 60 páginas se mandaba entero, se cortaba por
 * max_tokens y se cobraba igual. Revisión del 2026-09-11.
 */
export const MAX_PAGINAS_PDF = 20;

/**
 * Cuenta las páginas de un PDF sin librería: los objetos de página se declaran
 * como `/Type /Page` (y NO `/Pages`, que es el árbol). Es una aproximación —
 * un PDF comprimido en object streams puede esconderlos— pero solo sirve para
 * frenar los evidentes, y para esos acierta. Si no encuentra ninguno devuelve
 * 0 y se deja pasar: mejor un PDF raro que pasa a uno normal que se rechaza.
 */
export function contarPaginasPDF(datos: ArrayBuffer): number {
  const texto = Buffer.from(datos).toString("latin1");
  return (texto.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

const MIME_IMAGEN: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const ESQUEMA = {
  type: "object",
  properties: {
    cabeceras: {
      type: "array",
      items: { type: "string" },
      description: "Los títulos de columna tal como aparecen. Si el documento no trae títulos, inventa unos descriptivos cortos.",
    },
    filas: {
      type: "array",
      items: { type: "array", items: { type: "string" } },
      description: "Una fila por prenda. Cada fila con tantas celdas como cabeceras, en el mismo orden. Texto tal cual, sin convertir.",
    },
    notas: { type: "string", description: "Lo que no pudiste leer bien o dudas, en una o dos frases. Vacío si todo fue claro." },
  },
  required: ["cabeceras", "filas", "notas"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Transcribes el inventario de una tienda de ropa desde un documento — un PDF exportado de otro sistema, o la foto de una lista escrita a mano.

Devuelve una tabla: cabeceras y filas. Reglas:
- TRANSCRIBE, no interpretes. "S/ 89,90" se devuelve como "S/ 89,90"; "0012" como "0012" (con sus ceros). Convertir es trabajo de otro paso.
- Una fila por prenda o por variante, como esté en el documento. No agrupes ni separes.
- Todas las filas tienen la misma cantidad de celdas que las cabeceras. Si una celda está vacía o no se lee, déjala como "".
- Si el documento trae varias páginas o varias tablas con las mismas columnas, júntalas en una sola.
- Ignora totales, subtotales, encabezados repetidos y notas al pie: no son prendas.
- Si un dato manuscrito es ambiguo (un 1 que podría ser 7), transcribe tu mejor lectura y menciónalo en notas. No lo omitas.
- Si el documento no contiene ninguna tabla de inventario, devuelve cabeceras y filas vacías y explícalo en notas.`;

export type ResultadoDocumento = {
  tabla: Tabla;
  notas: string;
  uso: Uso;
};

/** Lo que promete ESQUEMA, escrito a mano: si divergen, el bug es de tipos. */
type SalidaDocumento = { cabeceras: string[]; filas: string[][]; notas: string };

export async function leerDocumento(datos: ArrayBuffer, nombre: string): Promise<ResultadoDocumento> {
  if (datos.byteLength > MAX_BYTES_DOCUMENTO) {
    throw new ErrorDeLectura(
      `El documento pesa ${(datos.byteLength / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES_DOCUMENTO / 1024 / 1024} MB. ` +
        `Si es un PDF largo, es mucho más barato y exacto pedirle al cliente que lo exporte a Excel.`
    );
  }

  const ext = nombre.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf") {
    const paginas = contarPaginasPDF(datos);
    if (paginas > MAX_PAGINAS_PDF) {
      throw new ErrorDeLectura(
        `El PDF tiene ${paginas} páginas y el máximo son ${MAX_PAGINAS_PDF}. Un catálogo así casi siempre viene de un sistema ` +
          `que también exporta a Excel o CSV: pídelo en ese formato, que es más exacto y no cuesta nada leerlo.`
      );
    }
  }

  const base64 = Buffer.from(datos).toString("base64");

  // El bloque de contenido cambia según sea PDF o imagen; el resto del pedido es
  // idéntico. Los dos son de la API (no hace falta librería para ninguno).
  const bloque: Anthropic.ContentBlockParam =
    ext === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : MIME_IMAGEN[ext]
        ? { type: "image", source: { type: "base64", media_type: MIME_IMAGEN[ext], data: base64 } }
        : (() => {
            throw new ErrorDeLectura(`No sé leer un .${ext} como documento. Acepto PDF y fotos (jpg, png, webp).`);
          })();

  const { salida, uso } = await pedirJSON<SalidaDocumento>({
    // 16.000 es el techo sin streaming del SDK (por encima exige .stream()).
    // Alcanza para ~400 prendas por documento, que es mucho más de lo que trae
    // una foto de cuaderno; un PDF que no quepa recibe el mensaje de partirlo.
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 3000 },
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [
      {
        role: "user",
        content: [bloque, { type: "text", text: `Transcribe el inventario de este documento (${nombre}).` }],
      },
    ],
    esquema: ESQUEMA,
    // Antes este mensaje estaba detrás de un `if (stop_reason === "max_tokens")`
    // que nunca corría: parse() del SDK lanzaba antes. Ver lib/ia/cliente.ts.
    siNoCabe: "El documento tiene más prendas de las que se pueden transcribir de una vez. Pártelo en dos, o pide el Excel.",
  });

  if (salida.filas.length === 0) {
    throw new ErrorDeLectura(
      salida.notas
        ? `No encontré una tabla de inventario: ${salida.notas}`
        : "No encontré una tabla de inventario en el documento."
    );
  }

  // Normaliza al ancho de las cabeceras, igual que hace el parser de CSV: el
  // modelo promete el mismo ancho, pero una promesa no es una garantía.
  const ancho = salida.cabeceras.length;
  const filas = [
    salida.cabeceras,
    ...salida.filas.map((f) => (f.length === ancho ? f : [...f, ...Array(Math.max(0, ancho - f.length)).fill("")].slice(0, ancho))),
  ];

  return {
    tabla: {
      filas,
      filaCabecera: detectarCabecera(filas),
      origen: `${nombre} · transcrito`,
    },
    notas: salida.notas,
    uso,
  };
}
