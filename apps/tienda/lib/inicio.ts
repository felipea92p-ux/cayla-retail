import type { ItemBusqueda } from "./buscador";
import { normalizar } from "./buscador";
import {
  claveCategoria,
  colorDeDibujo,
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
import type { Campana } from "./portada";

// El Inicio con cuenta y la cabecera de la tienda (ADR-0408, actividad 5; maqueta v4, `vInicio`, `heroCampana`, `heroNuevo`,
// `circulosCats`, `megaHTML`). Lo que se arma con el catálogo ya leído (y ya filtrado por la tienda elegida): qué va en el héroe, las
// categorías como círculos, las columnas del menú, los enlaces de la cabecera y el índice del buscador. Lógica pura, con su prueba.

/* ---------------- El héroe ---------------- */

export type Hero =
  /** La campaña que anuncia la portada (la misma de la franja), con hasta 3 prendas suyas que hay en la tienda elegida. */
  | { tipo: "campana"; campana: Campana; piezas: Prenda[]; campanaId: string | null }
  /** Sin campaña: lo que llegó hace menos. */
  | { tipo: "nuevo"; piezas: Prenda[] }
  /** Sin campaña ni nada nuevo: la frase de la marca. */
  | { tipo: "marca" };

const conFotoPrimero = (a: Prenda, b: Prenda) => Number(fotosDeTarjeta(b)[0] !== null) - Number(fotosDeTarjeta(a)[0] !== null);

/** El héroe del Inicio (maqueta: la campaña vigente; si no hay, «Lo nuevo»). Las prendas del collage, las que tienen foto primero. */
export function heroDelInicio(campana: Campana | null, prendas: readonly Prenda[]): Hero {
  if (campana) {
    const suyas = prendas.filter((p) => enOferta(p) && p.campana && normalizar(p.campana.nombre) === normalizar(campana.nombre));
    return {
      tipo: "campana",
      campana,
      piezas: [...suyas].sort(conFotoPrimero).slice(0, 3),
      campanaId: suyas.find((p) => p.campana?.id)?.campana?.id ?? null,
    };
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

// Las columnas del menú «Ropa» de la computadora (maqueta, `megaHTML`), por prefijo. Lo que no está en las dos primeras va en la
// tercera («Encima y más»): una categoría nueva aparece sola, sin tocar el código.
const COLUMNAS: { titulo: string; prefijos: string[] | null }[] = [
  { titulo: "Arriba", prefijos: ["CMS", "BLU", "TOP", "POL", "BOD", "SUD", "CMP", "LEN"] },
  { titulo: "Completo y abajo", prefijos: ["VES", "CON", "ENT", "PAN", "JEA", "FAL", "SHO", "TBA"] },
  { titulo: "Encima y más", prefijos: null },
];

/* ---------------- La cabecera con cuenta ---------------- */

type Enlace = { href: string; cuantas: number };
export type DatosCabecera = {
  inicio: string;
  nuevo: Enlace;
  vendidos: Enlace;
  ofertas: Enlace;
  /** El menú «Ropa» de la computadora: hasta tres columnas, solo las que tienen algo. */
  columnas: { titulo: string; categorias: { clave: string; nombre: string; cuantas: number; href: string }[] }[];
  /** El menú del celular: todas las categorías. */
  categorias: { clave: string; nombre: string; href: string }[];
  /** La tarjeta «Lo nuevo» del menú «Ropa»: la prenda que llegó hace menos. */
  destacada: { href: string; nombre: string; foto: string | null; optimizar: boolean; forma: Forma; color: string | null } | null;
  /** El buscador: todo lo publicado (en la tienda elegida). */
  indice: ItemBusqueda[];
  /** Con el buscador vacío, las categorías para tocar. */
  sugerencias: string[];
};

/** Lo que la cabecera necesita, del catálogo ya leído y filtrado por la tienda elegida (`sede`: su clave, o null con «Todas»). */
export function datosDeCabecera(prendas: readonly Prenda[], sede: string | null, origenFotos: string | undefined): DatosCabecera {
  const lista = (l: "nuevo" | "vendidos" | "ofertas") => hrefLista({ sede, categoria: null, orden: "destacado", lista: l });
  const categorias = categoriasDelInicio(prendas);
  const enAlguna = new Set(COLUMNAS.flatMap((c) => c.prefijos ?? []));
  const hrefCategoria = (clave: string) => hrefLista({ sede, categoria: clave, orden: "destacado" });
  const nueva = prendas.filter((p) => p.nuevo).sort(porLlegada)[0] ?? null;
  const fotoNueva = nueva ? fotosDeTarjeta(nueva)[0] : null;
  return {
    inicio: sede ? `/inicio?sede=${encodeURIComponent(sede)}` : "/inicio",
    nuevo: { href: lista("nuevo"), cuantas: prendas.filter((p) => p.nuevo).length },
    vendidos: { href: lista("vendidos"), cuantas: prendas.filter((p) => p.vendidos !== null).length },
    ofertas: { href: lista("ofertas"), cuantas: prendas.filter(enOferta).length },
    columnas: COLUMNAS.map((c) => ({
      titulo: c.titulo,
      categorias: categorias
        .filter((x) => (c.prefijos ? c.prefijos.includes(x.clave) : !enAlguna.has(x.clave)))
        .map((x) => ({ clave: x.clave, nombre: x.nombre, cuantas: x.cuantas, href: hrefCategoria(x.clave) })),
    })).filter((c) => c.categorias.length > 0),
    categorias: categorias.map((x) => ({ clave: x.clave, nombre: x.nombre, href: hrefCategoria(x.clave) })),
    destacada: nueva
      ? {
          href: hrefDePrenda(nueva, sede),
          nombre: nueva.nombre,
          foto: fotoNueva,
          optimizar: fotoNueva ? fotoOptimizable(fotoNueva, origenFotos) : false,
          forma: formaDe(nueva.categoria?.prefijo),
          color: colorDeDibujo(nueva),
        }
      : null,
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
