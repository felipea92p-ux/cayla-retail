/**
 * La foto OPCIONAL del daño de una prenda dañada (ADR-0564, actividad 7): reglas puras, sin React ni supabase.
 *
 * EL PROBLEMA. Para decidir si una prenda se arregla cerca, en el Taller o se liquida, unas pocas palabras no alcanzan: una foto de la mancha lo
 * dice mejor. Pero con la tienda abierta la foto es un extra, nunca un candado: se sube DESPUÉS de reportar, con la dañada ya guardada, y si
 * falla la prenda queda reportada igual (`20261029034000_danadas_foto_del_dano.sql` y `20261029045000_danadas_foto_bucket.sql`).
 *
 * CONTRATO.
 *   PROMETE: qué archivo se acepta (una imagen de hasta 10 MB; sin PDF: es la foto de una prenda), la ruta del archivo en el bucket (la carpeta
 *            es el id de la dañada, que la base exige), los argumentos de la RPC (sus nombres viven aquí y la prueba los fija contra la
 *            migración) y la lectura segura de las rutas que devuelve la base.
 *   ASUME:   el archivo ya es una foto del navegador (`File`); quien sube ve Existencias en la sede de la dañada (la base lo exige).
 *   NO HACE: no sube nada ni firma enlaces (eso es del navegador y del servidor); no comprime la foto.
 */

export const BUCKET_FOTOS_DANADAS = "retail-danadas";
export const RPC_REGISTRAR_FOTO_DANADA = "registrar_foto_danada";
/** @internal Lo lee solo su prueba, que lo cruza con la firma de la migración y con los argumentos que arma la pantalla. */
export const PARAMETROS_RPC_FOTO = ["p_danada_id", "p_ruta", "p_nombre", "p_tipo", "p_bytes"] as const;
export const RPC_FOTOS_DE_DANADAS = "fotos_de_danadas";

export const MAX_BYTES_FOTO_DANADA = 10 * 1024 * 1024;
export const MAX_FOTOS_POR_DANADA = 3;
export const TIPOS_FOTO_DANADA = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

/** Lo mínimo de un `File` que estas reglas necesitan (para poder probarlas sin navegador). */
export type ArchivoDeFoto = { name: string; type: string; size: number };

/** El tipo con que se sube: el que declara el navegador o, si viene vacío (HEIC en algunos aparatos), el de su extensión. */
export function tipoDeFotoDanada(f: ArchivoDeFoto): string | null {
  if ((TIPOS_FOTO_DANADA as readonly string[]).includes(f.type)) return f.type;
  if (f.type) return null;
  const ext = f.name.toLowerCase().split(".").pop();
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return null;
}

/** Qué tiene de malo el archivo antes de intentar subirlo, o null si va bien. */
export function objecionDeFoto(f: ArchivoDeFoto): string | null {
  if (!tipoDeFotoDanada(f)) return "Solo se aceptan fotos (JPG, PNG, WebP o HEIC).";
  if (f.size <= 0) return "La foto está vacía.";
  if (f.size > MAX_BYTES_FOTO_DANADA) return `La foto pesa ${(f.size / 1024 / 1024).toFixed(1)} MB; el máximo es 10 MB.`;
  return null;
}

/** La carpeta es el id de la dañada (la tabla lo exige) y un uuid delante del nombre; el nombre, en ASCII simple. */
export function rutaDeFotoDanada(danadaId: string, nombre: string, uuid: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
  return `${danadaId}/${uuid}-${limpio || "foto"}`;
}

export type ArgumentosDeFoto = { p_danada_id: string; p_ruta: string; p_nombre: string; p_tipo: string; p_bytes: number };

export function argumentosDeFoto(danadaId: string, ruta: string, f: ArchivoDeFoto): ArgumentosDeFoto {
  return { p_danada_id: danadaId, p_ruta: ruta, p_nombre: f.name.trim() || "foto", p_tipo: tipoDeFotoDanada(f) ?? f.type, p_bytes: f.size };
}

/** Las rutas por dañada que devuelve `fotos_de_danadas`; lo que no calza se ignora y nunca lanza. */
export function leerRutasDeFotos(data: unknown): Map<string, string[]> {
  const porDanada = new Map<string, string[]>();
  if (!Array.isArray(data)) return porDanada;
  for (const fila of data) {
    if (typeof fila !== "object" || fila === null) continue;
    const { danada_id, ruta } = fila as Record<string, unknown>;
    if (typeof danada_id !== "string" || typeof ruta !== "string" || !ruta) continue;
    porDanada.set(danada_id, [...(porDanada.get(danada_id) ?? []), ruta]);
  }
  return porDanada;
}

/** Lo que dice el aviso si la prenda quedó reportada pero la foto no se pudo subir: la prenda es lo importante. */
export function textoFotoNoSubio(motivo: string | null): string {
  return `La prenda quedó reportada, pero la foto no se pudo subir${motivo ? `: ${motivo}` : ""}. Puedes seguir sin ella.`;
}

export function textoVerFotos(n: number): string {
  return n === 1 ? "Ver la foto del daño" : `Ver las ${n} fotos del daño`;
}
