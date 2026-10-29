// Ver las existencias de una prenda con la cámara de Vender (2026-10-28, pedido de Felipe).
//
// La cámara tiene dos modos. «Al ticket» es el de siempre: cada etiqueta que lee entra al ticket (`alEscanear` en
// `PuntoDeVenta`). «Existencias» NO agrega nada: lee la misma etiqueta y responde lo que se pregunta con la prenda en la
// mano — «¿qué más hay de esta prenda, en piso y en almacén?». Para eso se reconoce la etiqueta con el mismo camino de
// siempre (`resolverCodigoV2`, código exacto o nada) y se juntan, con las piezas que ya agrupan la grilla de Vender
// (`agruparPorPrenda`), TODOS los colores y tallas de esa prenda.
//
// Sin DOM ni React: se prueba sola. La pantalla (`EscanerCamara`) solo pinta lo que sale de aquí, y como el stock de Vender se
// relee solo (`useStockEnVivo`), la hoja guarda el CÓDIGO leído y vuelve a preguntar en cada pintada: lo que muestra es el
// stock de ahora, no el de cuando se leyó.

import { resolverCodigoV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";
import { agruparPorPrenda, type VarianteAgrupable } from "./catalogo-grupos";

/** Lo mínimo que se pide de una variante de Vender (`VarianteBusqueda` lo cumple): para reconocerla y para contarla. */
export type VarianteConsultable = PrendaBuscableV2 &
  VarianteAgrupable & {
    colorHex?: string | null;
    /** Prefijo y familia de la categoría: dibujan su ícono cuando la prenda no tiene foto (ADR-0333). Ausentes = la percha. */
    categoriaPrefijo?: string | null;
    categoriaFamilia?: string | null;
    /** Lo apartado para clientes en el piso de esta sede: sigue en el piso pero no se puede vender. Ausente = 0. */
    apartadoAqui?: number | null;
  };

export type TallaConsultada = {
  varianteId: string;
  /** «M», «32», «Única». */
  talla: string;
  /** Lo que se puede vender hoy desde el piso (sin lo apartado). */
  piso: number;
  /** Lo guardado en el almacén de esta sede; `null` si la sede no tiene almacén (el Taller). */
  almacen: number | null;
  /** Lo apartado para un cliente: sigue en el piso, pero no se vende. */
  apartado: number;
  /** Es la talla de la etiqueta que se leyó. */
  leida: boolean;
};

export type ColorConsultado = {
  clave: string;
  /** El nombre del color; `null` si la variante no lo trae. */
  nombre: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  tallas: TallaConsultada[];
  piso: number;
  almacen: number | null;
  apartado: number;
  /** Es el color de la etiqueta que se leyó. */
  leido: boolean;
  /** Ni en el piso, ni en el almacén, ni apartado: el chip del color se apaga. */
  sinExistencias: boolean;
};

export type ExistenciasDeLaPrenda = {
  tipo: "prenda";
  codigo: string;
  referencia: string;
  /** La categoría de la prenda, en los nombres que lee `categoriaDe`: su miniatura sin foto es el ícono de esta categoría. */
  categoria: { categoria: string | null; categoriaPrefijo: string | null; categoriaFamilia: string | null };
  /** La sede separa piso y almacén (una tienda). El Taller no: ahí hay una sola cifra por talla. */
  separaPiso: boolean;
  /** El color de la etiqueta primero (es el que se está mirando); los demás, por nombre. */
  colores: ColorConsultado[];
};

export type ResultadoConsulta = ExistenciasDeLaPrenda | { tipo: "no-encontrada"; codigo: string };

const noNegativo = (n: number | null | undefined) => Math.max(0, n ?? 0);

/**
 * Lo que se sabe de la prenda de una etiqueta: todos sus colores y tallas con lo que hay en el piso, en el almacén y
 * apartado. Es solo lectura: no toca el ticket ni el stock. Una etiqueta que no es de ninguna variante de esta tienda
 * (o una pieza de liquidación, que es una sola prenda suelta y no tiene variaciones) responde `no-encontrada`.
 */
export function consultarExistencias<T extends VarianteConsultable>(codigo: string, variantes: T[]): ResultadoConsulta {
  const leida = resolverCodigoV2(codigo, variantes);
  if (!leida) return { tipo: "no-encontrada", codigo: codigo.trim() };
  // La grilla agrupa por referencia: la misma prenda que ve la encargada en Vender, con las mismas tallas.
  const prenda = agruparPorPrenda(variantes.filter((v) => v.referencia === leida.referencia))[0];
  if (!prenda) return { tipo: "no-encontrada", codigo: codigo.trim() };
  const separaPiso = prenda.separaPiso;

  const colores = prenda.colores.map<ColorConsultado>((g) => {
    const tallas = g.tallas.map<TallaConsultada>((t) => ({
      varianteId: t.variante.varianteId,
      talla: t.talla,
      piso: noNegativo(t.stockAqui),
      almacen: separaPiso ? noNegativo(t.almacenAqui) : null,
      apartado: noNegativo(t.variante.apartadoAqui),
      leida: t.variante.varianteId === leida.varianteId,
    }));
    const piso = tallas.reduce((s, t) => s + t.piso, 0);
    const almacen = separaPiso ? tallas.reduce((s, t) => s + (t.almacen ?? 0), 0) : null;
    const apartado = tallas.reduce((s, t) => s + t.apartado, 0);
    return {
      clave: g.clave,
      nombre: g.color,
      // Todas las tallas de un color comparten el hex; si a una le falta el dato, vale el de otra.
      colorHex: g.tallas.find((t) => t.variante.colorHex)?.variante.colorHex ?? null,
      fotoUrl: g.fotoUrl,
      tallas,
      piso,
      almacen,
      apartado,
      leido: tallas.some((t) => t.leida),
      sinExistencias: piso + (almacen ?? 0) + apartado === 0,
    };
  });

  // El de la etiqueta primero: es lo que se mira al abrir la hoja, y la fila de colores no tiene que esconderlo.
  const ordenados = [...colores.filter((c) => c.leido), ...colores.filter((c) => !c.leido)];
  return {
    tipo: "prenda",
    codigo: codigo.trim(),
    referencia: prenda.referencia,
    categoria: { categoria: leida.categoria, categoriaPrefijo: leida.categoriaPrefijo ?? null, categoriaFamilia: leida.categoriaFamilia ?? null },
    separaPiso,
    colores: ordenados,
  };
}

/**
 * La respuesta de una talla en dos o tres palabras, para el chip de la hoja. No es un semáforo: ámbar es «de esta no hay
 * para vender desde el piso» (agotada, o solo en el almacén) y el texto dice cuál; verde, que se puede vender ya.
 */
export function veredictoDeLaTalla(t: TallaConsultada, separaPiso: boolean): { tono: "verde" | "ambar" | "pizarra"; texto: string } {
  if (t.piso > 0) return { tono: "verde", texto: separaPiso ? "En piso" : "Hay aquí" };
  if ((t.almacen ?? 0) > 0) return { tono: "ambar", texto: "Solo en almacén" };
  if (t.apartado > 0) return { tono: "pizarra", texto: "Apartada" };
  return { tono: "ambar", texto: "Agotada aquí" };
}

/** La frase para el lector de pantalla de una talla (la hoja la pinta como una columna de números): «Talla M: 2 en piso, 1 en almacén». */
export function frasePorTalla(t: TallaConsultada): string {
  const partes = [`${t.piso} en piso`];
  if (t.almacen !== null) partes.push(`${t.almacen} en almacén`);
  if (t.apartado > 0) partes.push(`${t.apartado} apartadas`);
  return `Talla ${t.talla}: ${partes.join(", ")}`;
}
