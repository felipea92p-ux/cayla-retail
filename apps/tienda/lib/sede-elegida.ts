// La tienda que el cliente eligió en «Ver lo que hay en» (ADR-0408, actividad 3; maqueta v4, `filtroTienda`). Decide el precio que
// ve: el de esa tienda, o con «Todas» el mayor entre las tiendas de la web (Felipe, 2026-10-14). Va en la dirección como
// `?sede=trujillo`: el nombre web en minúsculas, sin tildes ni espacios, para que se lea y se pueda compartir. Sin ella, o si no es una
// tienda que se ve en la web, es «Todas». Lógica pura, con su prueba al lado.

type ConNombre = { nombre: string };

/** «Trujillo» → «trujillo», «San Isidro» → «san-isidro», «Ñaña» → «nana». */
export function claveDeSede(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Las tiendas en orden alfabético, como las píldoras de la maqueta: Todas · Arequipa · Lima · Trujillo. */
export const sedesEnOrden = <T extends ConNombre>(sedes: readonly T[]): T[] => [...sedes].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

/** La tienda de la dirección, si es una de las que se ven en la web; si no, `null` («Todas»). */
export function sedeDeLaUrl<T extends ConNombre>(valor: string | string[] | undefined, sedes: readonly T[]): T | null {
  const escrita = (Array.isArray(valor) ? valor[0] : valor)?.trim();
  if (!escrita) return null;
  const clave = claveDeSede(escrita);
  return clave ? sedes.find((s) => claveDeSede(s.nombre) === clave) ?? null : null;
}
