// Lo mínimo que caja anota de una prenda que todavía no está en el sistema (ADR-0179): con esto
// almacén la reconoce después y la regulariza. `registrar_venta` exige lo mismo en la base.
import { ordenarColores, type ColorAlta } from "./alta-producto";
import { ordenTalla } from "./catalogo-grupos";
import { FAMILIAS_COLOR } from "./colores-familias";

export type DatosPrendaSinRegistrar = {
  descripcion: string;
  categoriaId: string;
  tallaId: string;
  colorCodigo: string;
  precio: number;
};

export const FALTA_DESCRIPCION = "Escribe una descripción corta";

/** Los pasos del modal, en el orden en que se ven en pantalla. */
export type PasoPrenda = "categoria" | "talla" | "color" | "descripcion" | "precio";

export const FALTA_POR_PASO: Record<PasoPrenda, string> = {
  categoria: "Elige la categoría",
  talla: "Elige la talla",
  color: "Elige el color",
  descripcion: FALTA_DESCRIPCION,
  precio: "Escribe el precio que cobraste",
};

/**
 * El primer paso sin llenar, en el orden del formulario; `null` si ya se puede agregar al ticket. Es la ruta que el
 * modal le marca a la colaboradora (Felipe, 2026-09-25). `sinDescripcion`: saltarla (el modal la pide bajo su campo).
 */
export function pasoSiguiente(d: Partial<DatosPrendaSinRegistrar>, { sinDescripcion = false } = {}): PasoPrenda | null {
  if (!d.categoriaId) return "categoria";
  if (!d.tallaId) return "talla";
  if (!d.colorCodigo) return "color";
  if (!sinDescripcion && !d.descripcion?.trim()) return "descripcion";
  if (!d.precio || !(d.precio > 0)) return "precio";
  return null;
}

/** El primer dato que falta, dicho a la colaboradora; `null` si ya se puede agregar al ticket. */
export function faltaEnPrendaSinRegistrar(d: Partial<DatosPrendaSinRegistrar>, opciones: { sinDescripcion?: boolean } = {}): string | null {
  const paso = pasoSiguiente(d, opciones);
  return paso ? FALTA_POR_PASO[paso] : null;
}

export type Talla = { id: string; valor: string };

/** Lo que el modal «Prenda sin registrar» necesita para elegir (lo arma `vender/page.tsx` en el servidor). */
export type ListasPrendaLibre = {
  /** `prefijo` y `familia` dibujan el ícono de la categoría (`IconoCategoria`, por prefijo, nunca por nombre). */
  categorias: { id: string; nombre: string; prefijo: string | null; familia: string | null }[];
  /** Todas las tallas aprobadas: la reserva si `categoria_tallas` no cargó, y de donde sale «Única». */
  tallas: Talla[];
  /** `categoria_tallas` por id de categoría (`getEjesPorCategoria().tallas`); `null` si no cargó. */
  tallasPorCategoria: Record<string, { id: string; texto: string }[]> | null;
  /** Las tallas «habituales» de cada categoría (`categoria_tallas.habitual`, la curva de siempre: S M L, 28 30 32…). */
  habitualesPorCategoria: Record<string, string[]>;
  colores: ColorAlta[];
  /** Cuántas prendas del catálogo hay de cada color en cada categoría (`usoDeColores`). */
  usoColores: Record<string, Record<string, number>>;
};

export const TALLA_UNICA = "Única";
export const TALLA_ESTANDAR = "Estándar";

/** Las tallas que ofrece la categoría (`categoria_tallas`, vía `getEjesPorCategoria`), en el orden de la grilla.
 *  Una categoría sin tallas configuradas ofrece solo «Única»: nunca una talla ajena a la categoría (una blusa con talla 38
 *  de zapato), y la venta no se traba; almacén la corrige al regularizar (Felipe, 2026-10-01). Si `categoria_tallas` ni
 *  siquiera cargó (`cargo = false`), se ofrecen todas: la caja no se cae por una lista secundaria (principio 9). */
export function tallasDeCategoria(deLaCategoria: readonly { id: string; texto: string }[] | undefined, todas: readonly Talla[], cargo = true): Talla[] {
  const lista =
    deLaCategoria && deLaCategoria.length > 0
      ? deLaCategoria.map((t) => ({ id: t.id, valor: t.texto }))
      : cargo
        ? todas.filter((t) => t.valor === TALLA_UNICA)
        : [...todas];
  return lista.sort((a, b) => ordenTalla(a.valor, b.valor));
}

/** Las tallas de una categoría como las dibuja el modal: la que se pone sola si es la única, las habituales (la curva de
 *  siempre) adelante, las otras de la categoría después, y «Estándar» aparte para que no se lea como una talla de letra. */
export type GruposDeTallas = { unica: Talla | null; habituales: Talla[]; otras: Talla[]; estandar: Talla | null };

export function gruposDeTallas(tallas: readonly Talla[], habituales: readonly string[] | undefined): GruposDeTallas {
  if (tallas.length === 1) return { unica: tallas[0]!, habituales: [], otras: [], estandar: null };
  const estandar = tallas.find((t) => t.valor === TALLA_ESTANDAR) ?? null;
  const resto = tallas.filter((t) => t !== estandar);
  // Sin curva habitual configurada, todas van adelante: no hay a cuál bajarle el tono.
  const hab = new Set(habituales ?? []);
  const sinCurva = !resto.some((t) => hab.has(t.id));
  return {
    unica: null,
    habituales: sinCurva ? resto : resto.filter((t) => hab.has(t.id)),
    otras: sinCurva ? [] : resto.filter((t) => !hab.has(t.id)),
    estandar,
  };
}

/** Cuántas prendas del catálogo hay de cada color en cada categoría (por id de categoría y código de color).
 *  El catálogo de Vender trae nombres; aquí se traducen a ids con las listas del modal. */
export function usoDeColores(
  variantes: readonly { categoria: string | null; color: string | null }[],
  categorias: readonly { id: string; nombre: string }[],
  colores: readonly { codigo: string; nombre: string }[],
): Record<string, Record<string, number>> {
  const idCategoria = new Map(categorias.map((c) => [c.nombre, c.id]));
  const codigoColor = new Map(colores.map((c) => [c.nombre, c.codigo]));
  const uso: Record<string, Record<string, number>> = {};
  for (const v of variantes) {
    const cat = v.categoria ? idCategoria.get(v.categoria) : undefined;
    const col = v.color ? codigoColor.get(v.color) : undefined;
    if (!cat || !col) continue;
    const porColor = (uso[cat] ??= {});
    porColor[col] = (porColor[col] ?? 0) + 1;
  }
  return uso;
}

export type OpcionColor = { valor: string; texto: string; detalle: string; hex: string | null; claves?: readonly string[] };

/** Colores para el modal, como en «Nuevo producto» (`ordenarColores`): primero los que ya se usan en la categoría
 *  (el más usado arriba) y después el resto, agrupados por familia. No se esconde ninguno: una prenda nueva puede
 *  traer un color que la categoría nunca tuvo (decisión de Felipe, 2026-09-23). */
export function opcionesDeColor(
  colores: readonly ColorAlta[],
  usoEnCategoria: Record<string, number> | undefined,
): OpcionColor[] {
  const { frecuentes, grupos } = ordenarColores([...colores], usoEnCategoria ?? {}, FAMILIAS_COLOR, colores.length);
  const yaPuestos = new Set(frecuentes.map((c) => c.codigo));
  return [
    ...frecuentes.map((c) => ({ valor: c.codigo, texto: c.nombre, detalle: "Más usado", hex: c.hex, claves: c.sinonimos })),
    ...grupos.flatMap((g) =>
      g.colores.filter((c) => !yaPuestos.has(c.codigo)).map((c) => ({ valor: c.codigo, texto: c.nombre, detalle: g.texto, hex: c.hex, claves: c.sinonimos })),
    ),
  ];
}

/** La descripción que se le propone a caja (formato elegido por Felipe, 2026-09-23): «Pantalones · Negro · Talla 28».
 *  Sin concordancia a propósito: el sistema no conoce el singular ni el género de cada categoría. */
export function sugerirDescripcion(categoria: string | null, color: string | null, talla: string | null): string | null {
  if (!categoria || !color || !talla) return null;
  return `${categoria} · ${color} · Talla ${talla}`;
}

/** Deja solo un precio que se pueda escribir en «Precio cobrado»: dígitos y un punto (la coma del teclado del celular
 *  cuenta como punto), con hasta dos decimales. Reemplaza al teclado de pantalla (spike del Punto de venta, 2026-09-26). */
export function precioEscribible(texto: string): string {
  const limpio = texto.replace(",", ".").replace(/[^0-9.]/g, "");
  const [entero, ...resto] = limpio.split(".");
  return resto.length === 0 ? entero : `${entero}.${resto.join("").slice(0, 2)}`;
}
