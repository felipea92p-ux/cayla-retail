import { ETIQUETA_TIPO, ESTADO_ETIQUETA } from "./comprobantes-reglas";
import type { FilaHistorial } from "./ventas-historial-reglas";

// El archivo de «Exportar» de Ventas ▸ Historial (ADR-0229): una fila por venta, en CSV que Excel abre directo. Regla pura,
// con pruebas. UTF-8 con BOM (sin él Excel lee «Blusa Ã‰mma»), coma como separador y punto decimal (así lo lee el Excel
// con la configuración de Perú), y cada celda con comillas si trae coma, comillas o salto de línea.

const COLUMNAS = [
  "Fecha",
  "Hora",
  "Tienda",
  "Vendedor",
  "Clienta",
  "Prendas",
  "Unidades",
  "Total (S/)",
  "Pago",
  "Nº de operación",
  "Comprobante",
  "Estado del comprobante",
  "Anulada",
  "Cambios y devoluciones",
  "Apartado",
] as const;

export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  // Una celda que empieza con = + - @ Excel la ejecuta como fórmula: se le antepone un apóstrofo.
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return /[",\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function csvDeHistorial(filas: FilaHistorial[]): string {
  const lineas = filas.map((f) =>
    [
      f.fecha,
      f.hora,
      f.ubicacion,
      f.vendedor ?? "",
      f.clienta ?? "Cliente varios",
      f.prendas,
      f.unidades,
      f.total.toFixed(2),
      f.pagos,
      f.operaciones.join(" "),
      f.comprobante ? `${ETIQUETA_TIPO[f.comprobante.tipo]} ${f.comprobante.numero}` : "Sin comprobante",
      f.comprobante ? ESTADO_ETIQUETA[f.comprobante.estado] : "",
      f.anulada ? "Sí" : "No",
      f.posventa.map((m) => (m.tipo === "cambio" ? "Cambio" : m.pendiente ? "Devolución por aprobar" : "Devolución")).join(" · "),
      f.apartado?.codigo ?? (f.conAnticipo ? "Sí" : ""),
    ]
      .map(celdaCsv)
      .join(",")
  );
  return `﻿${[COLUMNAS.join(","), ...lineas].join("\r\n")}\r\n`;
}

/** «historial-tru-2026-08-28-a-2026-09-26.csv»: se reconoce en la carpeta de descargas sin abrirlo. */
export function nombreArchivoHistorial(alcance: string, desde: string | undefined, hasta: string): string {
  const slug = alcance
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^tienda\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `historial-${slug || "todas"}-${desde ? `${desde}-a-` : "hasta-"}${hasta}.csv`;
}
