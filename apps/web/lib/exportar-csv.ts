// Export simple a CSV — revisado el repo entero (2026-09-15) y no existe ningún
// patrón de "Exportar Excel" ni librería de hojas de cálculo instalada (sin
// xlsx/exceljs/papaparse). Un CSV abre igual en Excel/Sheets y evita sumar una
// dependencia nueva para un botón de descarga puntual (principio 3, simplicidad
// radical). Si más pantallas necesitan exportar, este es el punto de partida.

/** Un número puro, con signo o sin él («-12.50», «+3», «7»). Excel lo lee como número y lo suma: no es una fórmula. */
const NUMERO = /^[+-]?\d+(\.\d+)?$/;

/**
 * Excel ejecuta como FÓRMULA una celda de texto que empieza con = + - @ (o con tabulación o retorno): el nombre de un
 * proveedor o de una prenda que alguien escribió «=…» se volvería un cálculo, o un enlace, al abrir el archivo. Se le
 * antepone un apóstrofo y Excel la muestra como texto. Un número puro no se toca: «-12.50» de una nota de crédito tiene
 * que seguir sumando en la hoja del contador.
 */
export function sinFormula(texto: string): string {
  return /^[=+\-@\t\r]/.test(texto) && !NUMERO.test(texto) ? `'${texto}` : texto;
}

/**
 * Una celda de CSV, la ÚNICA del ERP: sin fórmula y, según RFC 4180, entre comillas si trae el separador, una comilla o
 * un salto de línea. `separador` es «,» (lo normal) o «;» (los reportes de Finanzas, que Excel en español abre en
 * columnas). El formato de un monto (dos decimales) lo decide quien arma la fila, no la celda.
 */
export function celdaCsv(valor: string | number | null | undefined, separador: "," | ";" = ","): string {
  if (valor === null || valor === undefined) return "";
  const texto = sinFormula(String(valor));
  const especial = separador === ";" ? /[";\r\n]/ : /[",\r\n]/;
  return especial.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** El texto del CSV. BOM al inicio: sin él, Excel en Windows abre acentos/eñes rotos. Se arma aparte de la descarga
 *  porque Impuestos (ADR-0195 F8) mete varios CSV en un .zip para el contador. */
export function textoCsv(encabezados: readonly string[], filas: readonly (readonly (string | number)[])[]): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map((v) => celdaCsv(v)).join(","));
  return "﻿" + lineas.join("\r\n");
}

/** Baja un archivo ya armado desde el navegador. */
export function descargarBlob(nombreArchivo: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

export function descargarCsv(nombreArchivo: string, encabezados: string[], filas: (string | number)[][]) {
  descargarBlob(nombreArchivo, new Blob([textoCsv(encabezados, filas)], { type: "text/csv;charset=utf-8;" }));
}
