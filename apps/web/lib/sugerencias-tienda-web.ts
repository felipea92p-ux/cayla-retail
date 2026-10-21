// Los ejemplos de Tienda web ▸ Ajustes siguen a la tienda de su tarjeta (skill `/sugerir`, CLAUDE.md «Sugerencias
// coherentes», ADR-0290). Cada tarjeta es una tienda, y lo que se escribe en ella es de ESA tienda: en la de Trujillo, el
// nombre de ejemplo es «Trujillo» y la dirección de ejemplo, una de Trujillo; nunca «Ej. Av. Larco, Miraflores» en la tarjeta
// de Arequipa.
//
// De dónde sale cada texto, en este orden:
//   1. la ciudad de la tienda, con la misma regla de Análisis (`sedeDeAnalisis`: «Tienda TRU» → Trujillo), y para las tres
//      ciudades de CAYLA una dirección de ejemplo curada (inventada: enseña la forma —calle, número y referencia—, no ofrece un
//      valor; un dato real invitaría a copiarlo);
//   2. una tienda sin nombre que se lea: un texto neutro que no promete nada.
// Puro y determinista: misma tienda, mismo texto.

import { sedeDeAnalisis } from "./analisis-reglas";

/** Lo más largo que cabe en la caja de la dirección de una tarjeta (a 375 px la caja útil mide ~280 px), con margen. */
const MAX_EJEMPLO = 40;

/** Inventadas a propósito (como en la maqueta): la forma de una dirección para recoger en cada ciudad de CAYLA. */
const DIRECCION_POR_CIUDAD: Readonly<Record<string, string>> = {
  Trujillo: "Ej. Jr. Pizarro 512, Centro",
  Arequipa: "Ej. Calle Mercaderes 210, Cercado",
  Lima: "Ej. Av. Larco 345, Miraflores",
};

/** @internal Exportados para su prueba: sin una tienda que se lea, el ejemplo es este y no el de otra ciudad. */
export const NOMBRE_NEUTRO = "La ciudad o el lugar de la tienda";
/** @internal Exportados para su prueba (ver arriba). */
export const DIRECCION_NEUTRA = "Calle, número y una referencia";

/** La ciudad de la tienda («Tienda TRU» → «Trujillo»), o null si su nombre no dice nada. */
function ciudadDe(nombreSede: string): string | null {
  const limpio = nombreSede.trim();
  if (!limpio || /^tienda$/i.test(limpio)) return null;
  const ciudad = sedeDeAnalisis({ id: "", nombre: limpio }).ciudad.trim();
  return ciudad === "" ? null : ciudad;
}

/** El ejemplo del nombre que ve el cliente: la ciudad de esa tienda. */
export function sugerirNombreWeb(nombreSede: string): string {
  const ciudad = ciudadDe(nombreSede);
  return ciudad && ciudad.length + 4 <= MAX_EJEMPLO ? `Ej. ${ciudad}` : NOMBRE_NEUTRO;
}

/** El ejemplo de la dirección para recoger: una de su ciudad, si es una de las de CAYLA; si no, la forma, sin inventar una calle. */
export function sugerirDireccion(nombreSede: string): string {
  const ciudad = ciudadDe(nombreSede);
  return (ciudad && DIRECCION_POR_CIUDAD[ciudad]) || DIRECCION_NEUTRA;
}
