import { partirTitulo } from "@cayla-retail/portada";

// Las listas del catálogo y lo de arriba de cada una (la ceja, el título y la frase), aparte de `catalogo.ts` (2026-10-17): sin zod, para
// que el esqueleto de la lista, que es del navegador, escriba el título real («Lo nuevo», «Más vendidos») mientras llega la página, sin
// traer 13 KB de validación a cada página. `catalogo.ts` y `grupos.ts` las vuelven a exportar: quien ya las usaba no cambia nada.

/** Las listas de la maqueta (`vLista`): toda la tienda, Lo nuevo, las ofertas, los más vendidos y «Tus favoritos» (lo que el cliente
 *  marcó con el corazón: el corazón de la cabecera lleva a `/catalogo?lista=favoritos`). */
/** `campana`: las prendas de una campaña sin descuento (ADR-0436, actividad 6a), que no salen en «Ofertas»; sus modelos los dice la portada. */
export type Lista = "todo" | "nuevo" | "ofertas" | "vendidos" | "favoritos" | "campana";
const LISTAS: readonly Lista[] = ["todo", "nuevo", "ofertas", "vendidos", "favoritos", "campana"];

const unValor = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** La lista de la URL (`?lista=`); cualquier otra cosa, toda la tienda. */
export const leerLista = (v: string | string[] | undefined): Lista => {
  const l = unValor(v);
  return LISTAS.includes(l as Lista) ? (l as Lista) : "todo";
};

export type CabeceraLista = {
  ceja: string;
  titulo: [string, string];
  frase: string | null;
  /** Lo que dice la lista cuando no tiene nada (qué aparecería aquí y qué hacer mientras tanto). Toda la tienda no lo necesita: sin
   *  nada publicado, la página dice «Pronto verás aquí nuestras prendas». */
  vacio: { titulo: string; texto: string } | null;
};

/** Lo de arriba de cada lista (maqueta, `vLista`): la ceja, el título (lo segundo en cursiva) y la frase; y lo que dice vacía. La de una
 *  campaña sin descuento lleva su nombre (`campana`). */
export function cabeceraDeLista(lista: Lista, campana: { nombre: string } | null = null): CabeceraLista {
  switch (lista) {
    case "campana": {
      const nombre = campana?.nombre ?? "la campaña";
      return {
        ceja: "Campaña",
        titulo: campana ? partirTitulo(campana.nombre) : ["La", "campaña"],
        frase: `Las prendas que elegimos para ${nombre}.`,
        vacio: { titulo: "Por ahora no hay prendas de esta campaña", texto: "Cuando se publiquen, aparecen aquí. Mientras tanto, mira toda la tienda." },
      };
    }
    case "nuevo":
      return {
        ceja: "Recién llegado",
        titulo: ["Lo", "nuevo"],
        frase: "Lo que llegó a nuestras tiendas en los últimos 30 días.",
        vacio: { titulo: "Por ahora no hay nada nuevo", texto: "Lo que llega a nuestras tiendas aparece aquí durante 30 días. Mientras tanto, mira toda la tienda." },
      };
    case "ofertas":
      return {
        ceja: "Campañas vigentes",
        titulo: ["Las", "ofertas"],
        frase: "El descuento de cada campaña, sobre el precio de tu tienda, hasta su último día.",
        vacio: { titulo: "Por ahora no hay ofertas", texto: "Cuando empiece una campaña, sus prendas aparecen aquí. Mientras tanto, mira toda la tienda." },
      };
    case "vendidos":
      return {
        ceja: "Lo que más se llevan",
        titulo: ["Más", "vendidos"],
        frase: "Los modelos que más se vendieron en los últimos 30 días, en todas nuestras tiendas.",
        vacio: { titulo: "Todavía no hay más vendidos", texto: "Aquí aparece lo que más se vende en nuestras tiendas en 30 días. Mientras tanto, mira toda la tienda." },
      };
    case "favoritos":
      return {
        ceja: "Guardado por ti",
        titulo: ["Tus", "favoritos"],
        frase: "Lo que marcaste con el corazón.",
        vacio: { titulo: "Aún no guardas nada", texto: "Toca el corazón de una prenda para guardarla." },
      };
    default:
      return { ceja: "Catálogo", titulo: ["Toda la", "tienda"], frase: null, vacio: null };
  }
}

/** Un nombre partido para el título serif de la lista: lo último va en cursiva roja («Vestidos y *conjuntos*», «*Vestidos*»). */
export function tituloPartido(nombre: string): [string, string] {
  const i = nombre.trim().lastIndexOf(" ");
  return i < 0 ? ["", nombre.trim()] : [nombre.trim().slice(0, i), nombre.trim().slice(i + 1)];
}
