// Export simple a CSV — revisado el repo entero (2026-09-15) y no existe ningún
// patrón de "Exportar Excel" ni librería de hojas de cálculo instalada (sin
// xlsx/exceljs/papaparse). Un CSV abre igual en Excel/Sheets y evita sumar una
// dependencia nueva para un botón de descarga puntual (principio 3, simplicidad
// radical). Si más pantallas necesitan exportar, este es el punto de partida.

/** El texto del CSV. BOM al inicio: sin él, Excel en Windows abre acentos/eñes rotos. Se arma aparte de la descarga
 *  porque Impuestos (ADR-0195 F8) mete varios CSV en un .zip para el contador. */
export function textoCsv(encabezados: readonly string[], filas: readonly (readonly (string | number)[])[]): string {
  const escapar = (valor: string | number) => {
    const texto = String(valor);
    return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const lineas = [encabezados, ...filas].map((fila) => fila.map(escapar).join(","));
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
