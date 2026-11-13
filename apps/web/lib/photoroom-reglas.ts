// Photoroom (laboratorio, 2026-11-13): qué se le pide y cómo se lee lo que contesta. Lógica pura: la usa la ruta
// `app/api/fotos/laboratorio/route.ts` y se prueba sin red (`photoroom-reglas.test.ts`).
//
// POR QUÉ UN LABORATORIO Y NO EL FLUJO DE FOTOS: desde el ADR-0442 (Felipe, 2026-10-17) la foto se sube TAL CUAL la entrega la
// IA del equipo, y la llave gratis de Photoroom es de «sandbox»: cada imagen sale con su marca de agua. Meterla en Nuevo producto
// mancharía el catálogo. Aquí se mira qué tal queda con fotos reales; si convence, se decide dónde entra (y con una llave de pago).
//
// Se usa la Image Editing API v2 (`/v2/edit`): la de sandbox cubre 1.000 imágenes al mes (100 por día) y trae lo que hace falta
// para comparar con lo que ya pide el ERP: el PNG transparente del armador de looks (ADR-0434/0442) y la prenda redibujada sobre un
// maniquí invisible, como la entrega hoy ChatGPT.

export const PHOTOROOM_URL_EDITAR = "https://image-api.photoroom.com/v2/edit";
/** Lo que tarda de más una foto grande en el sandbox es ~10 s; a los 45 s se da por caído (principio 9: la pantalla no se cuelga). */
export const PHOTOROOM_TOPE_MS = 45_000;
/** El mismo tope de una foto de producto (`PRODUCTO_FOTOS_MAX_BYTES`): lo que no se puede subir no vale la pena probarlo. */
export const PHOTOROOM_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Qué conservar: la prenda. Medido el 2026-11-13 con dos fotos del almacén colgadas en un perchero de madera (un top gris de cuello caído
 * y una blusa amarilla floreada), una sola palabra en inglés:
 * - sin texto: salió la prenda CON los ganchos y el palo del perchero (el top, con seis ganchos);
 * - «clothing»: las dos limpias, solo la prenda (lo que se ve del gancho por dentro del escote queda, porque está delante);
 * - «top»: casi igual, con pedazos sueltos de gancho; «garment»: un pedazo suelto de otra prenda;
 * - una frase («grey sleeveless top», «yellow floral blouse», «the clothing garment only») o una lista de lo que se quita
 *   (`segmentation.negativePrompt`): mucho peor, se quedó con un trozo de madera o no quitó nada.
 */
export const PROMPT_SOLO_PRENDA = "clothing";

/**
 * Lo que se le dice al maniquí. Medido el 2026-11-13 con las mismas dos fotos, varias veces:
 * - sin texto: una vez salió de frente y otra de tres cuartos (girada), con la misma foto;
 * - «front view»: cuatro de cuatro de frente;
 * - «Keep the exact original fabric color…»: el color salió PEOR (el gris, más beige).
 * El color no lo arregla ningún texto: con «front view», el mismo top salió gris una vez y beige la otra, y la blusa verde y amarilla.
 */
export const PROMPT_MANIQUI = "front view";

export type PerfilPhotoroom = "sin-fondo" | "maniqui";
export const PERFILES_PHOTOROOM: readonly PerfilPhotoroom[] = ["sin-fondo", "maniqui"];

/**
 * Los campos del formulario que va a Photoroom, sin la imagen.
 * - `sin-fondo`: la foto REAL recortada: PNG transparente, 4:5 en 1200×1500, la prenda con un margen de 3 % (el del prompt estándar,
 *   `docs/investigacion/2026-10-17-prompt-estandar-fotos-armador.md`). No inventa nada: es la referencia del color verdadero.
 * - `maniqui`: «Ghost mannequin» (Felipe lo eligió el 2026-11-13 mirando contra ChatGPT): Photoroom vuelve a DIBUJAR la prenda de
 *   frente, simétrica, sin gancho ni arrugas, como sobre un maniquí invisible, y la entrega transparente. No hay 4:5: lo más cercano es
 *   `PORTRAIT_HD_4_3` (3:4, 896×1200). Medido con dos prendas: cambia el color (el gris salió beige, el verde limón más amarillo); por
 *   eso el laboratorio lo compara contra `sin-fondo` (`veredictoDeColor`). Cuesta como una edición de pago (Plus, ~0,10 USD).
 */
export function camposDelPerfil(perfil: PerfilPhotoroom): Record<string, string> {
  if (perfil === "maniqui")
    return { "ghostMannequin.mode": "ai.auto", "ghostMannequin.size": "PORTRAIT_HD_4_3", "ghostMannequin.prompt": PROMPT_MANIQUI, "export.format": "png" };
  return {
    removeBackground: "true",
    outputSize: "1200x1500",
    padding: "0.03",
    "export.format": "png",
    // Sin esto, en una foto de tienda Photoroom toma «prenda + gancho + perchero» como un solo objeto. Es la segmentación guiada por
    // texto, que Photoroom ofrece «en vista previa» (puede cambiar con dos semanas de aviso). Ver `PROMPT_SOLO_PRENDA`.
    "segmentation.prompt": PROMPT_SOLO_PRENDA,
  };
}

export function esPerfilPhotoroom(v: unknown): v is PerfilPhotoroom {
  return typeof v === "string" && (PERFILES_PHOTOROOM as readonly string[]).includes(v);
}

/** Una llave de sandbox empieza con `sandbox_`: gratis, con marca de agua. */
export function esLlaveSandbox(llave: string): boolean {
  return llave.trim().startsWith("sandbox_");
}

/** El error de Photoroom en tres líneas de tienda. `cuerpo` es el JSON que devolvió (`{ error: { message | detail } }`), si lo hubo. */
export function mensajeDeErrorPhotoroom(estado: number, cuerpo: unknown): string {
  const detalle = detalleDelCuerpo(cuerpo);
  if (estado === 401 || estado === 403) return "Photoroom no reconoce la llave. Revisa PHOTOROOM_API_KEY en apps/web/.env.local.";
  if (estado === 402) return "Se acabaron las imágenes del mes en Photoroom (el sandbox da 1.000 al mes y 100 por día).";
  if (estado === 429) return "Photoroom pide esperar: se mandaron demasiadas fotos seguidas. Prueba en un minuto.";
  if (estado === 400) return detalle ? `Photoroom no aceptó la foto: ${detalle}` : "Photoroom no aceptó la foto.";
  if (estado >= 500) return "Photoroom no está respondiendo ahora. Prueba de nuevo en un rato.";
  return detalle ? `Photoroom respondió ${estado}: ${detalle}` : `Photoroom respondió ${estado}.`;
}

function detalleDelCuerpo(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const raiz = cuerpo as Record<string, unknown>;
  const error = raiz.error && typeof raiz.error === "object" ? (raiz.error as Record<string, unknown>) : raiz;
  for (const clave of ["message", "detail"] as const) {
    const v = error[clave];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** El color promedio de lo opaco de una imagen RGBA (la tela de un PNG sin fondo), o `null` si no hay nada opaco. */
export function colorPromedio(rgba: ArrayLike<number>): [number, number, number] | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 250) continue;
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    n++;
  }
  return n ? [r / n, g / n, b / n] : null;
}

/** sRGB (0–255) a CIELAB (D65), para medir la diferencia de color como la ve el ojo. */
function aLab([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const lineal = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lineal(r), lineal(g), lineal(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** ΔE (CIE76) entre dos colores: menos de 2 no se nota; desde ~10 se ve otro tono. */
export function diferenciaDeColor(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [l1, a1, b1] = aLab(a);
  const [l2, a2, b2] = aLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export type VeredictoColor = { tono: "verde" | "ambar" | "rojo"; texto: string };

/**
 * Lo que se dice del color del maniquí comparado con la prenda real. Es el promedio de toda la tela, sombras de los pliegues incluidas: sirve
 * para ver si el tono se fue, no para medir un detalle. Medido el 2026-11-13: el top gris dio ~15 y la blusa verde limón ~20 (los dos se ven
 * de otro tono a simple vista).
 */
export function veredictoDeColor(delta: number): VeredictoColor {
  if (delta < 6) return { tono: "verde", texto: "Color: igual a la prenda" };
  if (delta < 12) return { tono: "ambar", texto: "Color: cambió un poco" };
  return { tono: "rojo", texto: "Color: cambió, revisa el tono" };
}
