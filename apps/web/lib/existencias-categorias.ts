import { calcularVelocidad, type FilaResumen } from "@/lib/resumen-reglas";

/** Lo único de `FilaResumen` que usa Existencias con la semana (tabla, overlay de categorías y «Disponible total»).
 *  Viaja al navegador —1.269 filas en TRU—, así que se recorta en el servidor: la fila entera trae ~45 campos
 *  y pesaba más de 1 MB de la página (medido 2026-09-23). */
export type FilaSemana = Pick<
  FilaResumen,
  | "varianteId" | "referencia" | "categoriaId" | "categoria" | "sku" | "talla" | "color" | "colorHex" | "fotoUrl"
  | "precio" | "costo" | "utilizable" | "stockInicial"
  // Lo que pide `calcularVelocidad` para el ritmo de 7 días.
  | "ventas" | "devoluciones" | "diasConStock" | "diasObservables" | "ledgerConsistente"
>;

export function recortarFilaSemana(f: FilaResumen): FilaSemana {
  return {
    varianteId: f.varianteId, referencia: f.referencia, categoriaId: f.categoriaId, categoria: f.categoria, sku: f.sku,
    talla: f.talla, color: f.color, colorHex: f.colorHex, fotoUrl: f.fotoUrl, precio: f.precio, costo: f.costo,
    utilizable: f.utilizable, stockInicial: f.stockInicial, ventas: f.ventas, devoluciones: f.devoluciones,
    diasConStock: f.diasConStock, diasObservables: f.diasObservables, ledgerConsistente: f.ledgerConsistente,
  };
}

/* ====================================================================
   existencias-categorias · agregados por categoría para Existencias
   (2026-09-22, overlay «Disponible total»)

   Puro: recibe `FilaResumen[]` (`getFilasSemanaDeSede`, 7 días) y agrega.
   `stockInicial` de esa ventana ES el disponible de hace 7 días; `utilizable`
   es el de HOY — no hace falta una segunda consulta para el delta.

   COSTO Y MARGEN. `costo` «Solo viaja a líderes» (`FilaResumen.costo`,
   comentario de `resumen-reglas.ts`): para un colaborador todas las filas
   traen `costo: null` y el agregado de la categoría queda `null` — nunca se
   inventa un costo. Una variante CON stock pero SIN costo válido (alta
   manual sin costear, p.ej.) se cuenta aparte en `variantesSinCosto`: el
   total de la categoría se calcula solo con las que sí tienen, y la UI debe
   avisar que es parcial, no fingir que es todo.
   ==================================================================== */

export type CategoriaResumen = {
  id: string;
  nombre: string;
  variantes: number;
  disponible: number;
  disponibleHace7d: number;
  /** null = no hay base para comparar (hace 7 días todo en cero). */
  deltaPct: number | null;
  deltaUnidades: number;
  /** null = sin costo (colaborador, o ninguna variante con costo válido). */
  costoTotal: number | null;
  montoPotencial: number | null;
  margenEstimado: number | null;
  variantesSinCosto: number;
};

export type VarianteCategoria = {
  varianteId: string;
  referencia: string;
  sku: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  disponible: number;
  disponibleHace7d: number;
  deltaUnidades: number;
  costo: number | null;
  precio: number | null;
  /** Unidades/día con el ritmo de los últimos 7 días — misma fórmula que Análisis (`calcularVelocidad`). */
  ritmoUdsDia: number | null;
};

function deltaPct(hoy: number, hace7d: number): number | null {
  if (hace7d === 0) return hoy === 0 ? 0 : null; // de 0 a algo no es "% de aumento" — se muestra la unidad, no un porcentaje inventado
  return ((hoy - hace7d) / hace7d) * 100;
}

export function agruparPorCategoria(filas: FilaSemana[]): CategoriaResumen[] {
  const porId = new Map<string, CategoriaResumen>();
  for (const f of filas) {
    if (!f.categoriaId) continue;
    const c = porId.get(f.categoriaId) ?? {
      id: f.categoriaId,
      nombre: f.categoria ?? "Sin categoría",
      variantes: 0,
      disponible: 0,
      disponibleHace7d: 0,
      deltaPct: null,
      deltaUnidades: 0,
      costoTotal: null,
      montoPotencial: null,
      margenEstimado: null,
      variantesSinCosto: 0,
    };
    c.variantes += 1;
    c.disponible += f.utilizable;
    c.disponibleHace7d += f.stockInicial;
    if (f.costo !== null && f.precio !== null) {
      c.costoTotal = (c.costoTotal ?? 0) + f.costo * f.utilizable;
      c.montoPotencial = (c.montoPotencial ?? 0) + f.precio * f.utilizable;
    } else if (f.utilizable > 0) {
      c.variantesSinCosto += 1;
    }
    porId.set(f.categoriaId, c);
  }
  return [...porId.values()]
    .map((c) => ({
      ...c,
      deltaUnidades: c.disponible - c.disponibleHace7d,
      deltaPct: deltaPct(c.disponible, c.disponibleHace7d),
      margenEstimado: c.costoTotal !== null && c.montoPotencial !== null ? c.montoPotencial - c.costoTotal : null,
    }))
    .sort((a, b) => b.disponible - a.disponible);
}

export function variantesDeCategoria(filas: FilaSemana[], categoriaId: string): VarianteCategoria[] {
  return filas
    .filter((f) => f.categoriaId === categoriaId)
    .map((f) => ({
      varianteId: f.varianteId,
      referencia: f.referencia,
      sku: f.sku,
      talla: f.talla,
      color: f.color,
      colorHex: f.colorHex,
      fotoUrl: f.fotoUrl,
      disponible: f.utilizable,
      disponibleHace7d: f.stockInicial,
      deltaUnidades: f.utilizable - f.stockInicial,
      costo: f.costo,
      precio: f.precio,
      ritmoUdsDia: calcularVelocidad(f).unidadesDia,
    }))
    .sort((a, b) => b.disponible - a.disponible);
}

/** Para la tarjeta «Disponible total»: el delta de TODA la sede (todas las categorías, con o sin `categoriaId`). */
export function deltaDisponibleSede(filas: FilaSemana[]): { hoy: number; hace7d: number; pct: number | null } {
  const hoy = filas.reduce((acc, f) => acc + f.utilizable, 0);
  const hace7d = filas.reduce((acc, f) => acc + f.stockInicial, 0);
  return { hoy, hace7d, pct: deltaPct(hoy, hace7d) };
}
