import type { MenuCabecera } from "./inicio";
import { cabeceraDeLista, leerLista, tituloPartido } from "./listas";

// Qué forma tiene el esqueleto que se ve mientras llega una página (Felipe 2026-10-15: «cuando presiono en una prenda para ver el
// detalle no da la sensación de carga»; 2026-10-17: «los esqueletos todavía no están acorde, quisiera que sea más fiel a lo que mostrará
// el contenido»). Un mismo `loading.tsx` cubre varias páginas (el del catálogo cubre el Inicio, la lista, la ficha y los looks; el de la
// cuenta, «Mi perfil» y sus páginas), así que la forma sale de la dirección a la que se va: el Inicio con su héroe, la lista con su título
// y sus filtros, la ficha con la foto grande y sus datos, «Arma el tuyo» con su arco, «Mi perfil» con su saludo y sus cuadros, la bolsa
// con sus prendas y su resumen, los looks con sus láminas. Así lo que brilla tiene la forma de lo que llega y nada salta al llegar.
// Lógica pura, con su prueba al lado, y sin zod (la usa el navegador mientras espera).

export type FormaEsqueleto =
  | "inicio"
  | "grilla"
  | "ficha"
  | "looks"
  | "look"
  | "probador"
  | "perfil"
  | "lista"
  | "bolsa"
  | "recomendaciones";

/** El id de una prenda (o de un look) en la dirección. El mismo de `lib/ficha.ts`, aquí sin zod. */
const esId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const limpiar = (ruta: string) => (ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta);

export function formaDeLaRuta(ruta: string): FormaEsqueleto {
  const limpia = limpiar(ruta);
  if (limpia === "/inicio") return "inicio";
  const ficha = /^\/catalogo\/([^/]+)$/.exec(limpia);
  if (ficha && esId(ficha[1])) return "ficha";
  if (limpia === "/cuenta") return "perfil";
  // «Arma el tuyo» (ADR-0434): el arco del probador y su tira, no una grilla. Un look guardado se ve como una ficha: su figura grande
  // y sus datos al lado.
  if (limpia === "/looks/arma") return "probador";
  const guardado = /^\/looks\/guardado\/([^/]+)$/.exec(limpia);
  if (guardado && esId(guardado[1])) return "ficha";
  if (limpia === "/looks") return "looks";
  const look = /^\/looks\/([^/]+)$/.exec(limpia);
  if (look && esId(look[1])) return "look";
  if (limpia === "/bolsa") return "bolsa";
  if (limpia === "/recomendaciones") return "recomendaciones";
  if (limpia.startsWith("/cuenta/") || limpia.startsWith("/bolsa/")) return "lista";
  return "grilla";
}

/** La id de la prenda de una ficha (`/catalogo/<id>`), o null si la dirección no es una ficha. Con ella, el esqueleto de la ficha busca
 *  lo que ya se vio de esa prenda en la tarjeta tocada (`lib/prenda-tocada.ts`). */
export function prendaDeLaRuta(ruta: string): string | null {
  const ficha = /^\/catalogo\/([^/]+)$/.exec(limpiar(ruta));
  return ficha && esId(ficha[1]) ? ficha[1].toLowerCase() : null;
}

/** La sección de la cabecera que se marca (`aria-current`) en la página que viene: la misma que marcará la página al llegar, para que
 *  la raya de «Lo nuevo» o de «Arma tu look» no se apague y se vuelva a prender mientras carga. */
export type SeccionActual = "inicio" | "nuevo" | "vendidos" | "ofertas" | "looks" | "probador" | "favoritos" | "cuenta" | null;

export function seccionDeLaRuta(ruta: string, buscar: URLSearchParams): SeccionActual {
  const limpia = limpiar(ruta);
  if (limpia === "/inicio") return "inicio";
  if (limpia === "/catalogo") {
    const lista = leerLista(buscar.get("lista") ?? undefined);
    return lista === "todo" ? null : lista;
  }
  if (limpia === "/looks/arma") return "probador";
  if (limpia.startsWith("/looks/guardado/")) return "favoritos";
  if (limpia === "/looks" || limpia.startsWith("/looks/")) return "looks";
  if (limpia === "/cuenta" || limpia.startsWith("/cuenta/")) return "cuenta";
  return null;
}

export type TituloDeEspera = { ceja: string; titulo: [string, string]; frase: string | null };

/**
 * Lo de arriba de una lista del catálogo, escrito ya mientras llega (la ceja, el título y la frase): lo mismo que dirá la página
 * (`app/(catalogo)/catalogo/page.tsx`). Las listas (Lo nuevo, las ofertas, Más vendidos, los favoritos, toda la tienda) se saben por la
 * dirección; una categoría, un grupo o un menú («Toda la ropa»), por los nombres de la cabecera que ya se vio (`menus`). Si no se sabe
 * (una categoría que la cabecera no trae, o sin cabecera vista), null: el título brilla en su lugar, sin inventar un nombre.
 */
export function tituloDeEspera(buscar: URLSearchParams, menus: readonly MenuCabecera[] | null): TituloDeEspera | null {
  const lista = leerLista(buscar.get("lista") ?? undefined);
  const cab = cabeceraDeLista(lista);
  const comun = { ceja: cab.ceja, titulo: cab.titulo, frase: cab.frase };
  if (lista !== "todo") return comun;
  const categoria = buscar.get("categoria");
  const grupo = buscar.get("grupo");
  const menu = buscar.get("menu");
  if (!categoria && !grupo && !menu) return comun;
  if (!menus) return null;
  if (categoria) {
    for (const m of menus)
      for (const g of m.grupos) {
        const c = g.categorias.find((x) => x.clave === categoria);
        if (c) return { ceja: g.nombre, titulo: tituloPartido(c.nombre), frase: null };
      }
    return null;
  }
  if (grupo) {
    for (const m of menus) {
      const g = m.grupos.find((x) => x.clave === grupo);
      if (g) return { ceja: m.nombre, titulo: tituloPartido(g.nombre), frase: null };
    }
    return null;
  }
  const elegido = menus.find((m) => m.clave === menu);
  return elegido ? { ceja: cab.ceja, titulo: tituloPartido(elegido.todo), frase: null } : null;
}

/**
 * Qué cuenta como «otra vista» para el fundido entre páginas (`MarcaDeVista`): otra dirección, o en el catálogo otra lista o menú de la
 * cabecera (de Lo nuevo a Más vendidos, de «Ropa» a «Accesorios»). Los filtros de una lista (la categoría, el grupo, el orden, la tienda
 * elegida, «ver más») NO: esos apagan la lista mientras llega la nueva y no deben fundir toda la pantalla en cada toque.
 */
export function claveDeVista(ruta: string, buscar: URLSearchParams): string {
  const limpia = limpiar(ruta);
  if (limpia !== "/catalogo") return limpia;
  return `${limpia}?lista=${leerLista(buscar.get("lista") ?? undefined)}&menu=${buscar.get("menu") ?? ""}`;
}
