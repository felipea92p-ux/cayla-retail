import { luminancia, mezclar } from "@cayla-retail/portada";

// La foto del fondo de una campaña «Con foto» (ADR-0436, actividad 8). Lógica pura: qué foto se acepta, dónde se guarda, a qué tamaño
// y su TONO, que es lo que la revisión usa para saber si la letra se lee sobre ella (en el ERP y en la tienda) sin volver a abrir la foto.

/** El almacén público de las fotos de campañas (20261017231000): 5 MB, solo imágenes; sube quien tiene el módulo Campañas. */
export const FOTOS_CAMPANA_BUCKET = "retail-campanas-fotos";

/** El lado largo de la foto que se guarda: a todo el ancho de una computadora, y pesa ~400 KB en JPG. */
export const FOTO_FONDO_LADO_MAX = 2000;

/** Por debajo de este ancho, en una computadora la foto se ve borrosa. */
export const FOTO_FONDO_ANCHO_MINIMO = 1200;

/** Dónde se guarda una foto nueva: un nombre nuevo cada vez (ninguna se pisa; un diseño anterior puede seguir usando la vieja). */
export const rutaFotoDeFondo = (id: string) => `fondos/${id}.jpg`;

/**
 * El tono de la foto que cuenta para la letra: el promedio de su décima parte MÁS CLARA (no de toda la foto). Una foto oscura con un
 * cielo blanco detrás del nombre no pasa por oscura: si la letra se lee sobre lo más claro, se lee sobre toda la foto. Recibe los
 * píxeles RGBA (`ImageData.data`) de la foto en chico; los transparentes no cuentan.
 */
export function tonoClaro(rgba: ArrayLike<number>): string {
  const pixeles: { lum: number; hex: string }[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const hex = `#${[rgba[i]!, rgba[i + 1]!, rgba[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    pixeles.push({ lum: luminancia(hex), hex });
  }
  if (pixeles.length === 0) return "#ffffff"; // tema-fijo: sin píxeles que medir, lo más exigente (blanco), nunca un «se lee» falso
  pixeles.sort((a, b) => b.lum - a.lum);
  const claros = pixeles.slice(0, Math.max(1, Math.ceil(pixeles.length / 10)));
  // El promedio, mezclando de a uno (cada nuevo pesa 1/n): queda en hex sin redondeos acumulados de más.
  return claros.reduce((acc, p, i) => (i === 0 ? p.hex : mezclar(acc, p.hex, 1 / (i + 1))), claros[0]!.hex);
}

/** Lo que conviene saber de la foto elegida, sin impedir usarla: si es chica (se ve borrosa) o vertical (se recorta mucho). */
export function avisosDeLaFoto(ancho: number, alto: number): string[] {
  const avisos: string[] = [];
  if (ancho < FOTO_FONDO_ANCHO_MINIMO) avisos.push(`La foto es chica (${ancho} px de ancho): en una computadora se verá borrosa.`);
  if (alto > ancho) avisos.push("La foto es vertical: en la computadora se recorta arriba y abajo. Una horizontal luce más.");
  return avisos;
}
