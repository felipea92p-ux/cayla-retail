// La tienda que el cliente eligió en «Ver lo que hay en» (ADR-0408, actividad 3; maqueta v4, `filtroTienda`). Decide el precio que
// ve: el de esa tienda. Va en la dirección como `?sede=trujillo`: el nombre web en minúsculas, sin tildes ni espacios, para que se
// lea y se pueda compartir. Desde el 2026-10-19 (Felipe: «siempre se debe elegir una tienda») ya no existe «Todas» con varias tiendas
// en la web: sin tienda en la dirección, la página manda a la que la persona eligió la última vez o, si no hay ninguna, a la primera
// (`resolverSede`). Con una sola tienda en la web no hay nada que elegir. Lógica pura, con su prueba al lado.

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

/**
 * Qué tienda se ve en una página del catálogo. La de la dirección, si es de la web; si no (sin `?sede=` o una que no existe) y la web
 * tiene dos tiendas o más, la que la persona eligió la última vez (`recordada`, de su cookie) o, sin ella, la primera en orden: la
 * página redirige a esa (`redirigir`). Con una sola tienda (o ninguna, si la base no respondió) no hay nada que elegir: `sede: null`.
 */
export function resolverSede<T extends ConNombre>(
  valor: string | string[] | undefined,
  recordada: string | undefined,
  sedes: readonly T[],
): { sede: T | null; redirigir: boolean } {
  const deLaUrl = sedeDeLaUrl(valor, sedes);
  if (deLaUrl) return { sede: deLaUrl, redirigir: false };
  if (sedes.length < 2) return { sede: null, redirigir: false };
  return { sede: sedeDeLaUrl(recordada, sedes) ?? sedes[0], redirigir: true };
}

/** La tienda de un enlace de elegir tienda (`/inicio?sede=lima`), o null si no lleva ninguna. */
export function claveDeLaOpcion(href: string): string | null {
  const q = href.indexOf("?");
  return q < 0 ? null : new URLSearchParams(href.slice(q + 1).split("#")[0]).get("sede");
}

/** Las opciones de elegir tienda que son una tienda (las que llevan `?sede=`): sin el «Todas» que ya no se ofrece. Con menos de dos, nada. */
export function soloTiendas<T extends { href: string }>(opciones: readonly T[] | null | undefined): T[] | null {
  const tiendas = (opciones ?? []).filter((o) => claveDeLaOpcion(o.href) !== null);
  return tiendas.length >= 2 ? tiendas : null;
}

/** Una tienda para elegir en la cabecera: su nombre, el enlace que la elige y si es la que se ve. */
export type OpcionTienda = { nombre: string; href: string; actual: boolean };
