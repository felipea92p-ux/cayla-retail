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
import { hrefLooks } from "./looks";
import { gruposDe, MENUS, type Menu } from "./grupos";
import type { Campana } from "./portada";

// El Inicio con cuenta y la cabecera de la tienda (ADR-0408, actividad 5; maqueta v4, `vInicio`, `heroCampana`, `heroNuevo`,
// `circulosCats`, `megaHTML`). Lo que se arma con el catálogo ya leído (y ya filtrado por la tienda elegida): qué va en el héroe, las
// categorías como círculos, los menús «Ropa» y «Accesorios», los enlaces de la cabecera y el índice del buscador. Lógica pura, con su prueba.

/* ---------------- El héroe ---------------- */

export type Hero =
  /** La campaña que anuncia la portada (la misma de la franja), con hasta 3 prendas suyas que hay en la tienda elegida. */
  | { tipo: "campana"; campana: Campana; piezas: Prenda[]; campanaId: string | null }
  /** Sin campaña: lo que llegó hace menos. */
  | { tipo: "nuevo"; piezas: Prenda[] }
  /** Sin campaña ni nada nuevo: la frase de la marca. */
  | { tipo: "marca" };


/**
 * El héroe del Inicio (maqueta: la campaña vigente; si no hay, «Lo nuevo»). Las prendas del collage, las que tienen foto primero.
 * La campaña sale solo si tiene alguna prenda suya que baja de precio en lo que se ve (Felipe 2026-10-15): el primer día en
 * producción el Aniversario no tenía ninguna prenda publicada, el collage quedaba vacío y «Ver la campaña» llevaba a una lista sin
 * nada. Sin prendas suyas, la portada pasa a «Lo nuevo» (o a la marca), y la campaña vuelve sola cuando se le publiquen prendas.
 */
export function heroDelInicio(campana: Campana | null, prendas: readonly Prenda[]): Hero {
  if (campana) {
    const suyas = prendas.filter((p) => enOferta(p) && p.campana && normalizar(p.campana.nombre) === normalizar(campana.nombre));
    if (suyas.length > 0) {
      return {
        tipo: "campana",
        campana,
        piezas: [...suyas].sort(conFotoPrimero).slice(0, 3),
        campanaId: suyas.find((p) => p.campana?.id)?.campana?.id ?? null,
      };
    }
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
  /** Los favoritos: el corazón de la computadora y el menú del celular. */
  favoritos: string;
  /** Los menús «Ropa» y «Accesorios» (lib/grupos.ts): solo los que tienen algo, con sus grupos y categorías. Los usan la computadora
   *  (un menú que se abre por cada uno) y el celular (las categorías, en su grupo). */
  menus: MenuCabecera[];
  /** El buscador: todo lo publicado (en la tienda elegida). */
  indice: ItemBusqueda[];
  /** Con el buscador vacío, las categorías para tocar. */
  sugerencias: string[];
};

/** Lo que la cabecera necesita, del catálogo ya leído y filtrado por la tienda elegida (`sede`: su clave, o null con «Todas»). */
export function datosDeCabecera(prendas: readonly Prenda[], sede: string | null, origenFotos: string | undefined): DatosCabecera {
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
    favoritos: HREF_FAVORITOS,
    menus,
    indice: prendas.map((p) => {
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
    }),
    sugerencias: categorias.slice(0, 6).map((x) => x.corto),
  };
}
