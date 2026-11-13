// OpenAI en el laboratorio de fotos (2026-11-13): la versión «de catálogo» de una prenda, redibujada por el modelo de imágenes de OpenAI (la
// familia de lo que hace ChatGPT, que a Felipe le gustó). Lógica pura: la usa `app/api/fotos/laboratorio/route.ts` y se prueba sin red.
// Por qué este modelo y qué se sabe de su precio: `docs/investigacion/2026-11-13-fotos-de-prenda-con-ia-opciones.md`.

export const OPENAI_URL_EDITAR = "https://api.openai.com/v1/images/edits";
/** Una edición de calidad media tarda de 20 a 60 s; a los 120 s se da por caída (principio 9: la pantalla no se cuelga). */
export const OPENAI_TOPE_MS = 120_000;

/**
 * `gpt-image-2.6-sunburst`: el de OpenAI «para cuando importa la precisión de la edición» (2026-11-04). Los modelos de imagen se retiran
 * rápido (`gpt-image-1` ya se apagó; `gpt-image-1.5` se apaga el 2026-12-01), así que se puede cambiar sin tocar código con
 * `OPENAI_IMAGEN_MODELO` en `.env.local`.
 */
export const MODELO_OPENAI_POR_DEFECTO = "gpt-image-2.6-sunburst";

/**
 * Lo que se le pide: la prenda PUESTA en un maniquí invisible (ghost mannequin), con volumen, como la mostraría un catálogo; Felipe lo pidió el
 * 2026-11-13 al ver la primera versión, que la dejaba plana. Las reglas de fidelidad salen del prompt de «edición mínima» que el equipo probó en
 * ChatGPT (`docs/investigacion/2026-10-21-prompt-edicion-minima-fotos.md`): conservar tela, color, estampado, costuras y etiquetas cosidas. Sigue
 * siendo SOLO la prenda y transparente (nada de persona ni maniquí a la vista): es lo que necesita el armador de looks (ADR-0442).
 * Medido con un top gris y una blusa verde limón: color «igual a la prenda» en las dos, 0,051 USD por foto, ~25 s.
 */
export const PROMPT_CATALOGO = [
  "Esta es la foto real de UNA prenda de mi tienda de ropa, colgada en un gancho dentro del almacén.",
  "Conviértela en una foto de catálogo con efecto MANIQUÍ INVISIBLE (ghost mannequin): la prenda puesta, con volumen 3D, los hombros, el pecho",
  "y la cintura rellenos como si la llevara una persona de talla estándar, cayendo de forma natural, de frente, derecha y centrada, con un margen",
  "pequeño alrededor. Se ve el interior del cuello por detrás. No se ve ningún maniquí, persona, piel, gancho ni perchero.",
  "Conserva exactamente la tela, el color y el tono, el estampado o las rayas (mismo tamaño, grosor y posición), las costuras, los botones,",
  "el cuello, las etiquetas cosidas y el largo. No cambies el color.",
  "Fondo transparente, sin sombra.",
].join(" ");

/**
 * Lo que se le pide para el segundo color en adelante: la prenda es la MISMA en todos los colores (Felipe 2026-11-13: «la estructura tiene que
 * ser la misma, solo cambia el color o el patrón»). Va con dos imágenes: la foto cruda del color nuevo y, como MOLDE, la foto de catálogo ya hecha
 * de otro color. Medido el 2026-11-13 (silueta del canal alfa contra el molde): la blusa pasó de 93,8 % a 99,3 % igual y el top de 92,5 % a
 * 98,8 %; sin molde, además, cambió la etiqueta del cuello («L» → «M»). Cuesta ~0,061 USD en vez de ~0,051 (la segunda imagen de entrada).
 */
export const PROMPT_CON_MOLDE = [
  "Te doy dos imágenes. IMAGEN 1: la foto real de una prenda de mi tienda en un NUEVO COLOR, colgada en el almacén.",
  "IMAGEN 2: la foto de catálogo ya hecha de la MISMA prenda en otro color: es el MOLDE. Crea la foto de catálogo del nuevo color.",
  "Del MOLDE copia EXACTAMENTE la estructura: la silueta, el largo, las mangas, el cuello, el elástico, los pliegues, la pose, el tamaño",
  "y la posición en el cuadro, como si fuera la misma prenda puesta en el mismo maniquí invisible.",
  "De la IMAGEN 1 toma SOLO el color, el tono y el estampado o las rayas, tal como se ven en la foto real. No cambies nada más.",
  "No se ve ningún maniquí, persona, piel, gancho ni perchero. Fondo transparente, sin sombra.",
].join(" ");

/**
 * Los campos del formulario que va a OpenAI, sin la imagen. 1024×1280 es 4:5, la proporción de las fichas (ADR-0228); los modelos 2.x
 * aceptan tamaños a medida (múltiplos de 16). Transparente y en PNG: es lo que necesita el armador de looks (ADR-0442).
 */
export function camposOpenAI(modelo: string, { conMolde = false, prompt }: { conMolde?: boolean; prompt?: string } = {}): Record<string, string> {
  return {
    model: modelo,
    prompt: prompt ?? (conMolde ? PROMPT_CON_MOLDE : PROMPT_CATALOGO),
    size: "1024x1280",
    quality: "medium",
    background: "transparent",
    output_format: "png",
    n: "1",
  };
}

/** Una foto que va a la IA, en el orden en que se envían. El frente siempre va primero. */
export type AnguloDeFoto = "frente" | "espalda" | "detalle" | "molde";

const QUE_ES: Record<AnguloDeFoto, string> = {
  frente: "la foto real de la prenda de frente, colgada en un gancho dentro del almacén",
  espalda: "la misma prenda de espalda, para el escote y la caída de atrás",
  detalle: "un detalle de cerca de la tela, con el color, el tono y el estampado reales",
  molde: "el MOLDE: la foto de catálogo ya hecha de la MISMA prenda en otro color",
};

/**
 * El pedido a la IA para la foto de catálogo de UN color (Editar y Nuevo producto, «Catálogo con IA»): qué fotos van, en qué orden, y qué se le
 * dice. Con solo el frente es exactamente `PROMPT_CATALOGO`, y con frente y molde, `PROMPT_CON_MOLDE` (los dos medidos el 2026-11-13). La espalda y
 * el detalle le muestran lo que el gancho tapa: así inventa menos (Felipe: «más ángulos, más parecida a la real»).
 */
export function pedidoDeCatalogo(extras: { espalda?: boolean; detalle?: boolean; molde?: boolean }): { orden: AnguloDeFoto[]; prompt: string } {
  const orden: AnguloDeFoto[] = ["frente"];
  if (extras.espalda) orden.push("espalda");
  if (extras.detalle) orden.push("detalle");
  if (extras.molde) orden.push("molde");
  if (orden.length === 1) return { orden, prompt: PROMPT_CATALOGO };
  if (orden.length === 2 && extras.molde) return { orden, prompt: PROMPT_CON_MOLDE };

  const lista = orden.map((a, i) => `IMAGEN ${i + 1}: ${QUE_ES[a]}.`).join(" ");
  const reales = orden.filter((a) => a !== "molde").map((a) => `IMAGEN ${orden.indexOf(a) + 1}`);
  const deReales = reales.length === 1 ? reales[0] : `${reales.slice(0, -1).join(", ")} y ${reales[reales.length - 1]}`;
  const estructura = extras.molde
    ? `Del MOLDE (IMAGEN ${orden.indexOf("molde") + 1}) copia EXACTAMENTE la estructura: la silueta, el largo, las mangas, el cuello, el elástico, los pliegues, la pose, el tamaño y la posición en el cuadro, como si fuera la misma prenda puesta en el mismo maniquí invisible. De ${deReales} toma SOLO el color, el tono y el estampado o las rayas, tal como se ven en las fotos reales.`
    : `Conviértela en una foto de catálogo con efecto MANIQUÍ INVISIBLE (ghost mannequin): la prenda puesta, con volumen 3D, los hombros, el pecho y la cintura rellenos como si la llevara una persona de talla estándar, cayendo de forma natural, de frente, derecha y centrada, con un margen pequeño alrededor. Se ve el interior del cuello por detrás. Usa ${deReales} para conservar exactamente la tela, el color y el tono, el estampado o las rayas (mismo tamaño, grosor y posición), las costuras, los botones, el cuello, las etiquetas cosidas y el largo.`;
  return {
    orden,
    prompt: [
      "Te doy varias fotos de UNA prenda de mi tienda de ropa.",
      lista,
      "Crea UNA foto de catálogo de la prenda, vista de frente.",
      estructura,
      "No cambies el color. No se ve ningún maniquí, persona, piel, gancho ni perchero. Fondo transparente, sin sombra.",
    ].join(" "),
  };
}

/**
 * El error de la IA dicho para la tienda (Editar y Nuevo producto): sin llaves, saldos ni modelos, que son cosa del líder. La foto real queda igual.
 * El detalle técnico va al registro del servidor (`capturarError`), no a la pantalla.
 */
export function mensajeParaTienda(estado: number, cuerpo: unknown): string {
  const codigo = cuerpo && typeof cuerpo === "object" ? (((cuerpo as { error?: { code?: unknown } }).error?.code as string) ?? "") : "";
  if (estado === 429 && codigo !== "insufficient_quota") return "Muchas fotos seguidas. Prueba en un minuto.";
  if (estado === 400) return "La IA no aceptó esta foto. Prueba con otra.";
  if (estado >= 500 || estado === 504) return "La IA no responde ahora. Prueba en un rato.";
  return "La foto de catálogo no está disponible ahora. Avísale a tu líder.";
}

/** La imagen (base64) de la respuesta de OpenAI, o `null` si no vino. */
export function imagenDeRespuesta(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const datos = (cuerpo as { data?: unknown }).data;
  if (!Array.isArray(datos) || !datos.length) return null;
  const b64 = (datos[0] as { b64_json?: unknown })?.b64_json;
  return typeof b64 === "string" && b64.length > 0 ? b64 : null;
}

/** Tarifas por millón de tokens de los modelos 2.5 y 2.6 (precios oficiales al 2026-11-13). */
const TARIFA_USD_POR_MILLON = { imagenEntrada: 8, textoEntrada: 5, imagenSalida: 30 } as const;

/**
 * Cuánto costó UNA edición, a partir del `usage` que devuelve OpenAI. OpenAI no publica precio por foto para estos modelos: este número
 * es la forma de saberlo con fotos reales. `null` si no vino el detalle.
 */
export function costoDeUso(cuerpo: unknown): number | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const uso = (cuerpo as { usage?: Record<string, unknown> }).usage;
  if (!uso || typeof uso !== "object") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const salida = num(uso.output_tokens);
  const entrada = num(uso.input_tokens);
  if (salida === null || entrada === null) return null;
  const detalle = (uso.input_tokens_details ?? {}) as Record<string, unknown>;
  const imagen = num(detalle.image_tokens) ?? entrada;
  const texto = num(detalle.text_tokens) ?? Math.max(0, entrada - imagen);
  const t = TARIFA_USD_POR_MILLON;
  return (imagen * t.imagenEntrada + texto * t.textoEntrada + salida * t.imagenSalida) / 1_000_000;
}

/** El error de OpenAI en lenguaje de tienda. `cuerpo` es su JSON (`{ error: { message, code, type } }`), si lo hubo. */
export function mensajeDeErrorOpenAI(estado: number, cuerpo: unknown): string {
  const error = cuerpo && typeof cuerpo === "object" ? ((cuerpo as { error?: Record<string, unknown> }).error ?? {}) : {};
  const mensaje = typeof error.message === "string" ? error.message.trim() : "";
  const codigo = typeof error.code === "string" ? error.code : "";
  if (estado === 401) return "OpenAI no reconoce la llave. Revisa OPENAI_API_KEY en apps/web/.env.local.";
  if (estado === 403 && /verif/i.test(mensaje))
    return "OpenAI pide verificar tu organización antes de usar los modelos de imagen (platform.openai.com › Settings › Organization).";
  if (estado === 429 && codigo === "insufficient_quota") return "La cuenta de OpenAI no tiene saldo. Carga crédito en platform.openai.com › Billing.";
  if (estado === 429) return "OpenAI pide esperar: se mandaron demasiadas fotos seguidas. Prueba en un minuto.";
  if (estado === 404 || codigo === "model_not_found") return `OpenAI no encuentra el modelo. ${mensaje}`.trim();
  if (estado === 400) return mensaje ? `OpenAI no aceptó el pedido: ${mensaje}` : "OpenAI no aceptó el pedido.";
  if (estado >= 500) return "OpenAI no está respondiendo ahora. Prueba de nuevo en un rato.";
  return mensaje ? `OpenAI respondió ${estado}: ${mensaje}` : `OpenAI respondió ${estado}.`;
}
