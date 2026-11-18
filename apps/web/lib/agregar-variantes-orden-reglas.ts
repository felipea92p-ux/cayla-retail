import type { ColorAlta } from "./alta-producto";
import type { CategoriaDeModelo, TallaDeCategoria } from "./modelo-nuevo-reglas";
import { TALLA_ESTANDAR, TALLA_UNICA } from "./prenda-sin-registrar-reglas";
import { compararTallas } from "./tallas";

// «+ Talla» y «+ Color» en la matriz de Nueva orden (Felipe, 2026-10-31): un modelo que ya existe puede ganar tallas y colores sin pasar por Catálogo ▸ Editar producto.
// La base lo hace (`agregar_variantes_a_modelo`, 20261031172000) y vuelve a comprobar todo lo que acá se anticipa: esto solo decide qué se OFRECE y qué se le dice a la
// persona. Puro: sin Supabase ni `next/headers`.

type VarianteDelModelo = { talla: string | null; color: string | null; colorCodigo?: string | null };

/** Lo que el modelo ya tiene en cada eje, tal como lo dibuja la tabla de la orden (los textos de talla y de color de sus variantes). */
export function ejesDelModelo(variantes: readonly VarianteDelModelo[]): { tallas: string[]; colores: string[]; sinTalla: boolean; sinColor: boolean } {
  const tallas = [...new Set(variantes.map((v) => v.talla).filter((t): t is string => !!t))].sort(compararTallas);
  const colores = [...new Set(variantes.map((v) => v.color).filter((c): c is string => !!c))];
  return { tallas, colores, sinTalla: variantes.some((v) => !v.talla), sinColor: variantes.some((v) => !v.color) };
}

/**
 * Una variante DESACTIVADA del modelo: no sale en la tabla de la orden, pero su combinación sigue ocupada (el índice único la reclama) y reactivarla es de Editar producto (/chaos 2026-10-31).
 * Una talla o un color con una de estas, en una combinación que la base crearía, no se ofrece: la base lo rechazaría entero («ya existe pero está desactivada»).
 */
export type VarianteDesactivada = VarianteDelModelo;

// La base cruza lo nuevo SOLO con los colores (o tallas) de las variantes ACTIVAS: una desactivada en otro color u otra talla no estorba, una desactivada que cae en ese cruce, sí.
function colorVendido(ejes: ReturnType<typeof ejesDelModelo>, color: string | null): boolean {
  return color ? ejes.colores.includes(color) : ejes.sinColor;
}
function tallaVendida(ejes: ReturnType<typeof ejesDelModelo>, talla: string | null): boolean {
  return talla ? ejes.tallas.includes(talla) : ejes.sinTalla;
}

function tallasSinFiltrar(categoria: CategoriaDeModelo | null, variantes: readonly VarianteDelModelo[]): TallaDeCategoria[] {
  if (!categoria) return [];
  const { tallas } = ejesDelModelo(variantes);
  const tiene = new Set(tallas);
  return categoria.tallas.filter((t) => !tiene.has(t.valor) && t.valor !== TALLA_UNICA && t.valor !== TALLA_ESTANDAR).sort((a, b) => compararTallas(a.valor, b.valor));
}

/** Los nombres de las tallas que faltan pero NO se ofrecen porque sus variantes están desactivadas (se reactivan desde Editar producto). */
export function tallasDesactivadas(categoria: CategoriaDeModelo | null, variantes: readonly VarianteDelModelo[], desactivadas: readonly VarianteDesactivada[] = []): string[] {
  const ejes = ejesDelModelo(variantes);
  return tallasSinFiltrar(categoria, variantes)
    .filter((t) => desactivadas.some((d) => d.talla === t.valor && colorVendido(ejes, d.color)))
    .map((t) => t.valor);
}

/** Las tallas que la categoría habilita y el modelo todavía no vende, en el orden de siempre (S · M · L). «Única» y «Estándar» no son una talla más: marcan una prenda de una sola medida y no se mezclan con S · M · L. Las que tienen una variante desactivada no se ofrecen. */
export function tallasQueFaltan(categoria: CategoriaDeModelo | null, variantes: readonly VarianteDelModelo[], desactivadas: readonly VarianteDesactivada[] = []): TallaDeCategoria[] {
  const bloqueadas = new Set(tallasDesactivadas(categoria, variantes, desactivadas));
  return tallasSinFiltrar(categoria, variantes).filter((t) => !bloqueadas.has(t.valor));
}

function coloresSinFiltrar(colores: readonly ColorAlta[], variantes: readonly VarianteDelModelo[]): ColorAlta[] {
  const tiene = new Set(variantes.map((v) => v.colorCodigo).filter((c): c is string => !!c));
  return colores.filter((c) => !tiene.has(c.codigo));
}

/** Los colores que faltan pero NO se ofrecen porque tienen una variante desactivada en una talla que el modelo vende. */
export function coloresDesactivados(colores: readonly ColorAlta[], variantes: readonly VarianteDelModelo[], desactivadas: readonly VarianteDesactivada[] = []): ColorAlta[] {
  const ejes = ejesDelModelo(variantes);
  return coloresSinFiltrar(colores, variantes).filter((c) => desactivadas.some((d) => d.colorCodigo === c.codigo && tallaVendida(ejes, d.talla)));
}

/** Los colores del vocabulario que el modelo todavía no vende (por código: el nombre visible se renombra), menos los que tienen una variante desactivada. */
export function coloresQueFaltan(colores: readonly ColorAlta[], variantes: readonly VarianteDelModelo[], desactivadas: readonly VarianteDesactivada[] = []): ColorAlta[] {
  const bloqueados = new Set(coloresDesactivados(colores, variantes, desactivadas).map((c) => c.codigo));
  return coloresSinFiltrar(colores, variantes).filter((c) => !bloqueados.has(c.codigo));
}

export type PuedeAgregar = { puede: true } | { puede: false; motivo: string };

const SIN_PERMISO = "Agregar una talla o un color es de quien edita el catálogo: pídeselo.";

/**
 * ¿Se ofrece «+ Talla» y, si no, por qué (lo que dice el botón apagado)? La base decide de verdad: quien opera el Taller y edita el catálogo. Una prenda en talla única o sin tallas
 * no recibe una (mezclaría «Única» con tallas), y sin la lista de tallas de la categoría no hay qué ofrecer.
 */
export function puedeAgregarTalla(o: { puedeEditarCatalogo: boolean; categoria: CategoriaDeModelo | null; variantes: readonly VarianteDelModelo[]; desactivadas?: readonly VarianteDesactivada[] }): PuedeAgregar {
  if (!o.puedeEditarCatalogo) return { puede: false, motivo: SIN_PERMISO };
  if (o.variantes.length === 0) return { puede: false, motivo: "Este modelo no tiene variantes todavía." };
  if (ejesDelModelo(o.variantes).sinTalla) return { puede: false, motivo: "Este modelo se vende en talla única: no se le agrega una talla." };
  if (!o.categoria) return { puede: false, motivo: "No se pudo leer las tallas de la categoría. Actualiza la pantalla." };
  if (tallasQueFaltan(o.categoria, o.variantes, o.desactivadas).length === 0) {
    const apagadas = tallasDesactivadas(o.categoria, o.variantes, o.desactivadas);
    if (apagadas.length > 0) return { puede: false, motivo: `Las tallas que faltan (${lista(apagadas)}) están desactivadas en este modelo: se reactivan desde Editar producto.` };
    return { puede: false, motivo: "El modelo ya tiene todas las tallas de su categoría." };
  }
  return { puede: true };
}

/** ¿Se ofrece «+ Color»? Un modelo «Sin color» no recibe uno (mezclaría «Sin color» con color: la base lo frena), y sin la lista de colores no hay qué ofrecer. */
export function puedeAgregarColor(o: { puedeEditarCatalogo: boolean; hayColores: boolean; variantes: readonly VarianteDelModelo[] }): PuedeAgregar {
  if (!o.puedeEditarCatalogo) return { puede: false, motivo: SIN_PERMISO };
  if (o.variantes.length === 0) return { puede: false, motivo: "Este modelo no tiene variantes todavía." };
  if (ejesDelModelo(o.variantes).sinColor) return { puede: false, motivo: "Este modelo no tiene color: no se le agrega uno aquí." };
  if (!o.hayColores) return { puede: false, motivo: "No se pudo leer la lista de colores. Actualiza la pantalla." };
  return { puede: true };
}

const lista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const PIE = "con el precio y el costo del modelo y sin stock.";
const prendas = (n: number) => `${n} ${n === 1 ? "prenda nueva" : "prendas nuevas"}`;

/** «Se crean las tallas L y XL en Gris perla y Nude: 4 prendas nuevas, con el precio y el costo del modelo y sin stock.» Una por cada color del modelo (una sola si no tiene color). */
export function fraseDeLasTallasNuevas(nuevas: readonly string[], variantes: readonly VarianteDelModelo[]): string {
  const { colores } = ejesDelModelo(variantes);
  const donde = colores.length > 0 ? ` en ${lista(colores)}` : "";
  return `${nuevas.length === 1 ? `Se crea la talla ${nuevas[0]}` : `Se crean las tallas ${lista(nuevas)}`}${donde}: ${prendas(nuevas.length * Math.max(colores.length, 1))}, ${PIE}`;
}

/** «Se crea el color Nude en S, M y L: 3 prendas nuevas, con el precio y el costo del modelo y sin stock.» Una por cada talla del modelo (una sola si no tiene talla). */
export function fraseDeLosColoresNuevos(nuevos: readonly string[], variantes: readonly VarianteDelModelo[]): string {
  const { tallas } = ejesDelModelo(variantes);
  const donde = tallas.length > 0 ? ` en ${lista(tallas)}` : "";
  return `${nuevos.length === 1 ? `Se crea el color ${nuevos[0]}` : `Se crean los colores ${lista(nuevos)}`}${donde}: ${prendas(nuevos.length * Math.max(tallas.length, 1))}, ${PIE}`;
}
