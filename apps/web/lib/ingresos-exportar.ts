// Relativo, no `@/`: vitest no resuelve el alias y este archivo tiene pruebas.
import { SIN_TALLA, type ModeloIngresado } from "./ingresos-reglas";
import { compararTallas } from "./tallas";

// Los archivos que baja «Ingresos»: lo que se está VIENDO (con la búsqueda, el filtro y el orden de la pantalla), armado en el
// navegador con lo que el rango ya trajo. Es un CSV con BOM: Excel lo abre directo, con tildes y eñes bien (`textoCsv`).
//
// CONTRATO — PROMETE: el costo solo va en el archivo si la cuenta lo ve (`veCosto`: la base ya lo manda vacío al resto, y acá ni
// siquiera hay columna); un monto que falta es una celda vacía, nunca un 0; y ningún texto empieza con un carácter que Excel
// tome por una fórmula (`=`, `+`, `-`, `@`): el nombre de un modelo lo escribe una persona. ASUME: `modelos` ya viene en el orden
// que se quiere en el archivo.

/** Un texto que empieza con `=`, `+`, `-`, `@` o un tabulador lo ejecutaría Excel como una fórmula al abrir el archivo
 *  («inyección de CSV»). Un apóstrofo delante lo vuelve texto y no se ve en la celda. */
export function celdaSegura(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

const montoOVacio = (n: number | null): number | string => (n === null ? "" : n);

export function encabezadosPorModelo(veCosto: boolean): string[] {
  return [
    "Modelo",
    "Código",
    "Categoría",
    "Nuevo o reingreso",
    "Prendas",
    "De stock inicial",
    "De mercadería recibida",
    "Primer ingreso",
    "Último ingreso",
    "Precio mínimo (S/)",
    "Precio máximo (S/)",
    ...(veCosto ? ["Costo mínimo (S/)", "Costo máximo (S/)"] : []),
  ];
}

/** Una fila por modelo. */
export function filasPorModelo(modelos: readonly ModeloIngresado[], veCosto: boolean): (string | number)[][] {
  return modelos.map((m) => [
    celdaSegura(m.referencia),
    celdaSegura(m.codigo ?? ""),
    celdaSegura(m.categoria ?? ""),
    m.esNuevo ? "Nuevo" : "Reingreso",
    m.unidades,
    m.deStockInicial,
    m.deRecepcion,
    m.primerDia,
    m.ultimoDia,
    montoOVacio(m.precioMin),
    montoOVacio(m.precioMax),
    ...(veCosto ? [montoOVacio(m.costoMin), montoOVacio(m.costoMax)] : []),
  ]);
}

export const ENCABEZADOS_DETALLE = ["Modelo", "Código", "Categoría", "Color", "Talla", "Prendas"];

/** Una fila por color y talla de cada modelo: los modelos en el orden dado, y dentro de cada uno el color por nombre (el que no
 *  tiene, al final) y la talla en el orden de la curva (S · M · L, 36 · 38 · 40; «Sin talla» al final). */
export function filasPorColorYTalla(modelos: readonly ModeloIngresado[]): (string | number)[][] {
  const filas: (string | number)[][] = [];
  for (const m of modelos) {
    const variantes = [...m.variantes].sort((a, b) => {
      if (a.color !== b.color) {
        if (a.color === null || b.color === null) return a.color === null ? 1 : -1;
        return a.color.localeCompare(b.color, "es");
      }
      if (a.talla === b.talla) return 0;
      if (a.talla === null || b.talla === null) return a.talla === null ? 1 : -1;
      return compararTallas(a.talla, b.talla);
    });
    for (const v of variantes) {
      filas.push([celdaSegura(m.referencia), celdaSegura(m.codigo ?? ""), celdaSegura(m.categoria ?? ""), celdaSegura(v.color ?? ""), v.talla ?? SIN_TALLA, v.unidades]);
    }
  }
  return filas;
}

const aMinusculasSinTildes = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** «ingresos-tienda-trujillo-2026-10-02-a-2026-10-28.csv»; con un solo día, sin el «a …»; con el detalle, «-por-color-y-talla». */
export function nombreArchivoIngresos({ sede, desde, hasta, detalle }: { sede: string; desde: string; hasta: string; detalle: boolean }): string {
  const rango = desde === hasta ? desde : `${desde}-a-${hasta}`;
  return `ingresos-${aMinusculasSinTildes(sede) || "sede"}-${rango}${detalle ? "-por-color-y-talla" : ""}.csv`;
}
