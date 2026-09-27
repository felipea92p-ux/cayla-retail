// La foto de perfil de una persona vive en Dynamic (`public.personas.foto_url`, bucket público `fotos-perfil`) y retail
// solo la lee (20260925210000_fotos_de_perfil_desde_dynamic.sql). Lógica pura: la importan el servidor y el navegador.

export const BUCKET_FOTOS_PERFIL = "fotos-perfil";

/**
 * La URL pública de una foto de perfil a partir de lo que guarda Dynamic: la RUTA dentro del bucket
 * (`perfil/<persona>/<hora>.jpg`), nunca una URL. Ponerla tal cual en una imagen la busca en el dominio de retail y sale
 * rota. Si algún día llega una URL completa, se respeta. Sin base de Supabase conocida, `null`: se pintan las iniciales.
 */
export function urlFotoPerfil(ruta: string | null | undefined, base: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  const limpia = ruta?.trim();
  if (!limpia) return null;
  if (/^https?:\/\//i.test(limpia)) return limpia;
  if (!base) return null;
  const segmentos = limpia.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET_FOTOS_PERFIL}/${segmentos}`;
}

/** «Felipe Alvarez» → «FA»; «Felipe A.» (nombre corto del turno) → «FA». Vacío → «·», para que el círculo nunca quede mudo. */
export function iniciales(nombre: string): string {
  const partes = nombre.replace(/\./g, "").trim().split(/\s+/).filter(Boolean);
  return partes.slice(0, 2).map((p) => p.charAt(0)).join("").toUpperCase() || "·";
}
