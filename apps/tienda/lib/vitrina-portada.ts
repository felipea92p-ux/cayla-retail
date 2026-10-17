// Lo que queda de la portada de quien todavía no tenía cuenta (Felipe 2026-10-16): la portada ya no existe (2026-10-17, la tienda se ve
// sin cuenta) y su vitrina «sin precio» se fue con ella. Queda la frase de las tiendas de la franja de confianza.

/** «Lima y Trujillo», «Arequipa, Lima y Trujillo»: las tiendas donde se recoge, para la franja de confianza. */
export function tiendasEnFrase(nombres: readonly string[]): string | null {
  if (nombres.length === 0) return null;
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}
