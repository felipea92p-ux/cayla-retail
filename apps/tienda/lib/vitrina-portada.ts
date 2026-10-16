import { claveCategoria, fotosDeTarjeta, porLlegada, porPuesto, type Prenda } from "./catalogo";
import { grupoDe } from "./grupos";

// La vitrina de la portada de quien todavía no tiene cuenta (Felipe 2026-10-16: «fotos sin precio», con «Crea tu cuenta para ver
// precios y separar»). Lógica pura, con su prueba al lado.

/** Cuántas prendas muestra la vitrina: un carril que se desliza con el dedo (con el mouse, sus flechas). */
export const EN_LA_VITRINA = 10;

/** Una prenda del menú «Ropa» (`lib/grupos.ts`); los accesorios, la bisutería y el calzado, no. Sin categoría, no. */
const esRopa = (p: Prenda) => {
  const clave = claveCategoria(p.categoria);
  return clave !== null && grupoDe(clave).menu === "ropa";
};

/**
 * Las prendas de la vitrina: solo las que tienen foto (una percha dibujada no vende) y sin repetir las del héroe; primero lo nuevo (lo
 * último que llegó primero), después lo más vendido (por su puesto) y al final lo demás. Dentro de cada grupo, la ropa antes que los
 * accesorios: la vitrina de una tienda de moda abre con ropa (el primer día abría con unas alas de hada). Lo demás, en el orden en que
 * llegó del catálogo.
 */
export function vitrinaDePortada(prendas: readonly Prenda[], yaEnElHeroe: ReadonlySet<string>, cuantas = EN_LA_VITRINA): Prenda[] {
  const peso = (p: Prenda) => (p.nuevo ? 0 : p.vendidos !== null ? 1 : 2);
  return prendas
    .filter((p) => fotosDeTarjeta(p)[0] !== null && !yaEnElHeroe.has(p.id))
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        peso(a.p) - peso(b.p) || Number(esRopa(b.p)) - Number(esRopa(a.p)) || porLlegada(a.p, b.p) || porPuesto(a.p, b.p) || a.i - b.i,
    )
    .slice(0, cuantas)
    .map((x) => x.p);
}

/** «Lima y Trujillo», «Arequipa, Lima y Trujillo»: las tiendas donde se recoge, para la franja de confianza. */
export function tiendasEnFrase(nombres: readonly string[]): string | null {
  if (nombres.length === 0) return null;
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}
