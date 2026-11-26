// La medida de un recorte que dice la IA (ADR-0705). Lógica pura: qué se le pregunta, con qué forma responde y cómo se valida lo que
// responde antes de guardarlo (`retail.anotar_medida_ia`). La llamada vive en `app/api/fotos/medir-recortes/route.ts`.
//
// Por qué: el probador de la tienda dimensionaba cada blusa por el ancho de su BORDE DE ABAJO; una blusa con nudo («Camisa Dalia», CMS-0092)
// tiene ese borde angosto y salía agrandada 35 %. La IA dice qué prenda es y a qué altura están sus axilas; el ancho exacto en esa fila lo
// miden los píxeles en la tienda (`apps/tienda/lib/union-prendas.ts`, `cajaPorElPecho`). Probado con 26 recortes reales el 2026-11-26: el tipo
// salió bien en los 26 y costó US$0,0008 por foto.

export const MODELO_MEDIDA_IA_POR_DEFECTO = "gpt-5-mini";
/** Cuánto se espera a la IA por foto. La ruta mide varias por corrida; una que no responde no frena a las demás. */
export const TOPE_MEDIDA_IA_MS = 45_000;
/** Cuántos recortes se miden en cada corrida programada (cada 10 min): ~6 s cada uno, de a 3 a la vez, entra holgado en un minuto. */
export const RECORTES_POR_CORRIDA = 12;

export const TIPOS = ["con_mangas", "tirantes", "halter", "strapless", "body", "vestido", "vestido_strapless", "chaleco", "casaca", "pantalon", "falda", "short", "cartera", "otro"] as const;
export const ZONAS_IA = ["arriba", "abajo", "vestido", "encima", "bolso"] as const;
export const HOLGURAS = ["ajustada", "normal", "holgada"] as const;
export type TipoDePrenda = (typeof TIPOS)[number];

/** Lo que se guarda (sin el archivo del recorte ni la fecha, que agrega la base). */
export type MedidaIA = {
  tipo: TipoDePrenda;
  zona: (typeof ZONAS_IA)[number];
  holgura: (typeof HOLGURAS)[number];
  metida: boolean;
  /** A qué altura están las axilas, en fracción del alto del recorte (0 arriba). null en lo que no es de arriba. */
  axila: number | null;
  modelo: string;
};

export const PREGUNTA = `Es la foto de UNA prenda o accesorio de mujer, sin fondo, para un probador virtual que la pone sobre un maniquí.
Devuelve:
- tipo y zona (arriba: blusa/polo/top/body/corset; encima: chaleco/casaca/blazer; abajo: pantalón/falda/short; vestido; bolso).
- holgura: cómo le queda al cuerpo (ajustada, normal u holgada/oversize).
- se_lleva_metida: true si va dentro del pantalón (body).
- axila_y: fracción de 0 a 1 del ALTO de la imagen (0 = borde de arriba) donde los costados del torso quedan justo debajo de los brazos. En un strapless o corset, su borde de arriba en los costados; en un halter o un top de tiras, donde empieza la tela del pecho a los costados. null si es de abajo o un bolso.
- confianza de 0 a 1.`;

/** El esquema de la respuesta (salida estructurada estricta de OpenAI). */
export const ESQUEMA_RESPUESTA = {
  type: "object",
  additionalProperties: false,
  required: ["tipo", "zona", "holgura", "se_lleva_metida", "axila_y", "confianza"],
  properties: {
    tipo: { type: "string", enum: [...TIPOS] },
    zona: { type: "string", enum: [...ZONAS_IA] },
    holgura: { type: "string", enum: [...HOLGURAS] },
    se_lleva_metida: { type: "boolean" },
    axila_y: { type: ["number", "null"] },
    confianza: { type: "number" },
  },
} as const;

/** El cuerpo del pedido a `POST /v1/responses`: la foto por su URL pública, en baja resolución (basta para ubicar la axila y cuesta menos). */
export function pedidoDeMedida(urlDelRecorte: string, modelo: string) {
  return {
    model: modelo,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: PREGUNTA }, { type: "input_image", image_url: urlDelRecorte, detail: "low" }] }],
    text: { format: { type: "json_schema", name: "medida_de_prenda", strict: true, schema: ESQUEMA_RESPUESTA } },
  };
}

/** El texto JSON que vino en la respuesta de `/v1/responses`, o null. */
export function textoDeRespuesta(respuesta: unknown): string | null {
  const salida = (respuesta as { output?: unknown })?.output;
  if (!Array.isArray(salida)) return null;
  for (const o of salida) {
    const contenido = (o as { content?: unknown })?.content;
    if (!Array.isArray(contenido)) continue;
    for (const c of contenido) {
      if ((c as { type?: unknown }).type === "output_text" && typeof (c as { text?: unknown }).text === "string") return (c as { text: string }).text;
    }
  }
  return null;
}

/** Lo que dijo la IA, validado: la misma forma que exige `anotar_medida_ia`. null si algo no calza (se anota como fallo). */
export function medidaDeRespuesta(respuesta: unknown, modelo: string): MedidaIA | null {
  const texto = textoDeRespuesta(respuesta);
  if (!texto) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return null; // relleno-a-proposito: un JSON roto se anota como fallo y la prenda se dibuja como siempre
  }
  if (!TIPOS.includes(d.tipo as TipoDePrenda)) return null;
  if (!ZONAS_IA.includes(d.zona as MedidaIA["zona"])) return null;
  if (!HOLGURAS.includes(d.holgura as MedidaIA["holgura"])) return null;
  if (typeof d.se_lleva_metida !== "boolean") return null;
  const axila = d.axila_y;
  const deArriba = d.zona === "arriba" || d.zona === "vestido" || d.zona === "encima";
  // Una axila fuera del alto (o en el último 20 %: no hay torso debajo) no se cree; en una prenda de arriba, sin axila no hay medida.
  const axilaValida = typeof axila === "number" && Number.isFinite(axila) && axila >= 0 && axila <= 0.8 ? Math.round(axila * 1000) / 1000 : null;
  if (deArriba && axilaValida === null) return null;
  return {
    tipo: d.tipo as TipoDePrenda,
    zona: d.zona as MedidaIA["zona"],
    holgura: d.holgura as MedidaIA["holgura"],
    metida: d.se_lleva_metida,
    axila: deArriba ? axilaValida : null,
    modelo,
  };
}

/** La URL pública de un recorte del almacén (el bucket de las fotos de producto). */
export function urlPublicaDelRecorte(supabaseUrl: string, recorte: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/retail-productos-fotos/${recorte.split("/").map(encodeURIComponent).join("/")}`;
}
