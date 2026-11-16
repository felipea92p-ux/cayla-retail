// «¿Esta foto se puede usar?», decidido UNA vez y en un solo lugar para toda foto de prenda que se elige o se suelta (2026-11-16).
//
// EL PROBLEMA. Al crear el «Chaleco Dad», dos fotos soltadas en «Fotos y colores» quedaron como tarjetas con la vista rota y, debajo, en
// inglés: «An error occured reading the Blob argument to createImageBitmap». Lo único que se revisaba era lo que el archivo DICE ser (su tipo
// declarado) y su peso; nunca se abría. Un archivo que el navegador no puede leer (arrastrado desde la app Fotos, WhatsApp de escritorio,
// la miniatura de una captura que todavía no se guarda, una foto de iCloud sin descargar) pasaba igual, y el error salía recién al leerle
// los colores, tal cual lo escribió el navegador.
//
// CONTRATO
//   PROMETE: para cada falla posible, UN texto en palabras de tienda (`textoDeFalla`) y si se le avisa a Sentry (`seAvisa`); qué imagen es
//            un archivo por sus primeros bytes (`formatoPorFirma`) y qué hacer con lo que declara (`queDeclara`). Pura: sin navegador.
//   ASUME:   la lectura y la prueba de abrir la hace `foto-elegida-cliente.ts`, en el navegador.
//   NO HACE: no sube nada (`producto-fotos.ts`), y no lee ni abre la foto (`foto-elegida-cliente.ts`).

/** Lo más que pesa una foto de prenda que se guarda: el tope del almacén `retail-productos-fotos`. */
export const PRODUCTO_FOTOS_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Lo más que se LEE de un archivo que se va a convertir o que llegó sin tipo, antes de saber si sirve: una HEIC de 48 MP pesa ~15 MB. Más que
 * esto no es una foto de prenda, y leerlo entero en un celular solo gasta memoria.
 */
export const MAX_BYTES_A_LEER = 40 * 1024 * 1024;

/**
 * El lado más largo de una foto HEIC/AVIF pasada a JPG. Un iPhone 15/16 saca 24 MP (5712×4284): entera, en JPG pasa de 5 MB y además supera
 * el lienzo que Safari deja dibujar en un iPhone (~16,7 MP). 4000 px son 12 MP: sobra para una ficha (se ve a 1024 px) y para la IA (1600).
 */
export const LADO_MAXIMO_CONVERTIDA = 4000;

/** Por qué una foto no se puede usar. */
export type FallaDeFoto = "tipo" | "vacia" | "pesada" | "no-se-lee" | "no-es-imagen" | "no-se-abre" | "otro-formato" | "no-cabe";

/** Lo que el archivo ES, por sus bytes. Las tres primeras se guardan tal cual; HEIC (iPhone) y AVIF se pasan a JPG si el navegador las abre. */
export type FormatoDeFoto = "jpeg" | "png" | "webp" | "heic" | "avif";

const TIPOS_QUE_SE_GUARDAN = new Set(["image/jpeg", "image/png", "image/webp"]);
const TIPOS_QUE_SE_CONVIERTEN = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence", "image/avif"]);

/**
 * Qué hacer con el tipo que el archivo DICE ser, antes de leerlo: `guardable` y `convertible` se leen; `sin-tipo` también (algunas apps
 * entregan la foto sin tipo al arrastrarla, y lo que manda son sus bytes); `otro` (un PDF, un GIF, un video) no se lee.
 */
export function queDeclara(tipo: string, nombre: string): "guardable" | "convertible" | "sin-tipo" | "otro" {
  const t = tipo.trim().toLowerCase();
  if (TIPOS_QUE_SE_GUARDAN.has(t)) return "guardable";
  if (TIPOS_QUE_SE_CONVIERTEN.has(t)) return "convertible";
  if (t === "" || t === "application/octet-stream") {
    // Sin tipo, el nombre solo sirve para no leer de gusto lo que claramente no es una foto (un .pdf, un .mov).
    return /\.(pdf|mov|mp4|gif|txt|docx?|xlsx?|zip)$/i.test(nombre) ? "otro" : "sin-tipo";
  }
  return "otro";
}

/** Las marcas (brand) de un archivo ISO-BMFF que son fotos HEIC/HEIF. */
const MARCAS_HEIC = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/**
 * Qué imagen es un archivo por sus primeros 16 bytes, o `null` si no es ninguna de las que se aceptan. No se confía en el nombre ni en el tipo
 * declarado: una foto HEIC renombrada a «.jpg» declara JPEG y no lo es.
 */
export function formatoPorFirma(b: Uint8Array): FormatoDeFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "png";
  const ascii = (desde: number, hasta: number) => (b.length >= hasta ? String.fromCharCode(...b.slice(desde, hasta)) : "");
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp") {
    const marca = ascii(8, 12).toLowerCase();
    if (MARCAS_HEIC.has(marca)) return "heic";
    if (marca === "avif" || marca === "avis") return "avif";
  }
  return null;
}

/** Las fallas que nadie ve venir por el tipo declarado: van a Sentry para saber cuántas veces pasa (sin el nombre del archivo, ADR-0424). */
export function seAvisa(falla: FallaDeFoto): boolean {
  return falla === "no-se-lee" || falla === "no-es-imagen" || falla === "no-se-abre" || falla === "otro-formato" || falla === "no-cabe";
}

/** La falla dicha para la tienda: qué pasó y qué hacer, en una línea. Nunca el texto del navegador. */
export function textoDeFalla(falla: FallaDeFoto, pesoBytes = 0): string {
  switch (falla) {
    case "tipo":
      return "Solo se aceptan JPG, PNG o WebP.";
    case "vacia":
      return "El archivo está vacío.";
    case "pesada":
      return `Pesa ${(pesoBytes / (1024 * 1024)).toFixed(1)} MB; el máximo es ${PRODUCTO_FOTOS_MAX_BYTES / (1024 * 1024)} MB.`;
    case "no-se-lee":
      // Casi siempre es una foto de Google Drive o iCloud que se ve en el Finder pero no está descargada (0 bytes en el disco: medido con la
      // del Enterizo, 2026-11-16). El navegador no puede pedirle a la nube que la baje; abrirla una vez en el Mac sí la baja.
      return "Está en Google Drive o iCloud sin descargar. Ábrela una vez en tu Mac y súbela de nuevo.";
    case "no-es-imagen":
      return "No es una foto JPG, PNG ni WebP. Prueba con otra.";
    case "no-se-abre":
      return "La foto está dañada. Prueba con otra.";
    case "otro-formato":
      // El mismo consejo que ya dan las fotos de campañas, tiendas e insignias (`imagen-de-campana.ts`): una sola forma de decirlo.
      return "Este navegador no abre esta foto. Guárdala como JPG (en el iPhone: Ajustes ▸ Cámara ▸ Formatos ▸ Más compatible).";
    case "no-cabe":
      return "Es muy grande aun reducida. Prueba con otra.";
  }
}

/** El nombre con que queda una foto convertida a JPG: «IMG_0412.HEIC» → «IMG_0412.jpg». */
export function nombreComoJpg(nombre: string): string {
  const base = nombre.replace(/\.[^./\\]+$/, "");
  return `${base || "foto"}.jpg`;
}

/** Las fotos que no entraron, en UN aviso: el título dice cuántas y el detalle, cuál y por qué. `null` si entraron todas. */
export function avisoDeFotosMalas(malas: readonly { nombre: string; texto: string }[]): { titulo: string; detalle: string } | null {
  if (!malas.length) return null;
  return {
    titulo: malas.length === 1 ? "Una foto no se puede usar" : `${malas.length} fotos no se pueden usar`,
    detalle: malas.map((m) => `${m.nombre}: ${m.texto}`).join(" · "),
  };
}
