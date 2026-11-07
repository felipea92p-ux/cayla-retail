// El IGV de las ventas en Ganancias y pérdidas (ADR-0624, «regla pareja»): el IGV que cobras es de SUNAT, así que el resultado lo resta SIEMPRE, como el libro.
// Esta capa no cambia ninguna cifra: solo PRESENTA lo cobrado arriba de «Lo que vendiste» («Cobraste» → «IGV de tus ventas · es de SUNAT» → «Lo que vendiste»).
//
// PROMETE: `conIgvDeLasVentas` suma a cada columna el IGV de sus ventas (`igvCobrado`) y no toca `ventas`, `margen` ni `resultado`. CAYLA suma todas las unidades;
// «De la empresa», las que no son de una tienda; una tienda o el Taller, la suya.
// ASUME: las filas vienen de `fn_igv_de_las_ventas` (20261107174000), con la misma regla de la 4011 que las ventas del libro.
// NO HACE: no calcula el IGV (lo hace la base) y, sin la lectura, no inventa nada: las columnas quedan sin `igvCobrado` y la pantalla no dibuja esas dos filas.

import type { FilaER } from "./resultados-reglas";

/** Una fila de `fn_igv_de_las_ventas`: el IGV incluido en las ventas de un mes y una unidad, dentro del rango pedido. */
export type FilaIgvVentas = { mes: string; ubicacionId: string | null; igv: number };

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
  const suyas = f.unidad === "consolidado" ? igv : igv.filter((x) => x.ubicacionId === (f.unidad === "empresa" ? null : f.ubicacionId));
  return r2(suyas.reduce((a, x) => a + x.igv, 0));
}

/** Las columnas con su IGV de las ventas. `null` (no se pudo leer): las columnas tal cual, sin `igvCobrado`. */
export function conIgvDeLasVentas(filas: readonly FilaER[], igv: readonly FilaIgvVentas[] | null): FilaER[] {
  return igv === null ? [...filas] : filas.map((f) => ({ ...f, igvCobrado: igvDeLaColumna(f, igv) }));
}
