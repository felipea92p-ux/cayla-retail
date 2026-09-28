// La foto de muestra de un tejido o de un patrón (ADR-0256). Lógica pura: la importan la ruta `/api/productos/*`
// (servidor) y el modal de detalle (navegador).
//
// La columna `imagen_muestra_url` existe en producción desde el 2026-09-18 (20260918171000) y nadie la llenaba: la
// pantalla solo sabía dibujar la textura a partir del nombre. Ahora un Líder sube la foto real de la tela o del
// estampado y el dibujo queda de respaldo para lo que todavía no la tiene.
//
// Se guarda la URL pública completa (igual que `producto_fotos.url`), pero la ruta NO acepta cualquier URL: solo una del
// bucket público `retail-colores-muestras`, en la carpeta de su tipo. Sin ese candado, un PATCH a mano podría poner en el
// catálogo una imagen de cualquier sitio de internet, que después se pinta en la pantalla de todas las sedes.

export type TipoMuestra = "tejido" | "patron";

/** El bucket ya existe en producción (20260915230000, nació para las muestras de color): público, 5 MB, solo imágenes. */
export const MUESTRAS_BUCKET = "retail-colores-muestras";

/** Una carpeta por tipo, como dejó escrito el comentario de la columna (`tejidos/`, `patrones/`). */
export const CARPETA_MUESTRA: Record<TipoMuestra, string> = { tejido: "tejidos", patron: "patrones" };

/** Lo que llega al almacén: la foto ya reducida en el navegador. El bucket corta en 5 MB; aquí se exige lo mismo. */
export const MUESTRA_MAX_BYTES = 5 * 1024 * 1024;

/** Lo que se puede ELEGIR: la foto entera de un celular. Se reduce antes de subir (`muestra-atributo.ts`). */
export const MUESTRA_ELEGIDA_MAX_BYTES = 25 * 1024 * 1024;

/** El lado largo de la foto que se guarda: de sobra para verla en grande en el modal, y pesa ~300 KB en JPG. */
export const MUESTRA_LADO_MAX = 1600;

const TIPOS_ELEGIBLES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Por qué no se puede usar el archivo elegido (o `null` si se puede). El HEIC del iPhone pasa: si el navegador no lo
 *  sabe leer, lo dice `reducirMuestra` al intentarlo, con su propio mensaje. */
export function objecionMuestraElegida(f: { type: string; size: number }): string | null {
  if (!TIPOS_ELEGIBLES.includes(f.type)) return "Solo se aceptan fotos JPG, PNG, WebP o HEIC.";
  if (f.size <= 0) return "El archivo está vacío.";
  if (f.size > MUESTRA_ELEGIDA_MAX_BYTES) return `Pesa ${(f.size / (1024 * 1024)).toFixed(1)} MB; el máximo es 25 MB.`;
  return null;
}

/** El inicio de toda URL válida para ese tipo: `<supabase>/storage/v1/object/public/retail-colores-muestras/tejidos/`. */
export function prefijoMuestra(tipo: TipoMuestra, base: string): string {
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${MUESTRAS_BUCKET}/${CARPETA_MUESTRA[tipo]}/`;
}

/**
 * Lo que la ruta guarda en `imagen_muestra_url` a partir de lo que mandó la pantalla:
 * - `null` o `""` → `{ valor: null }`: se quita la foto y vuelve el dibujo.
 * - una URL del bucket, en la carpeta del tipo, con un nombre de archivo simple → `{ valor: url }`.
 * - cualquier otra cosa → `{ error }`. Sin `base` (entorno sin Supabase configurado) tampoco se acepta nada.
 */
export function leerUrlMuestra(
  valor: unknown,
  tipo: TipoMuestra,
  base: string | undefined,
): { valor: string | null } | { error: string } {
  if (valor === null || valor === "") return { valor: null };
  if (typeof valor !== "string") return { error: "La foto de muestra no es válida." };
  if (!base) return { error: "El almacén de fotos no está configurado en este entorno." };
  const prefijo = prefijoMuestra(tipo, base);
  if (!valor.startsWith(prefijo)) return { error: "La foto tiene que subirse desde esta pantalla." };
  // Un solo nombre de archivo, sin subcarpetas ni «..»: lo que produce `rutaMuestra`, y nada más.
  if (!/^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(valor.slice(prefijo.length))) return { error: "La foto tiene que subirse desde esta pantalla." };
  return { valor };
}

/** Dónde se guarda una foto nueva dentro del bucket. Un nombre nuevo cada vez: la URL cambia y ningún navegador muestra
 *  la foto vieja de su caché. */
export function rutaMuestra(tipo: TipoMuestra, id: string): string {
  return `${CARPETA_MUESTRA[tipo]}/${id}.jpg`;
}

/** Las medidas de la foto reducida: el lado largo a `ladoMax` como mucho, sin agrandar nunca una foto chica. */
export function medidasReducidas(ancho: number, alto: number, ladoMax = MUESTRA_LADO_MAX): { ancho: number; alto: number } {
  const escala = Math.min(1, ladoMax / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** «3 prendas» / «1 prenda» / «Ninguna prenda». */
export function textoPrendas(n: number): string {
  if (n === 0) return "Ninguna prenda";
  return `${n} ${n === 1 ? "prenda" : "prendas"}`;
}

export type PrendaDeMuestra = {
  id: string;
  referencia: string;
  codigo: string | null;
  categoria: string | null;
  activa: boolean;
  fotoUrl: string | null;
};

/** Las activas primero (son las que frenan «Desactivar»), y dentro de cada grupo por nombre. */
export function ordenarPrendas(prendas: PrendaDeMuestra[]): PrendaDeMuestra[] {
  return [...prendas].sort((a, b) => Number(b.activa) - Number(a.activa) || a.referencia.localeCompare(b.referencia, "es"));
}
