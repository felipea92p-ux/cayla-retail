import { describe, expect, it } from "vitest";
import { leerUnidad } from "./balance-reglas";
import type { FilaER } from "./resultados-reglas";
import { sedesJuntas, type SedeJunta } from "./sedes-juntas-reglas";

const fila = (unidad: FilaER["unidad"], nombre: string, ubicacionId: string | null, ventas: number, margen: number, resultado: number) => ({ unidad, nombre, ubicacionId, ventas, margen, resultado }) as unknown as FilaER;
const unidad = (id: string, nombre: string, tipo: string, caja: number | null) => leerUnidad({ ubicacion_id: id, nombre, tipo, caja });

const FILAS = [
  fila("consolidado", "CAYLA", null, 1500, 800, 300),
  fila("empresa", "De la empresa", null, 0, 0, -200),
  fila("taller", "Taller Lima", "x", 0, 0, -100),
  fila("tienda", "Tienda Lima", "l", 500, 300, 150),
  fila("tienda", "Tienda Trujillo", "t", 1000, 500, 450),
];
const UNIDADES = [unidad("t", "Tienda Trujillo", "tienda", 120), unidad("l", "Tienda Lima", "tienda", 80), unidad("x", "Taller Lima", "taller", 10)];

describe("cada sede, junta (tarea 27)", () => {
  const j = sedesJuntas(FILAS, UNIDADES)!;

  it("las tiendas van en el orden del telar; el Taller y la Empresa, aparte", () => {
    expect(j.tiendas.map((s) => s.nombre)).toEqual(["Trujillo", "Lima"]);
    expect(j.aparte.map((s) => s.nombre)).toEqual(["Taller Lima", "Empresa"]);
  });

  it("las filas suman la de CAYLA, columna por columna", () => {
    const todas = [...j.tiendas, ...j.aparte];
    for (const c of ["vendio", "costo", "gastos", "dejo"] as (keyof SedeJunta)[]) {
      expect(todas.reduce((a, s) => a + Number(s[c]), 0)).toBeCloseTo(Number(j.total[c]), 2);
    }
  });

  it("cada fila se lee de corrido: vendió − costó − gastó = dejó", () => {
    for (const s of [...j.tiendas, ...j.aparte, j.total]) expect(s.vendio - s.costo - s.gastos).toBeCloseTo(s.dejo, 2);
  });

  it("«En caja» es de cada tienda y del Taller; la Empresa no tiene, y no le quita el total a CAYLA", () => {
    expect(j.tiendas.map((s) => s.tiene)).toEqual([120, 80]);
    expect(j.aparte.map((s) => s.tiene)).toEqual([10, null]);
    expect(j.total.tiene).toBe(210);
  });

  it("una caja sin dato deja el total sin dato; sin la lectura del Balance, ninguna dice cero", () => {
    expect(sedesJuntas(FILAS, [unidad("t", "Tienda Trujillo", "tienda", null), ...UNIDADES.slice(1)])!.total.tiene).toBeNull();
    const sinBalance = sedesJuntas(FILAS, null)!;
    expect([...sinBalance.tiendas, ...sinBalance.aparte, sinBalance.total].every((s) => s.tiene === null)).toBe(true);
  });

  it("sin consolidado, el total es la suma; con una sola sede no hay nada que juntar", () => {
    const sin = sedesJuntas(FILAS.slice(1), UNIDADES)!;
    expect(sin.total).toMatchObject({ vendio: 1500, dejo: 300 });
    expect(sedesJuntas([fila("tienda", "Tienda Lima", "l", 500, 300, 150)], UNIDADES)).toBeNull();
  });
});
