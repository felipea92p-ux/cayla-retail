// El prefiltro de «Nueva orden de compra» (Felipe 2026-10-21; informe `docs/pantallas/compras-ordenes-nueva.md`, tarea #6): con el
// proveedor elegido, las categorías y las marcas ofrecen PRIMERO (y solas) las que ese proveedor maneja, con «Ver todas (N)» al pie.
// Lógica pura: sin I/O ni React; la pantalla es `components/ordenes-compra/NuevaOrdenCompra.tsx`.
//
// QUÉ ES «LAS QUE MANEJA». Las marcas, las que tiene vinculadas (`marca_proveedores`). Las categorías, las que sale de su historial
// (`fn_proveedor_categorias`: sus productos, las marcas de un solo proveedor, sus órdenes vigentes y sus comprobantes): no hay un
// vínculo proveedor↔categoría escrito a mano, y guardar una orden ES el recuerdo de que ahora la maneja.
//
// QUÉ NO ES. Nunca un candado: la orden no toca el catálogo y acepta cualquier categoría y marca (ADR-0362:503), así que «Ver todas»
// siempre está, y un proveedor sin nada derivado (nuevo, o aún sin historial) ve TODO. Lo ya elegido en una línea nunca desaparece
// de la lista aunque quede fuera del conjunto: el combo se vería vacío mientras la guía da la línea por hecha.

import type { Vinculo } from "./marcas";

/** Lo que un proveedor maneja. */
export type Afinidad = { categorias: ReadonlySet<string>; marcas: ReadonlySet<string> };

/** Los pares (proveedor → categorías) tal como los devuelve `fn_proveedor_categorias`. `null` = no se pudieron leer. */
export type CategoriasPorProveedor = Readonly<Record<string, readonly string[]>>;

/**
 * Lo que maneja el proveedor elegido. `null` si no hay proveedor o si no se pudo leer lo de las categorías (la web se publicó antes
 * que la migración, o la base no respondió): entonces no se filtra NADA, ni las marcas (la pantalla se ve como siempre).
 */
export function afinidadDe(proveedorId: string, categoriasDeProveedor: CategoriasPorProveedor | null | undefined, vinculos: readonly Vinculo[]): Afinidad | null {
  if (!proveedorId || !categoriasDeProveedor) return null;
  return {
    categorias: new Set(categoriasDeProveedor[proveedorId] ?? []),
    marcas: new Set(vinculos.filter((v) => v.proveedorId === proveedorId).map((v) => v.marcaId)),
  };
}

export type Prefiltro<T> = {
  /** Lo que se ofrece ahora. */
  opciones: T[];
  /** Cuántas hay en total (el N de «Ver todas (N)»). */
  total: number;
  /** `true` = hay opciones escondidas: la pantalla ofrece «Ver todas». */
  filtrada: boolean;
};

/**
 * Deja solo las opciones que el proveedor maneja (`propias`), más las que ya están elegidas en alguna línea (`conservar`). Sin filtro
 * —y por eso sin «Ver todas»— cuando no se sabe lo que maneja (`propias` null o vacío: proveedor nuevo o sin historial), cuando ya se
 * pidió ver todas, o cuando manejaría todas igual (nada que esconder).
 */
export function prefiltrar<T extends { valor: string }>(
  opciones: readonly T[],
  propias: ReadonlySet<string> | null,
  { verTodas, conservar }: { verTodas: boolean; conservar: ReadonlySet<string> },
): Prefiltro<T> {
  const total = opciones.length;
  if (!propias || propias.size === 0 || verTodas) return { opciones: [...opciones], total, filtrada: false };
  const mostradas = opciones.filter((o) => propias.has(o.valor) || conservar.has(o.valor));
  return { opciones: mostradas, total, filtrada: mostradas.length < total };
}

/**
 * La línea que explica POR QUÉ se ve todo, solo cuando es por no saber: un proveedor sin nada derivado. Un proveedor con algo no lleva
 * texto (el pie «Ver todas (N)» del combo ya lo dice). `null` si no hay nada que decir.
 */
export function textoDeAfinidad(afinidad: Afinidad | null): string | null {
  if (!afinidad) return null;
  const sinCategorias = afinidad.categorias.size === 0;
  const sinMarcas = afinidad.marcas.size === 0;
  if (sinCategorias && sinMarcas) return "Es la primera vez con este proveedor: ves todas las categorías y marcas.";
  if (sinCategorias) return "Todavía no sabemos qué categorías maneja este proveedor: ves todas.";
  if (sinMarcas) return "Este proveedor no tiene marcas registradas: ves todas.";
  return null;
}
