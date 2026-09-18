// Export simple a CSV — revisado el repo entero (2026-09-15) y no existe ningún
// patrón de "Exportar Excel" ni librería de hojas de cálculo instalada (sin
// xlsx/exceljs/papaparse). Un CSV abre igual en Excel/Sheets y evita sumar una
// dependencia nueva para un botón de descarga puntual (principio 3, simplicidad
// radical). Si más pantallas necesitan exportar, este es el punto de partida.
export function descargarCsv(nombreArchivo: string, encabezados: string[], filas: (string | number)[][]) {
  const escapar = (valor: string | number) => {
    const texto = String(valor);
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const lineas = [encabezados, ...filas].map((fila) => fila.map(escapar).join(","));
  // BOM al inicio: sin él, Excel en Windows abre acentos/eñes rotos.
  const contenido = "﻿" + lineas.join("\r\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
