import type { CategoriaDeModelo, TallaDeCategoria } from "./modelo-nuevo-reglas";
import { TALLA_ESTANDAR, TALLA_UNICA } from "./prenda-sin-registrar-reglas";
import { compararTallas } from "./tallas";

// «+ Talla» en la matriz de Nueva orden (Felipe, 2026-10-31): un modelo que ya existe puede ganar una talla sin pasar por Catálogo ▸ Editar producto. La base lo hace
// (`agregar_variantes_a_modelo`, 20261031172000) y vuelve a comprobar todo lo que acá se anticipa: esto solo decide qué se OFRECE y qué se le dice a la persona. Puro: sin
// Supabase ni `next/headers`.

type VarianteConTalla = { talla: string | null; color: string | null };

/** Lo que el modelo ya tiene en cada eje, tal como lo dibuja la tabla de la orden (los textos de talla y de color de sus variantes). */
export function ejesDelModelo(variantes: readonly VarianteConTalla[]): { tallas: string[]; colores: string[]; sinTalla: boolean; sinColor: boolean } {
  const tallas = [...new Set(variantes.map((v) => v.talla).filter((t): t is string => !!t))].sort(compararTallas);
  const colores = [...new Set(variantes.map((v) => v.color).filter((c): c is string => !!c))];
  return { tallas, colores, sinTalla: variantes.some((v) => !v.talla), sinColor: variantes.some((v) => !v.color) };
}

/** Las tallas que la categoría habilita y el modelo todavía no vende, en el orden de siempre (S · M · L). «Única» y «Estándar» no son una talla más: marcan una prenda de una sola medida y no se mezclan con S · M · L. */
export function tallasQueFaltan(categoria: CategoriaDeModelo | null, variantes: readonly VarianteConTalla[]): TallaDeCategoria[] {
  if (!categoria) return [];
  const { tallas } = ejesDelModelo(variantes);
  const tiene = new Set(tallas);
  return categoria.tallas.filter((t) => !tiene.has(t.valor) && t.valor !== TALLA_UNICA && t.valor !== TALLA_ESTANDAR).sort((a, b) => compararTallas(a.valor, b.valor));
}

export type PuedeAgregarTalla = { puede: true } | { puede: false; motivo: string };

/**
 * ¿Se ofrece «+ Talla» y, si no, por qué (lo que dice el botón apagado)? La base decide de verdad: quien opera el Taller y edita el catálogo. Una prenda en talla única o sin tallas
 * no recibe una (mezclaría «Única» con tallas), y sin la lista de tallas de la categoría no hay qué ofrecer.
 */
export function puedeAgregarTalla(o: { puedeEditarCatalogo: boolean; categoria: CategoriaDeModelo | null; variantes: readonly VarianteConTalla[] }): PuedeAgregarTalla {
  if (!o.puedeEditarCatalogo) return { puede: false, motivo: "Agregar una talla es de quien edita el catálogo: pídeselo." };
  if (o.variantes.length === 0) return { puede: false, motivo: "Este modelo no tiene variantes todavía." };
  if (ejesDelModelo(o.variantes).sinTalla) return { puede: false, motivo: "Este modelo se vende en talla única: no se le agrega una talla." };
  if (!o.categoria) return { puede: false, motivo: "No se pudo leer las tallas de la categoría. Actualiza la pantalla." };
  if (tallasQueFaltan(o.categoria, o.variantes).length === 0) return { puede: false, motivo: "El modelo ya tiene todas las tallas de su categoría." };
  return { puede: true };
}

/** Cuántas prendas nuevas nacen al agregar una talla: una por cada color del modelo (una sola si el modelo no tiene color). */
export function prendasQueNacen(variantes: readonly VarianteConTalla[]): number {
  return Math.max(ejesDelModelo(variantes).colores.length, 1);
}

const lista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** «Se crea la talla L en Gris perla, Gris piedra y Nude: 3 prendas nuevas, con el precio del modelo y sin stock.» */
export function fraseDeLaTallaNueva(talla: string, variantes: readonly VarianteConTalla[]): string {
  const { colores } = ejesDelModelo(variantes);
  const n = prendasQueNacen(variantes);
  const donde = colores.length > 0 ? ` en ${lista(colores)}` : "";
  return `Se crea la talla ${talla}${donde}: ${n} ${n === 1 ? "prenda nueva" : "prendas nuevas"}, con el precio y el costo del modelo y sin stock.`;
}
