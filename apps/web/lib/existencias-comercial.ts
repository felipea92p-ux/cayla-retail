import { ventasNetasDe } from "./resumen-reglas";
import type { FilaSemana } from "./existencias-categorias";

/* ====================================================================
   existencias-comercial · lo que el stock de hoy dice a la gestión comercial (2026-09-29)

   Puro: recibe `FilaSemana[]` (`getFilasSemanaDeSede`, los últimos 7 días) y responde tres preguntas de quien vende:
     · ¿qué sale rápido y le alcanza el stock?      → `rapidas`  (ventas netas de la semana y cobertura en días)
     · ¿qué tengo que no se vendió nada esta semana? → `quietas`  (stock sin una sola venta, con stock toda la semana)
     · ¿cuánto vendí y para cuántos días me alcanza?  → cifras de la sede y por categoría.

   Una prenda es modelo + color (sus tallas suman), como en el resto de Existencias.

   LO QUE NO AFIRMA. «Sin ventas esta semana» es un hecho de la ventana, no un «no se vende»: la regla del sistema
   (`MIN_DIAS_CON_STOCK_AFIRMAR`, 14 días de stock) pide más evidencia de la que caben en 7 días. Aun así solo se cuenta
   como «quieta» la prenda que tuvo stock TODA la semana (`diasConStock` casi completo, ledger consistente): una prenda que
   llegó ayer y no vendió no es una prenda parada. La cobertura es «al ritmo de esta semana» —ventas netas ÷ 7—, nunca una
   proyección.

   DINERO. El valor a precio de venta solo se calcula para un líder, igual que el costo y el margen del resto de esta pantalla
   (`FilaResumen.costo` solo viaja a líderes): para los demás queda `null`, nunca un número inventado.
   ==================================================================== */

/** Los días de la ventana de `filasSemana`. */
export const DIAS_VENTANA = 7;

/** Cuánto de la semana tiene que haber tenido stock una prenda para decir «no vendió nada» (medio día de tolerancia). */
const MIN_DIAS_CON_STOCK_SEMANA = DIAS_VENTANA - 0.5;

export type PrendaComercial = {
  clave: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  categoria: string | null;
  /** Lo que hay hoy (piso + almacén), sumadas sus tallas. */
  disponible: number;
  /** Ventas netas de la semana (ventas − devoluciones, sin bajar de 0), sumadas sus tallas. */
  vendidas: number;
  /** Días que dura lo que hay al ritmo de esta semana; null si no vendió nada. */
  coberturaDias: number | null;
  /** Lo que hay hoy a precio de venta (solo líder; null si no hay precio o no es líder). */
  valorPrecio: number | null;
};

export type CategoriaComercial = {
  id: string;
  nombre: string;
  disponible: number;
  vendidas: number;
  coberturaDias: number | null;
};

export type ResumenComercial = {
  disponible: number;
  vendidas: number;
  /** Unidades vendidas por día, promedio de la semana. */
  udsPorDia: number;
  /** Para cuántos días alcanza lo que hay al ritmo de esta semana; null si no se vendió nada. */
  coberturaDias: number | null;
  /** Lo que hay hoy a precio de venta: solo líder. */
  valorPrecio: number | null;
  /** Las que más salieron, con su cobertura (las de menos días primero entre iguales). */
  rapidas: PrendaComercial[];
  /** Con stock toda la semana y sin una venta, las de más unidades primero. */
  quietas: PrendaComercial[];
  /** Todas las quietas (no solo las que caben en la lista) y sus unidades. */
  quietasTotal: { prendas: number; unidades: number };
  categorias: CategoriaComercial[];
};

function cobertura(disponible: number, vendidas: number): number | null {
  if (vendidas <= 0) return null;
  return disponible / (vendidas / DIAS_VENTANA);
}

export function resumenComercial(filas: readonly FilaSemana[], opciones: { esLider: boolean; tope?: number }): ResumenComercial {
  const tope = opciones.tope ?? 5;
  const porPrenda = new Map<string, PrendaComercial>();
  // Las prendas con alguna talla a la venta toda la semana: de ahí sale que «no vendió nada» sea un hecho y no un recién llegado.
  const estuvoTodaLaSemana = new Set<string>();
  const porCategoria = new Map<string, CategoriaComercial>();
  let disponible = 0;
  let vendidas = 0;
  let valor = 0;
  let conPrecio = false;

  for (const f of filas) {
    const netas = ventasNetasDe(f.ventas, f.devoluciones);
    disponible += f.utilizable;
    vendidas += netas;
    const valorFila = opciones.esLider && f.precio !== null && f.utilizable > 0 ? f.precio * f.utilizable : null;
    if (valorFila !== null) {
      valor += valorFila;
      conPrecio = true;
    }

    const clave = `${f.referencia}\u0000${f.color ?? ""}`;
    const p = porPrenda.get(clave) ?? {
      clave,
      referencia: f.referencia,
      color: f.color,
      colorHex: f.colorHex,
      fotoUrl: f.fotoUrl,
      categoria: f.categoria,
      disponible: 0,
      vendidas: 0,
      coberturaDias: null,
      valorPrecio: null,
    };
    p.disponible += f.utilizable;
    p.vendidas += netas;
    if (valorFila !== null) p.valorPrecio = (p.valorPrecio ?? 0) + valorFila;
    // Una sola talla con stock toda la semana basta para creer que la prenda estuvo a la venta.
    if (f.utilizable > 0 && f.ledgerConsistente && f.diasConStock !== null && f.diasConStock >= MIN_DIAS_CON_STOCK_SEMANA) estuvoTodaLaSemana.add(clave);
    porPrenda.set(clave, p);

    const idCat = f.categoriaId ?? "sin-categoria";
    const c = porCategoria.get(idCat) ?? { id: idCat, nombre: f.categoria ?? "Sin categoría", disponible: 0, vendidas: 0, coberturaDias: null };
    c.disponible += f.utilizable;
    c.vendidas += netas;
    porCategoria.set(idCat, c);
  }

  const prendas = [...porPrenda.values()].map((p) => ({ ...p, coberturaDias: cobertura(p.disponible, p.vendidas) }));
  const rapidas = prendas
    .filter((p) => p.vendidas > 0)
    .sort((a, b) => b.vendidas - a.vendidas || (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity))
    .slice(0, tope);
  const todasQuietas = prendas.filter((p) => p.disponible > 0 && p.vendidas === 0 && estuvoTodaLaSemana.has(p.clave)).sort((a, b) => b.disponible - a.disponible);

  return {
    disponible,
    vendidas,
    udsPorDia: vendidas / DIAS_VENTANA,
    coberturaDias: cobertura(disponible, vendidas),
    valorPrecio: opciones.esLider && conPrecio ? valor : null,
    rapidas,
    quietas: todasQuietas.slice(0, tope),
    quietasTotal: { prendas: todasQuietas.length, unidades: todasQuietas.reduce((n, p) => n + p.disponible, 0) },
    categorias: [...porCategoria.values()]
      .filter((c) => c.disponible > 0 || c.vendidas > 0)
      .map((c) => ({ ...c, coberturaDias: cobertura(c.disponible, c.vendidas) }))
      .sort((a, b) => b.vendidas - a.vendidas || b.disponible - a.disponible),
  };
}
