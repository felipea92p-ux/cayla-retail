// El IGV de las ventas en Ganancias y pérdidas (ADR-0624, «regla pareja»): el IGV que cobras es de SUNAT, así que el resultado lo resta SIEMPRE, como el libro.
// Esta capa no cambia ninguna cifra: solo PRESENTA lo cobrado arriba de «Lo que vendiste» («Vendiste con IGV» → «IGV de tus ventas» → «Lo que vendiste»).
//
// PROMETE: `conIgvDeLasVentas` suma a cada columna el IGV de sus ventas (`igvCobrado`) y lo vendido de CLAURE sin IGV (`claureSinIgv`), y no toca `ventas`, `margen` ni `resultado`. CAYLA
// suma todas las unidades; «De la empresa», las que no son de una tienda; una tienda o el Taller, la suya. Lo cobrado con IGV de una columna es `ventas + igvCobrado + claureSinIgv`: el
// IGV de `fn_igv_de_las_ventas` incluye el de CLAURE (la boleta sale con el RUC de CAYLA), así que sin su base la cifra mezclaría la venta de CAYLA con un IGV ajeno (Felipe 2026-11-09).
// ASUME: las filas vienen de `fn_igv_de_las_ventas` (20261107174000), con la misma regla de la 4011 que las ventas del libro.
// NO HACE: no calcula el IGV (lo hace la base) y, si falta cualquiera de las dos lecturas, no inventa nada: las columnas quedan sin `igvCobrado` y la pantalla no dibuja esas filas.

import type { FilaER } from "./resultados-reglas";

/** Una fila de `fn_igv_de_las_ventas`: el IGV incluido en las ventas de un mes y una unidad, dentro del rango pedido. */
export type FilaIgvVentas = { mes: string; ubicacionId: string | null; igv: number };

/** Lo que el Diario sacó de las ventas de una sede por ser de CLAURE (`fn_cuadre_ventas_finanzas.claure`): negativo cuando vendió, igual que en el cuadre. */
export type ClaureDeSede = { ubicacionId: string | null; claure: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Las filas de `fn_igv_de_las_ventas` (los `numeric` viajan como texto) → tipos de la pantalla. */
export function leerFilasIgvVentas(data: unknown): FilaIgvVentas[] {
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    mes: String(r.mes ?? "").slice(0, 7),
    ubicacionId: r.ubicacion_id == null ? null : String(r.ubicacion_id),
    igv: r.igv == null ? 0 : Number(r.igv),
  }));
}

/** El IGV de las ventas de una columna. */
export function igvDeLaColumna(f: Pick<FilaER, "ubicacionId" | "unidad">, igv: readonly FilaIgvVentas[]): number {
  return r2(deLaColumna(f, igv).reduce((a, x) => a + x.igv, 0));
}

function deLaColumna<T extends { ubicacionId: string | null }>(f: Pick<FilaER, "ubicacionId" | "unidad">, filas: readonly T[]): readonly T[] {
  return f.unidad === "consolidado" ? filas : filas.filter((x) => x.ubicacionId === (f.unidad === "empresa" ? null : f.ubicacionId));
}

/** Lo vendido de CLAURE en una columna, sin IGV y en positivo. */
function claureDeLaColumna(f: Pick<FilaER, "ubicacionId" | "unidad">, claure: readonly ClaureDeSede[]): number {
  return r2(-deLaColumna(f, claure).reduce((a, x) => a + x.claure, 0)) + 0;
}

/** Todo lo vendido en una columna, con IGV y con lo de CLAURE: lo mismo que dice «Cada sede, junta». `null` si no se pudo leer el IGV. */
export function vendidoConIgv(f: Pick<FilaER, "ventas"> & Partial<Pick<FilaER, "igvCobrado" | "claureSinIgv">>): number | null {
  return f.igvCobrado === undefined ? null : r2(f.ventas + f.igvCobrado + (f.claureSinIgv ?? 0));
}

const TASA_DE_RESPALDO = 0.18;
/** Más que esto no es la tasa de la columna: es un IGV que no calza con lo vendido (una devolución grande de un mes chico). */
const TASA_MAXIMA = 0.25;

/**
 * Cómo se DICE lo vendido junto a «cuánto hay que vender» o a la meta (Felipe 2026-11-09, tarea 19). Esas dos cifras son de CAYLA: en Lima se comparan con lo de CAYLA con IGV, nunca con todo
 * lo cobrado en la tienda. La tasa sale de `igvCobrado ÷ (ventas + claureSinIgv)` porque ese IGV incluye el de CLAURE: partido entre `ventas`, Lima daría una tasa inflada. Se calcula sin IGV y se
 * multiplica recién para mostrar, así que un margen o un «ya se cubrió» no cambian. Sin la lectura (`igvCobrado` sin llegar), `factor` es 1 y `rotulo` dice «sin IGV».
 */
export function ventaParaDecir(f: Pick<FilaER, "ventas"> & Partial<Pick<FilaER, "igvCobrado" | "claureSinIgv">>): { factor: number; vendido: number; rotulo: string } {
  if (f.igvCobrado === undefined) return { factor: 1, vendido: r2(f.ventas), rotulo: "sin IGV" };
  const base = f.ventas + (f.claureSinIgv ?? 0);
  const medida = base > 0 ? f.igvCobrado / base : TASA_DE_RESPALDO;
  const factor = 1 + (medida >= 0 && medida <= TASA_MAXIMA ? medida : TASA_DE_RESPALDO);
  return { factor, vendido: r2(f.ventas * factor), rotulo: Math.abs(f.claureSinIgv ?? 0) >= 0.005 ? "con IGV y sin lo de CLAURE" : "con IGV" };
}

/**
 * La meta de ventas tal como se escribió en Configuración ▸ Metas (Felipe 2026-11-09, tarea 53). La base la guarda con IGV y `fn_presupuesto_vs_real` la entrega dividida entre 1.18; multiplicar por la
 * misma tasa fija la devuelve, y por eso no sale de `igvCobrado`: la meta no depende de lo que se vendió. Solo es para mostrar. Se cuenta en céntimos enteros: una meta que termina en .25 cae justo en medio
 * céntimo y, en decimales, a veces bajaría un céntimo.
 */
export function metaConIgv(sinIgv: number): number {
  return Math.round((Math.round(sinIgv * 100) * Math.round((1 + TASA_DE_RESPALDO) * 100)) / 100) / 100;
}

/** Las columnas con su IGV de las ventas y lo vendido de CLAURE. `null` en cualquiera (no se pudo leer): las columnas tal cual, sin `igvCobrado`, porque una cifra con la mitad de la cuenta se lee como si estuviera completa. */
export function conIgvDeLasVentas(filas: readonly FilaER[], igv: readonly FilaIgvVentas[] | null, claure: readonly ClaureDeSede[] | null): FilaER[] {
  return igv === null || claure === null ? [...filas] : filas.map((f) => ({ ...f, igvCobrado: igvDeLaColumna(f, igv), claureSinIgv: claureDeLaColumna(f, claure) }));
}
