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
 * Qué pone el maniquí y qué pone la prenda (Felipe 2026-11-14, «Nueva A», elegida mirando la lámina de 5 prendas): el maniquí pone la FORMA
 * (de frente, hombros llenos, volumen), la prenda pone sus MEDIDAS (largo, corte, mangas, bordes y dibujo). Nació de dos errores medidos:
 * - el pedido anterior rellenaba la prenda «como si la llevara una persona de talla estándar» y la estiraba: la blusa verde, +8 %;
 * - pedir «igual a la foto» copiaba la forma del gancho: hombros caídos, plana, sin arreglar.
 * Con esto la blusa queda puesta y con su largo (0 a −3 % de alto/ancho contra la foto, dos corridas), la manga murciélago ancha y el elástico
 * fino. Un pantalón o un short sale más angosto que su foto en plano: puesto, la cintura se cierra (es física, no la IA). El estampado igual se
 * redibuja con las mismas figuras, no en el mismo lugar exacto: para eso está «Usar mi foto». Tabla completa: ADR-0659, act. 2026-11-14.
 */
const MANIQUI_PONE_LA_FORMA =
  "Lo que pone el MANIQUÍ: la postura de frente, los hombros a su altura, el pecho y la cintura con volumen, como la llevaría una persona.";
const PRENDA_PONE_SUS_MEDIDAS = [
  "Lo que pone la PRENDA, y no se cambia:",
  "LARGO: el mismo largo respecto del ancho que tiene la prenda (de los hombros al ruedo, o de la cintura a la basta); no la alargues.",
  "CORTE: si es suelta, queda suelta; si es ceñida, ceñida; no le agregues entalle.",
  "MANGAS: el mismo largo, ancho y caída; si salen del cuerpo sin costura (murciélago), siguen unidas al cuerpo.",
  "BORDES: el cuello, los puños, el elástico, la pretina o el ruedo con el mismo ancho y el mismo fruncido.",
  "ESTAMPADO: las mismas figuras, del mismo tamaño y en el mismo lugar; no dibujes uno nuevo.",
].join(" ");

/**
 * Lo que se le pide: la prenda PUESTA en un maniquí invisible (ghost mannequin), como la mostraría un catálogo, y que sea la MISMA prenda
 * (arriba). Las reglas de tela, color y etiquetas salen del prompt de «edición mínima» que el equipo probó en ChatGPT
 * (`docs/investigacion/2026-10-21-prompt-edicion-minima-fotos.md`). Sigue siendo SOLO la prenda y transparente (nada de persona ni maniquí a la
 * vista): es lo que necesita el armador de looks (ADR-0442). ~0,05 USD por foto y ~25 s.
 */
export const PROMPT_CATALOGO = [
  "Esta es la foto real de UNA prenda de mi tienda de ropa, colgada en un gancho dentro del almacén.",
  "Conviértela en una foto de catálogo profesional con efecto MANIQUÍ INVISIBLE (ghost mannequin): la prenda PUESTA, con volumen 3D, de frente,",
  "derecha y centrada, con un margen pequeño alrededor. Se ve el interior del cuello por detrás.",
  MANIQUI_PONE_LA_FORMA,
  PRENDA_PONE_SUS_MEDIDAS,
  "Conserva la tela, el color y el tono, las costuras, los botones y las etiquetas cosidas. No cambies el color.",
  "No se ve ningún maniquí, persona, piel, gancho ni perchero. Fondo transparente, sin sombra.",
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
    : `Conviértela en una foto de catálogo profesional con efecto MANIQUÍ INVISIBLE (ghost mannequin): la prenda PUESTA, con volumen 3D, de frente, derecha y centrada, con un margen pequeño alrededor. Se ve el interior del cuello por detrás. ${MANIQUI_PONE_LA_FORMA} ${PRENDA_PONE_SUS_MEDIDAS} Usa ${deReales} para conservar la tela, el color y el tono, las costuras, los botones y las etiquetas cosidas.`;
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
