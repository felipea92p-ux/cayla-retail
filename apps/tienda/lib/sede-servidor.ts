import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SEDE } from "./sede-cookie";
import { resolverSede } from "./sede-elegida";

/**
 * La tienda de una página del catálogo (Felipe 2026-10-19: «siempre se debe elegir una tienda»): la de la dirección, o, si no trae una
 * (o trae una que no existe), manda a la misma página con la que eligió la última vez o con la primera: así «Todas» ya no existe y toda la
 * página, sus enlaces y su precio hablan de UNA tienda. Con una sola tienda en la web (o sin lectura de la base) devuelve `null`: no hay
 * nada que elegir. Se llama al comienzo de la página, antes de leer nada más; `ruta` es la de la página (con su id, si lo tiene).
 */
export async function sedeDeLaPagina<T extends { nombre: string }>(
  sp: Record<string, string | string[] | undefined>,
  sedes: readonly T[],
  ruta: string,
  claveDe: (nombre: string) => string,
): Promise<T | null> {
  const hecha = resolverSede(sp.sede, undefined, sedes);
  if (!hecha.redirigir) return hecha.sede;
  const recordada = (await cookies()).get(COOKIE_SEDE)?.value;
  const { sede } = resolverSede(undefined, recordada, sedes);
  if (!sede) return null;
  const query = new URLSearchParams({ sede: claveDe(sede.nombre) });
  for (const [clave, valor] of Object.entries(sp)) {
    if (clave === "sede" || valor === undefined) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) query.append(clave, v);
  }
  redirect(`${ruta}?${query.toString()}`);
}
