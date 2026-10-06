// El texto de ayuda del buscador «¿Qué prenda es?» de Regularizar prenda (CLAUDE.md «Sugerencias coherentes», ADR-0290; ADR-0328
// actividad 5, decisión D2 del 2026-10-05).
//
// El problema: el buscador decía siempre «Busca por nombre, código, talla o color» y mostraba el catálogo entero. Para una venta de
// TRU anotada «Pantalones · Chocolate · Talla 28» eso no le decía a la persona qué estaba mirando. Ahora el buscador, por defecto,
// muestra solo las prendas de la tienda DE LA VENTA que calzan con lo anotado, y su texto lo dice: «Pantalones · Chocolate · 28 en
// Tienda TRU». Si la persona pasa a «Buscar en todo el catálogo», el texto también cambia: ya no promete nada de esa venta.
//
// De dónde sale, en este orden: lo que la caja ESCRIBIÓ si nombra otra categoría (se busca en las dos), lo que ANOTÓ (categoría,
// color, talla) y la tienda de la venta (la de `prendas_por_regularizar.ubicacion_id`, NO la de la cabecera). Sin nada de eso, un
// texto que no promete nada. Función pura y determinista: misma venta y mismo modo, mismo texto.
import type { ModoBuscador } from "./por-regularizar-buscador";

/**
 * Lo más largo que cabe en el buscador de la hoja a 375 px de ancho (la caja útil mide ~300 px con el texto en 14 px: ~44 caracteres
 * en el peor caso medido). Más largo se corta a media palabra: se suelta primero la tienda y después lo escrito.
 */
export const MAX_MARCADOR = 44;

export type ContextoMarcador = {
  modo: ModoBuscador;
  /** Lo que anotó la caja. Cualquiera puede venir vacío (un accesorio no tiene talla). */
  categoria: string;
  color: string;
  talla: string;
  /** La tienda DE LA VENTA. */
  sede: string;
  /** La categoría que nombra lo que ESCRIBIÓ la caja, si es otra que la anotada («Jean…» anotado como Pantalones). */
  escrita?: string | null;
};

/** Sin contexto, o buscando en todo el catálogo: no promete nada de la venta. */
export const MARCADOR_CATALOGO = "Todo el catálogo: nombre, código, talla…";
export const MARCADOR_NEUTRO = "Busca por nombre, código, talla o color";

/** El texto del buscador, siguiendo lo anotado y la tienda de la venta. */
export function marcadorBuscador(c: ContextoMarcador): string {
  if (c.modo === "catalogo") return MARCADOR_CATALOGO;
  const categorias = [c.escrita, c.categoria].filter((x): x is string => !!x && x.trim() !== "");
  const unicas = [...new Set(categorias)];
  const resto = [c.color, c.talla].filter((x) => x && x.trim() !== "");
  if (unicas.length === 0 && resto.length === 0) return MARCADOR_NEUTRO;
  const sede = c.sede.trim() ? ` en ${c.sede.trim()}` : "";
  const con = (cats: string[], conSede: boolean) => [cats.join(" o "), ...resto].filter(Boolean).join(" · ") + (conSede ? sede : "");
  // De la más completa a la más corta: primero se suelta la tienda, después la categoría anotada cuando la escrita manda.
  const intentos = [con(unicas, true), con(unicas, false), con(unicas.slice(0, 1), false)];
  return intentos.find((t) => t.length <= MAX_MARCADOR) ?? recortar(intentos[intentos.length - 1]!);
}

/** Si ni lo más corto cabe, se corta en la última palabra entera y se avisa con «…» (nunca a media palabra). */
function recortar(t: string): string {
  const corte = t.lastIndexOf(" ", MAX_MARCADOR - 1);
  return `${t.slice(0, corte > 0 ? corte : MAX_MARCADOR - 1).replace(/[\s·]+$/, "")}…`;
}
