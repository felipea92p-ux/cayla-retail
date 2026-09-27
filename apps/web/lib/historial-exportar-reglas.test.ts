import { describe, it, expect } from "vitest";
import { celdaCsv, csvDeHistorial, nombreArchivoHistorial } from "./historial-exportar-reglas";
import type { FilaHistorial } from "./ventas-historial-reglas";

const fila: FilaHistorial = {
  id: "v1",
  creadoEn: "2026-09-25T18:22:00Z",
  fecha: "2026-09-25",
  hora: "13:22",
  ubicacionId: "u",
  ubicacion: "Tienda TRU",
  vendedor: "Chiara Flores",
  clienta: 'Lucía "Lu" Paredes',
  prendas: "Polo Básico M/corta · Estándar · Arena",
  piezas: [],
  unidades: 1,
  total: 39.9,
  pagos: "Yape",
  comprobante: { tipo: "boleta", numero: "B004-000029", estado: "aceptado", emitidoEn: "2026-09-25T18:22:05Z", enviadoEn: null },
  anulada: false,
  nota: null,
  esPrueba: false,
  anuladaEn: null,
  ventaItemIds: ["vi1"],
  posventa: [{ tipo: "cambio", fecha: "2026-09-26T15:00:00Z", pendiente: false }],
  apartado: null,
  conAnticipo: false,
  operaciones: ["01234567"],
};

describe("exportar el historial", () => {
  it("empieza con BOM (Excel lee bien las tildes) y una fila de títulos", () => {
    const csv = csvDeHistorial([fila]);
    expect(csv.startsWith("﻿Fecha,Hora,Tienda")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("una fila por venta, con comillas donde hace falta y el total con punto decimal", () => {
    const linea = csvDeHistorial([fila]).split("\r\n")[1];
    expect(linea).toBe('2026-09-25,13:22,Tienda TRU,Chiara Flores,"Lucía ""Lu"" Paredes",Polo Básico M/corta · Estándar · Arena,1,39.90,Yape,01234567,Boleta B004-000029,Aceptado,No,Cambio,');
  });

  it("una celda que Excel tomaría como fórmula se neutraliza", () => {
    expect(celdaCsv("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(celdaCsv("-5")).toBe("'-5");
    expect(celdaCsv(null)).toBe("");
  });

  it("el nombre del archivo dice la tienda y el período", () => {
    expect(nombreArchivoHistorial("Tienda TRU", "2026-08-28", "2026-09-26")).toBe("historial-tru-2026-08-28-a-2026-09-26.csv");
    expect(nombreArchivoHistorial("todas", undefined, "2026-09-26")).toBe("historial-todas-hasta-2026-09-26.csv");
  });
});
