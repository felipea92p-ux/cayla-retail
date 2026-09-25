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

const FALTA: Record<PasoPrenda, string> = {
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
  return paso ? FALTA[paso] : null;
}

type Talla = { id: string; valor: string };

/** Lo que el modal «Prenda sin registrar» necesita para elegir (lo arma `vender/page.tsx` en el servidor). */
export type ListasPrendaLibre = {
  categorias: { id: string; nombre: string }[];
  /** Todas las tallas aprobadas: la reserva para una categoría sin tallas configuradas. */
  tallas: Talla[];
  /** `categoria_tallas` por id de categoría (`getEjesPorCategoria().tallas`). */
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
  colores: ColorAlta[];
  /** Cuántas prendas del catálogo hay de cada color en cada categoría (`usoDeColores`). */
  usoColores: Record<string, Record<string, number>>;
};

/** Las tallas que ofrece la categoría (`categoria_tallas`, vía `getEjesPorCategoria`), en el orden de la grilla.
 *  Una categoría todavía sin tallas configuradas ofrece todas: la venta no se traba por una configuración pendiente. */
export function tallasDeCategoria(deLaCategoria: readonly { id: string; texto: string }[] | undefined, todas: readonly Talla[]): Talla[] {
  const lista = deLaCategoria && deLaCategoria.length > 0 ? deLaCategoria.map((t) => ({ id: t.id, valor: t.texto })) : [...todas];
  return lista.sort((a, b) => ordenTalla(a.valor, b.valor));
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

export type OpcionColor = { valor: string; texto: string; detalle: string; hex: string | null };

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
    ...frecuentes.map((c) => ({ valor: c.codigo, texto: c.nombre, detalle: "Más usado", hex: c.hex })),
    ...grupos.flatMap((g) =>
      g.colores.filter((c) => !yaPuestos.has(c.codigo)).map((c) => ({ valor: c.codigo, texto: c.nombre, detalle: g.texto, hex: c.hex })),
    ),
  ];
}

/** La descripción que se le propone a caja (formato elegido por Felipe, 2026-09-23): «Pantalones · Negro · Talla 28».
 *  Sin concordancia a propósito: el sistema no conoce el singular ni el género de cada categoría. */
export function sugerirDescripcion(categoria: string | null, color: string | null, talla: string | null): string | null {
  if (!categoria || !color || !talla) return null;
  return `${categoria} · ${color} · Talla ${talla}`;
}
