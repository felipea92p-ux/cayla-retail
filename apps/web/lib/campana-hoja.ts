// La hoja «Configuración» de una campaña (ADR-0488): lo que su formulario calcula para mostrarse, sin React ni red. Las reglas de
// lo que se acepta guardar NO viven aquí: son las de `etiqueta-campana.ts` (`parsearDescuento`) y las cierra la base.

import { parsearDescuento } from "./etiqueta-campana";
import { diasEntreFechas } from "./fechas-lima";
import { sinTildes } from "./marcas";

/** Cuánto sube o baja el descuento cada toque de − o + en la hoja. */
export const PASO_DESCUENTO = 5;

/**
 * El descuento después de un toque de − o +: de 5 en 5, hasta el múltiplo de 5 más cercano (12,5 % con + va a 20 %, con − a 10 %),
 * entre 0 y 100. Cero es «sin descuento» y se devuelve vacío, como lo escribe la hoja. Lo mal escrito cuenta como cero: el toque
 * deja un número que sí se puede guardar.
 */
export function pasoDeDescuento(texto: string, delta: number): string {
  const actual = parsearDescuento(texto);
  const v = actual.ok && actual.valor !== null ? actual.valor : 0;
  const n = Math.max(0, Math.min(100, Math.round((v + delta) / PASO_DESCUENTO) * PASO_DESCUENTO));
  return n === 0 ? "" : String(n);
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const diaDeSemana = (iso: string) => DIAS_SEMANA[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/**
 * Cuánto dura la temporada, dicho como se dice en tienda: «25 días, de jueves a domingo» (las dos puntas cuentan; un solo día es
 * «1 día, el sábado»). `null` si falta una fecha o están al revés: eso ya lo dice el pie de «Hasta».
 */
export function textoDuracion(desde: string | null, hasta: string | null): string | null {
  if (!desde || !hasta || desde > hasta) return null;
  const dias = diasEntreFechas(desde, hasta) + 1;
  return dias === 1 ? `1 día, el ${diaDeSemana(desde)}` : `${dias} días, de ${diaDeSemana(desde)} a ${diaDeSemana(hasta)}`;
}

// ---- «Categorías»: la grilla de casillas por familia ----------------------------------------------------------------------------

export type FilaCategoria = { id: string; nombre: string; prendas: number };
export type GrupoCategorias = { familia: string; total: number; categorias: FilaCategoria[] };
export type CategoriasDeLaHoja = {
  /** Las familias con más de `FAMILIA_CHICA` categorías con prendas: cada una a lo ancho. */
  grandes: GrupoCategorias[];
  /** Las familias chicas (Bisutería, Empaque, Belleza): comparten una fila, una columna cada una. */
  chicas: GrupoCategorias[];
  /** Las categorías sin prendas a la venta, de todas las familias: se pueden elegir (les llegarán prendas), pero van plegadas. */
  sinPrendas: FilaCategoria[];
  /** La categoría con más prendas de TODAS (no solo de lo buscado): la barra de cada fila se mide contra ella y no cambia al buscar. */
  mayor: number;
  /** Cuántas categorías coinciden con lo buscado (todas, sin búsqueda). */
  coinciden: number;
};

/** Hasta cuántas categorías una familia es «chica» y comparte su fila con las otras chicas. */
export const FAMILIA_CHICA = 3;

const porPrendas = (a: FilaCategoria, b: FilaCategoria) => b.prendas - a.prendas || a.nombre.localeCompare(b.nombre, "es");

/**
 * Las categorías como las muestra la hoja: por familia, de la que más prendas trae a la que menos, y dentro de cada una de la
 * categoría que más trae a la que menos. Lo buscado filtra sin tildes ni mayúsculas por el nombre de la categoría o el de su familia
 * («accesorios» trae la familia entera). Solo ordena y filtra: qué se puede elegir no cambia.
 */
export function categoriasDeLaHoja(
  categorias: readonly { id: string; nombre: string; familia: string }[],
  prendasDe: ReadonlyMap<string, number>,
  busqueda = "",
): CategoriasDeLaHoja {
  const q = sinTildes(busqueda.trim());
  const coincide = (c: { nombre: string; familia: string }) => !q || sinTildes(c.nombre).includes(q) || sinTildes(c.familia).includes(q);
  const mayor = Math.max(0, ...categorias.map((c) => prendasDe.get(c.id) ?? 0));
  const familias = new Map<string, FilaCategoria[]>();
  const sinPrendas: FilaCategoria[] = [];
  let coinciden = 0;
  for (const c of categorias) {
    if (!coincide(c)) continue;
    coinciden++;
    const fila = { id: c.id, nombre: c.nombre, prendas: prendasDe.get(c.id) ?? 0 };
    if (fila.prendas === 0) sinPrendas.push(fila);
    else familias.set(c.familia, [...(familias.get(c.familia) ?? []), fila]);
  }
  const grupos = [...familias.entries()]
    .map(([familia, filas]) => ({ familia, total: filas.reduce((s, f) => s + f.prendas, 0), categorias: filas.sort(porPrendas) }))
    .sort((a, b) => b.total - a.total || a.familia.localeCompare(b.familia, "es"));
  return {
    grandes: grupos.filter((g) => g.categorias.length > FAMILIA_CHICA),
    chicas: grupos.filter((g) => g.categorias.length <= FAMILIA_CHICA),
    sinPrendas: sinPrendas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    mayor,
    coinciden,
  };
}
