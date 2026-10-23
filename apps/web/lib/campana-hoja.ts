// La hoja «Configuración» de una campaña (ADR-0488): lo que su formulario calcula para mostrarse, sin React ni red. Las reglas de
// lo que se acepta guardar NO viven aquí: son las de `etiqueta-campana.ts` (`parsearDescuento`) y las cierra la base.

import { parsearDescuento, type PrendaConCosto } from "./etiqueta-campana";
import { descuentoDeCampana, totalDeLineas } from "./vender-reglas";
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
export type GrupoCategorias = {
  familia: string;
  total: number;
  /** Las que se dibujan en el grupo: las que traen prendas y coinciden con lo buscado. */
  categorias: FilaCategoria[];
  /** TODAS las categorías de la familia, con prendas o sin ellas y coincidan o no con lo buscado: lo que marca «Toda la familia». */
  todas: string[];
};
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
 * («accesorios» trae la familia entera). Solo ordena y filtra: qué se puede elegir no cambia, y «Toda la familia» (`todas`) sigue siendo
 * toda aunque se busque o aunque alguna de sus categorías no tenga prendas todavía.
 */
export function categoriasDeLaHoja(
  categorias: readonly { id: string; nombre: string; familia: string }[],
  prendasDe: ReadonlyMap<string, number>,
  busqueda = "",
): CategoriasDeLaHoja {
  const q = sinTildes(busqueda.trim());
  const coincide = (c: { nombre: string; familia: string }) => !q || sinTildes(c.nombre).includes(q) || sinTildes(c.familia).includes(q);
  const mayor = Math.max(0, ...categorias.map((c) => prendasDe.get(c.id) ?? 0));
  const todasDe = new Map<string, string[]>();
  for (const c of categorias) todasDe.set(c.familia, [...(todasDe.get(c.familia) ?? []), c.id]);
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
    .map(([familia, filas]) => ({
      familia,
      total: filas.reduce((s, f) => s + f.prendas, 0),
      categorias: filas.sort(porPrendas),
      todas: todasDe.get(familia) ?? [],
    }))
    .sort((a, b) => b.total - a.total || a.familia.localeCompare(b.familia, "es"));
  return {
    grandes: grupos.filter((g) => g.categorias.length > FAMILIA_CHICA),
    chicas: grupos.filter((g) => g.categorias.length <= FAMILIA_CHICA),
    sinPrendas: sinPrendas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    mayor,
    coinciden,
  };
}

// ---- La etiqueta viva: el mosaico y «En caja» ----------------------------------------------------------------------------------

/** Cuántas piezas entran en el mosaico de la etiqueta: dos filas de seis. Con más, la última es «+N». */
export const CUPO_MOSAICO = 12;

/**
 * Las categorías elegidas como piezas del mosaico de la etiqueta: de la que más prendas trae a la que menos. Si no caben todas, la
 * última pieza dice «+N» (las que faltan), así el mosaico nunca necesita su propio scroll.
 */
export function piezasDelMosaico<C extends { id: string; nombre: string }>(
  categorias: readonly C[],
  elegidas: ReadonlySet<string>,
  prendasDe: ReadonlyMap<string, number>,
  cupo = CUPO_MOSAICO,
): { piezas: (C & { prendas: number })[]; mas: number } {
  const todas = categorias
    .filter((c) => elegidas.has(c.id))
    .map((c) => ({ ...c, prendas: prendasDe.get(c.id) ?? 0 }))
    .sort((a, b) => b.prendas - a.prendas || a.nombre.localeCompare(b.nombre, "es"));
  if (todas.length <= cupo) return { piezas: todas, mas: 0 };
  return { piezas: todas.slice(0, cupo - 1), mas: todas.length - (cupo - 1) };
}

export type EjemploDeCaja = { id: string; nombre: string; categoriaId: string | null; enSede: string | null; antes: number; despues: number };

/**
 * Prendas reales que la campaña alcanzaría, para ver en la etiqueta cuánto cobra la caja: una por categoría elegida (de la que más
 * prendas trae a la que menos) y, si no hay categorías, las marcadas a mano. El precio es el más bajo al que se cobra en las tiendas
 * (`PrendaConCosto.precio`) y el rebajado sale de la misma cuenta que la caja (`descuentoDeCampana`, en céntimos exactos).
 */
export function ejemplosDeCaja(
  prendas: readonly PrendaConCosto[],
  elegidas: ReadonlySet<string>,
  manuales: ReadonlySet<string>,
  prendasDe: ReadonlyMap<string, number>,
  pct: number | null,
  cupo = 6,
): EjemploDeCaja[] {
  const precioCon = (precio: number) => (pct ? totalDeLineas([{ cantidad: 1, precioUnitario: precio, descuentoUnitario: descuentoDeCampana(precio, pct) }]) : precio);
  const ejemplo = (p: PrendaConCosto): EjemploDeCaja => ({ id: p.id, nombre: p.nombre, categoriaId: p.categoriaId, enSede: p.enSede ?? null, antes: p.precio, despues: precioCon(p.precio) });
  const categorias = [...elegidas].sort((a, b) => (prendasDe.get(b) ?? 0) - (prendasDe.get(a) ?? 0));
  const porCategoria = categorias.flatMap((id) => {
    const p = prendas.find((x) => x.categoriaId === id);
    return p ? [ejemplo(p)] : [];
  });
  if (porCategoria.length) return porCategoria.slice(0, cupo);
  return prendas.filter((p) => manuales.has(p.id)).slice(0, cupo).map(ejemplo);
}

/** El nombre de una prenda en la etiqueta, sin su SKU: «Blusa Emma (BLU-0001-CAM-M)» → «Blusa Emma» (`PrendaConCosto.nombre` lo trae
 *  entre paréntesis al final; en una etiqueta angosta solo estorba). */
export const nombreSinSku = (nombre: string) => nombre.replace(/\s*\([^()]*\)\s*$/, "") || nombre;

// ---- «Guardar» una sola vez -------------------------------------------------------------------------------------------------------

/**
 * Un candado de un solo envío: mientras uno viaja, los clics de más (o un Enter) no mandan otro. Lo pidió /chaos (2026-10-23, DC-01):
 * tres clics en el mismo instante mandaban tres pedidos iguales, porque `guardando` de React todavía no había apagado el botón. Si el
 * envío falla, el candado se suelta y se puede reintentar.
 */
export function unSoloEnvio(): (enviar: () => Promise<void>) => Promise<void> {
  let enCurso = false;
  return async (enviar) => {
    if (enCurso) return;
    enCurso = true;
    try {
      await enviar();
    } finally {
      enCurso = false;
    }
  };
}
