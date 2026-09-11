// server-only por lo mismo que anclar-ia.ts: acá se usa ANTHROPIC_API_KEY.
import "server-only";
import { pedirJSON, type Uso } from "@/lib/ia/cliente";
import { CAMPOS, type Campo, type Disposicion, type PlanDeMapeo } from "./mapeo";

/**
 * La llamada que mira el archivo del cliente y dice qué es cada columna.
 *
 * LO QUE EL MODELO VE: las cabeceras y 40 filas de muestra. NO las 3.000. Es la
 * decisión que hace este importador barato y reproducible a la vez — el modelo
 * produce un PLAN, y después código determinista lo aplica a todo el archivo.
 * Mandarle las 3.000 filas costaría ~40 veces más y aceptaría que pueda
 * equivocarse en cualquiera de ellas.
 *
 * POR QUÉ 40 FILAS Y NO 5: con 5 no se distingue una columna de talla de una de
 * color si las primeras prendas son todas "Único"/"Negro", ni se ve que la
 * columna 7 está vacía en el 90% del archivo. Con 40 aparecen los casos raros y
 * siguen siendo ~1.800 tokens.
 */

const MUESTRA = 40;

const ESQUEMA = {
  type: "object",
  properties: {
    disposicion: {
      type: "string",
      enum: ["fila_por_variante", "matriz_de_tallas"],
      description: "matriz_de_tallas si hay UNA COLUMNA POR TALLA con cantidades dentro",
    },
    columnas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          indice: { type: "integer", description: "Índice de la columna, empezando en 0" },
          campo: { type: "string", enum: [...CAMPOS] },
          confianza: { type: "string", enum: ["alta", "media", "baja"] },
          porque: { type: "string", description: "Frase corta en español" },
        },
        required: ["indice", "campo", "confianza", "porque"],
        additionalProperties: false,
      },
    },
    columnasTalla: {
      type: "array",
      description: "Solo si disposicion es matriz_de_tallas: qué columna es qué talla",
      items: {
        type: "object",
        properties: {
          indice: { type: "integer" },
          talla: { type: "string" },
        },
        required: ["indice", "talla"],
        additionalProperties: false,
      },
    },
    notas: { type: "string", description: "Lo raro que hayas visto, en una o dos frases" },
  },
  required: ["disposicion", "columnas", "columnasTalla", "notas"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Eres quien lee el archivo de inventario de una tienda de ropa y dice qué significa cada columna, para poder importarlo a un sistema con campos fijos.

Los campos destino son:
- referencia: el NOMBRE de la prenda ("Blusa manga larga escote V"). Es el único imprescindible.
- codigoCliente: el código o SKU que la tienda ya usa. Puede tener ceros a la izquierda.
- categoria: el tipo de prenda ("Blusas", "Jeans", "Aretes").
- talla, color: tal como los escribe la tienda; ya se normalizarán después.
- costo: lo que le costó comprarla. precio: a cuánto la vende. Si solo hay uno, casi siempre es el precio de venta.
- marca, genero, temporada, descripcion, tejido, patron: opcionales.
- ignorar: para columnas que no aportan (notas internas, totales, columnas vacías, el número de fila).

Reglas:
- Un archivo de moda suele venir en uno de dos formatos. Si ves UNA COLUMNA POR TALLA (cabeceras como S, M, L, XL, o 36, 38, 40) con cantidades dentro, es "matriz_de_tallas" y esas columnas van en columnasTalla, no en columnas. Si cada fila ya es una variante con su talla en una celda, es "fila_por_variante".
- Fíjate en los DATOS, no solo en el título. Una columna llamada "TIPO" que contiene "Azul marino, Rojo, Negro" es color, diga lo que diga la cabecera.
- Si hay dos columnas de importe, la menor suele ser el costo y la mayor el precio. Si no puedes distinguirlas, marca confianza baja y dilo en porque.
- No inventes: una columna que no sabes qué es va a "ignorar" con confianza baja. Es preferible que una persona la asigne a que entre mal.
- Cada columna del archivo debe aparecer exactamente una vez, incluidas las que ignoras.
- Las cabeceras pueden estar en español peruano: "P. VENTA" o "PVP" es precio, "COD" es código, "DESCRIPCION" suele ser la referencia, "CANT" es cantidad (ignorar: el stock se cuenta aparte).`;

export type ResultadoInferencia = {
  plan: PlanDeMapeo;
  /** Lo que costó, para poder contrastarlo con lo estimado en vez de creerlo. */
  uso: Uso;
};

/** Lo que promete ESQUEMA, escrito a mano: si divergen, el bug es de tipos. */
type SalidaPlan = {
  disposicion: string;
  columnas: { indice: number; campo: string; confianza: string; porque: string }[];
  columnasTalla: { indice: number; talla: string }[];
  notas: string;
};

export async function inferirMapeo(filas: string[][], filaCabecera: number): Promise<ResultadoInferencia> {
  const cabeceras = filas[filaCabecera] ?? [];
  const muestra = filas.slice(filaCabecera + 1, filaCabecera + 1 + MUESTRA);

  // Las columnas van numeradas explícitamente: pedirle al modelo que cuente
  // posiciones en una tabla ancha es justo donde se desalinea, y un índice
  // corrido mete el precio en el campo de la talla.
  const tabla = [
    cabeceras.map((c, i) => `[${i}] ${c.trim() || "(sin título)"}`).join("\n"),
    "",
    "Primeras filas:",
    ...muestra.map((f, n) => `${n + 1}: ${f.map((c) => c.trim()).join(" | ")}`),
  ].join("\n");

  const { salida, uso } = await pedirJSON<SalidaPlan>({
    max_tokens: 16000,
    // Ver anclar-ia.ts: Haiku 4.5 rechaza thinking adaptive y output_config.effort.
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: [
      {
        type: "text",
        text: INSTRUCCIONES,
        // Las instrucciones son idénticas para todos los clientes: es lo único
        // cacheable acá, porque la tabla cambia con cada archivo. Con ~900
        // tokens puede no llegar al mínimo de Haiku; si no cachea no pasa nada,
        // la llamada entera cuesta una fracción de centavo.
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [{ role: "user", content: `Columnas del archivo:\n\n${tabla}` }],
    esquema: ESQUEMA,
  });

  // El modelo puede señalar una columna que no existe, repetir un índice o
  // devolver una talla vacía. Se filtra acá: lo que llega al aplicador solo
  // contiene índices reales del archivo, y una sola vez cada uno.
  const ancho = Math.max(cabeceras.length, ...filas.map((f) => f.length));
  const vistos = new Set<number>();
  const columnas = salida.columnas
    .filter((c) => c.indice >= 0 && c.indice < ancho && !vistos.has(c.indice) && vistos.add(c.indice) !== undefined)
    .map((c) => ({
      indice: c.indice,
      campo: c.campo as Campo,
      confianza: c.confianza as "alta" | "media" | "baja",
      porque: c.porque,
    }));

  const columnasTalla = salida.columnasTalla
    .filter((t) => t.indice >= 0 && t.indice < ancho && t.talla.trim())
    .map((t) => ({ indice: t.indice, talla: t.talla.trim() }));

  // Una columna que el modelo no mencionó no se pierde: entra como "ignorar"
  // con confianza baja, visible en pantalla. Desaparecer en silencio es cómo se
  // pierde la columna de precios sin que nadie lo note.
  //
  // Las columnas de talla se excluyen del relleno: en `matriz_de_tallas` el
  // modelo las declara en `columnasTalla` y NO en `columnas`, que es lo
  // correcto. Sin esta salvedad se listaban como "ignorar — el modelo no dijo
  // qué es" justo debajo de las tallas que sí estaba usando: la pantalla decía
  // lo contrario de lo que el importador hacía.
  const esTalla = new Set(columnasTalla.map((t) => t.indice));
  for (let i = 0; i < ancho; i++) {
    if (!vistos.has(i) && !esTalla.has(i)) {
      columnas.push({ indice: i, campo: "ignorar", confianza: "baja", porque: "El modelo no dijo qué es." });
    }
  }
  columnas.sort((a, b) => a.indice - b.indice);

  // Una matriz de tallas SIN columnas de talla no es una matriz: es un plan
  // con el que `aplicarMapeo` no produce ninguna variante, y `camposFaltantes`
  // no lo ve porque en matriz la talla no se exige como columna. Pasaba cuando
  // el modelo declaraba matriz pero devolvía columnasTalla vacío, o cuando
  // todas las que señaló estaban fuera del ancho. Se degrada a fila por
  // variante y se dice: la persona ve "falta la talla" en vez de "0 prendas".
  let disposicion = salida.disposicion as Disposicion;
  let notas = salida.notas;
  if (disposicion === "matriz_de_tallas" && columnasTalla.length === 0) {
    disposicion = "fila_por_variante";
    notas = `${notas ? `${notas} ` : ""}Parecía una matriz de tallas pero no se encontró ninguna columna de talla: se trata como una fila por variante.`;
  }

  return {
    plan: { disposicion, columnas, columnasTalla, notas },
    uso,
  };
}
