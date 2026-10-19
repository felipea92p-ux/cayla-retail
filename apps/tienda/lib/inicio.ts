import type { ItemBusqueda } from "./buscador";
import { normalizar } from "./buscador";
import {
  claveCategoria,
  colorDeDibujo,
  conFotoPrimero,
  enOferta,
  formaDe,
  fotoOptimizable,
  fotosDeTarjeta,
  hrefDePrenda,
  hrefLista,
  insigniaOferta,
  porLlegada,
  precioTarjeta,
  type Forma,
  type Prenda,
} from "./catalogo";
import { piezasQueCaben, prendasElegidas } from "@cayla-retail/portada";
import { hrefLooks } from "./looks";
import { hrefDelProbador } from "./probador";
import { gruposDe, MENUS, type Menu } from "./grupos";
import type { Campana } from "./portada";

// El Inicio con cuenta y la cabecera de la tienda (ADR-0408, actividad 5; maqueta v4, `vInicio`, `heroCampana`, `heroNuevo`,
// `circulosCats`, `megaHTML`). Lo que se arma con el catálogo ya leído (y ya filtrado por la tienda elegida): qué va en el héroe, las
// categorías como círculos, los menús «Ropa» y «Accesorios», los enlaces de la cabecera y el índice del buscador. Lógica pura, con su prueba.

/* ---------------- El héroe ---------------- */

export type Hero =
  /** La campaña que anuncia la portada (la misma de la franja), con las prendas suyas que hay en la tienda elegida y que caben en el
   *  acomodo de su diseño (tres polaroids, una grande, cuatro en mosaico, ninguna con solo letras), en el orden elegido en el ERP.
   *  `conPrendas`: tiene prendas a la vista aquí, aunque el acomodo no muestre ninguna (con solo letras, «Ver la campaña» igual lleva a su
   *  lista). Sin ninguna, sale por su diseño, sin fotos (`campanaId` null). */
  | { tipo: "campana"; campana: Campana; piezas: Prenda[]; conPrendas: boolean; campanaId: string | null }
  /** Sin campaña: lo que llegó hace menos. */
  | { tipo: "nuevo"; piezas: Prenda[] }
  /** Sin campaña ni nada nuevo: la frase de la marca. */
  | { tipo: "marca" };


/**
 * El héroe del Inicio (maqueta: la campaña vigente; si no hay, «Lo nuevo»). Las prendas del collage, las que tienen foto primero.
 * Las prendas de una campaña con descuento son las suyas que bajan de precio en lo que se ve; las de una sin descuento (ADR-0436,
 * actividad 6a), sus modelos (los que manda la portada) que se ven. Sin ninguna a la vista, una campaña SIN descuento sale igual si tiene
 * su diseño publicado (Felipe 2026-10-17: «sí, sin fotos»; la página lleva entonces a «Lo nuevo», nunca a una lista vacía); una con
 * descuento, no (Felipe 2026-10-15: el Aniversario sin prendas publicadas dejaba el collage vacío). Si no, «Lo nuevo» (o la marca), y
 * la campaña vuelve sola cuando se le publiquen prendas.
 */
/**
 * A dónde lleva «Ver la campaña» del héroe: con descuento, a sus ofertas; sin descuento, a la lista de sus prendas (`?lista=campana`). Sin
 * prendas a la vista (sale por su diseño), `null`: la página ofrece «Lo nuevo» en su lugar.
 */
export function hrefDeLaCampana(hero: Extract<Hero, { tipo: "campana" }>, sede: string | null): string | null {
  if (!hero.conPrendas) return null;
  return hrefLista({ sede, categoria: null, orden: "destacado", lista: hero.campana.pct ? "ofertas" : "campana", campana: hero.campanaId });
}

/**
 * Los héroes de la portada y del Inicio con el carrusel (ADR-0436, actividad 6b; Felipe 2026-10-17: «si hay dos campañas activas, eso
 * debe convertirse en un carrusel»): uno por cada campaña de la portada que se puede mostrar aquí (`heroDelInicio`), en el orden de la base
 * (la de descuento primero). Si ninguna se puede mostrar, uno solo: «Lo nuevo» o la marca, como antes.
 */
export function heroesDelInicio(campanas: readonly Campana[], prendas: readonly Prenda[]): Hero[] {
  const deCampanas = campanas.map((c) => heroDelInicio(c, prendas)).filter((h) => h.tipo === "campana");
  return deCampanas.length > 0 ? deCampanas : [heroDelInicio(null, prendas)];
}

export function heroDelInicio(campana: Campana | null, prendas: readonly Prenda[]): Hero {
  if (campana) {
    const modelos = new Set(campana.prendas);
    const suyas = campana.pct
      ? prendas.filter((p) => enOferta(p) && p.campana && normalizar(p.campana.nombre) === normalizar(campana.nombre))
      : prendas.filter((p) => modelos.has(p.id));
    if (suyas.length > 0) {
      return {
        tipo: "campana",
        campana,
        piezas: prendasElegidas([...suyas].sort(conFotoPrimero), campana.diseno).slice(0, piezasQueCaben(campana.diseno)),
        conPrendas: true,
        campanaId: campana.pct ? (suyas.find((p) => p.campana?.id)?.campana?.id ?? null) : campana.id,
      };
    }
    // Solo sin descuento: una con descuento sin prendas a la vista anunciaría «−N %» sin mostrar en qué (la regla del 15-oct sigue).
    if (!campana.pct && campana.diseno) return { tipo: "campana", campana, piezas: [], conPrendas: false, campanaId: null };
  }
  const nuevas = prendas.filter((p) => p.nuevo);
  if (nuevas.length > 0) return { tipo: "nuevo", piezas: [...nuevas].sort((a, b) => conFotoPrimero(a, b) || porLlegada(a, b)).slice(0, 3) };
  return { tipo: "marca" };
}

/* ---------------- Las categorías ---------------- */

// El orden de los círculos de la maqueta (`ORDEN_CATS`), por el prefijo de la categoría (nunca por su nombre visible, que se
// renombra): blusas, vestidos, tops, polos, conjuntos, pantalones, jeans, faldas, casacas, chalecos, bodys y bolsos. Lo demás, después.
const ORDEN_CIRCULOS = ["CMS", "BLU", "VES", "TOP", "POL", "CON", "PAN", "JEA", "FAL", "CAS", "CHA", "BOD", "CAR"];
// El nombre corto del círculo (maqueta: «Blusas», «Bolsos»). Sin entrada aquí, el nombre de la categoría.
const CORTO: Record<string, string> = { CMS: "Blusas", CAR: "Bolsos", LEN: "Lencería", TBA: "Baño" };

export type CategoriaInicio = {
  clave: string;
  nombre: string;
  corto: string;
  cuantas: number;
  /** La que se ve en el círculo: una de Lo nuevo si hay, si no la primera. */
  prenda: Prenda;
  /** Tiene algo de Lo nuevo: el círculo lleva su aro rojo. */
  nueva: boolean;
};

/** Las categorías con algo publicado (en la tienda elegida, si la página ya filtró), en el orden de la maqueta. */
export function categoriasDelInicio(prendas: readonly Prenda[]): CategoriaInicio[] {
  const porClave = new Map<string, Prenda[]>();
  for (const p of prendas) {
    const clave = claveCategoria(p.categoria);
    if (!clave) continue;
    porClave.set(clave, [...(porClave.get(clave) ?? []), p]);
  }
  const puesto = (clave: string) => {
    const i = ORDEN_CIRCULOS.indexOf(clave);
    return i < 0 ? ORDEN_CIRCULOS.length : i;
  };
  return [...porClave.entries()]
    .map(([clave, lista]) => {
      const nuevas = lista.filter((p) => p.nuevo).sort(porLlegada);
      const nombre = lista[0].categoria?.nombre ?? clave;
      return { clave, nombre, corto: CORTO[clave] ?? nombre, cuantas: lista.length, prenda: nuevas[0] ?? lista[0], nueva: nuevas.length > 0 };
    })
    .sort((a, b) => puesto(a.clave) - puesto(b.clave) || b.cuantas - a.cuantas || a.nombre.localeCompare(b.nombre, "es"));
}

/* ---------------- La cabecera con cuenta ---------------- */

/** La lista de favoritos (la del catálogo): el corazón de la cabecera y el menú del celular llevan aquí, sea cual sea la tienda elegida. */
const HREF_FAVORITOS = "/catalogo?lista=favoritos";

/** El Inicio con la tienda elegida (su clave, `lib/sede-elegida.ts`) o sin ella («Todas»). */
export const hrefDelInicio = (sede: string | null): string => (sede ? `/inicio?sede=${encodeURIComponent(sede)}` : "/inicio");

type Enlace = { href: string; cuantas: number };

/** Lo que dibuja una foto chica (`FotoTarjeta`): la foto, si se puede optimizar y, sin foto, la silueta en su color. */
export type FotoChica = { foto: string | null; optimizar: boolean; forma: Forma; color: string | null; nombre: string };
/** Una categoría del menú, con la foto de una de sus prendas (la que llegó hace menos, con foto si alguna tiene). */
export type CategoriaMenu = { clave: string; nombre: string; cuantas: number; href: string; foto: FotoChica };
/** Una prenda de la vitrina del menú: lo último que llegó. */
export type PrendaMenu = { id: string; href: string; nombre: string; precio: string; oferta: boolean; foto: FotoChica };
export type MenuCabecera = {
  clave: Menu;
  nombre: string;
  /** A todo el menú («Toda la ropa»): lo que lleva el botón de la cabecera y la primera línea del celular. */
  href: string;
  todo: string;
  grupos: { clave: string; nombre: string; href: string; categorias: CategoriaMenu[] }[];
  /** La vitrina de la derecha: lo último que llegó de este menú, con foto (hasta 5; se ven las que caben). */
  recien: PrendaMenu[];
};

const tieneFoto = (p: Prenda) => fotosDeTarjeta(p)[0] !== null;
export type DatosCabecera = {
  inicio: string;
  nuevo: Enlace;
  vendidos: Enlace;
  ofertas: Enlace;
  /** «Arma tu look», con la tienda elegida (maqueta, `cabT`: entre «Ropa» y «Más vendidos»). */
  looks: string;
  /** «Arma el tuyo», el probador (ADR-0434, actividad 10), con la tienda elegida: justo después de «Arma tu look». null mientras el
   *  probador no tenga nada que probar (Felipe 2026-10-17: sin recortes, la entrada no sale). */
  probador: string | null;
  /** Los favoritos: el corazón de la computadora y el menú del celular. */
  favoritos: string;
  /** Los menús «Ropa» y «Accesorios» (lib/grupos.ts): solo los que tienen algo, con sus grupos y categorías. Los usan la computadora
   *  (un menú que se abre por cada uno) y el celular (las categorías, en su grupo). */
  menus: MenuCabecera[];
  /** La clave de la tienda elegida (o null con «Todas»): el buscador pide su lista para ella (`indiceDelBuscador`). La lista no viaja
   *  con la cabecera (2026-10-17): eran ~530 bytes por prenda en CADA página, aunque nadie abriera el buscador. */
  sede: string | null;
  /** Con el buscador vacío, las categorías para tocar. */
  sugerencias: string[];
};

/** Lo que la cabecera necesita, del catálogo ya leído y filtrado por la tienda elegida (`sede`: su clave, o null con «Todas»).
 *  `conProbador`: si el probador tiene algo que probar ahí (`hayAlgoParaProbar`); sin eso, «Arma el tuyo» no sale. */
export function datosDeCabecera(prendas: readonly Prenda[], sede: string | null, origenFotos: string | undefined, conProbador = false): DatosCabecera {
  const lista = (l: "nuevo" | "vendidos" | "ofertas") => hrefLista({ sede, categoria: null, orden: "destacado", lista: l });
  const categorias = categoriasDelInicio(prendas);
  const fotoChica = (p: Prenda): FotoChica => {
    const foto = fotosDeTarjeta(p)[0];
    return { foto, optimizar: foto ? fotoOptimizable(foto, origenFotos) : false, forma: formaDe(p.categoria?.prefijo), color: colorDeDibujo(p), nombre: p.nombre };
  };
  const grupos = gruposDe(prendas);
  const menus: MenuCabecera[] = MENUS.flatMap((m) => {
    const suyos = grupos.filter((g) => g.menu === m.clave);
    if (suyos.length === 0) return [];
    const recien = suyos
      .flatMap((g) => g.categorias.flatMap((c) => c.prendas))
      .filter((p) => p.nuevo && tieneFoto(p))
      .sort((a, b) => porLlegada(a, b) || a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, 5);
    return [{
      clave: m.clave,
      nombre: m.nombre,
      href: hrefLista({ sede, categoria: null, orden: "destacado", menu: m.clave }),
      todo: m.todo,
      grupos: suyos.map((g) => ({
        clave: g.clave,
        nombre: g.nombre,
        href: hrefLista({ sede, categoria: null, orden: "destacado", grupo: g.clave }),
        categorias: g.categorias.map((c) => {
          // La foto de la categoría: la prenda que llegó hace menos, entre las que tienen foto (si ninguna tiene, su silueta).
          const cara = [...c.prendas].sort((a, b) => Number(tieneFoto(b)) - Number(tieneFoto(a)) || porLlegada(a, b) || a.nombre.localeCompare(b.nombre, "es"))[0];
          return { clave: c.clave, nombre: c.nombre, cuantas: c.cuantas, href: hrefLista({ sede, categoria: c.clave, orden: "destacado" }), foto: fotoChica(cara) };
        }),
      })),
      recien: recien.map((p) => ({ id: p.id, href: hrefDePrenda(p, sede), nombre: p.nombre, precio: precioTarjeta(p).principal, oferta: enOferta(p), foto: fotoChica(p) })),
    }];
  });
  return {
    inicio: hrefDelInicio(sede),
    nuevo: { href: lista("nuevo"), cuantas: prendas.filter((p) => p.nuevo).length },
    vendidos: { href: lista("vendidos"), cuantas: prendas.filter((p) => p.vendidos !== null).length },
    ofertas: { href: lista("ofertas"), cuantas: prendas.filter(enOferta).length },
    looks: hrefLooks(sede),
    probador: conProbador ? hrefDelProbador(sede) : null,
    favoritos: HREF_FAVORITOS,
    menus,
    sede,
    sugerencias: categorias.slice(0, 6).map((x) => x.corto),
  };
}

/** El buscador de la cabecera: todo lo publicado en la tienda elegida, con lo que dice cada tarjeta (precio, oferta, foto) y nada más. Lo
 *  pide la cabecera recién cuando el cliente va a buscar (`app/acciones/buscador.ts`), no con cada página. */
export function indiceDelBuscador(prendas: readonly Prenda[], sede: string | null, origenFotos: string | undefined): ItemBusqueda[] {
  return prendas.map((p) => {
    const foto = fotosDeTarjeta(p)[0];
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria?.nombre ?? null,
      colores: p.colores.map((c) => c.nombre),
      precio: precioTarjeta(p).principal,
      oferta: insigniaOferta(p),
      href: hrefDePrenda(p, sede),
      foto,
      optimizar: foto ? fotoOptimizable(foto, origenFotos) : false,
      forma: formaDe(p.categoria?.prefijo),
      color: colorDeDibujo(p),
    };
  });
}
