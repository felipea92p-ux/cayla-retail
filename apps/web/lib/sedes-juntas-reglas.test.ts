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

  describe("con el IGV de las ventas (Felipe 2026-11-08)", () => {
    const conIgv = (igv: number, f: FilaER) => ({ ...f, igvCobrado: igv }) as FilaER;
    const IGVS = [270, 0, 0, 90, 180];
    const juntas = sedesJuntas(FILAS.map((f, i) => conIgv(IGVS[i]!, f)), UNIDADES)!;

    it("«Vendió» va con IGV y la fila sigue dando su cuenta: vendió − IGV − costó − gastó = dejó", () => {
      expect(juntas.conIgv).toBe(true);
      expect(juntas.tiendas.map((s) => [s.vendio, s.igv])).toEqual([[1180, 180], [590, 90]]);
      for (const s of [...juntas.tiendas, ...juntas.aparte, juntas.total]) expect(s.vendio - (s.igv ?? 0) - s.costo - s.gastos).toBeCloseTo(s.dejo, 2);
    });

    it("las filas suman la de CAYLA, también el IGV; lo que dejó no cambia", () => {
      const todas = [...juntas.tiendas, ...juntas.aparte];
      expect(todas.reduce((a, s) => a + (s.igv ?? 0), 0)).toBeCloseTo(juntas.total.igv ?? 0, 2);
      expect(juntas.total).toMatchObject({ vendio: 1770, igv: 270, dejo: 300 });
    });

    it("sin consolidado, el total también suma el IGV", () => {
      expect(sedesJuntas(FILAS.slice(1).map((f, i) => conIgv(IGVS[i + 1]!, f)), UNIDADES)!.total).toMatchObject({ vendio: 1770, igv: 270 });
    });

    // Octubre en Tienda LIM, con cifras inventadas con las proporciones de producción (las reales no entran al repo, que es público: ADR-0609). Antes la columna decía la venta de CAYLA con el IGV de las dos.
    it("Lima: «Vendió con IGV» es todo lo de la tienda, y la fila sigue dando su cuenta restando lo de CLAURE", () => {
      const lima = { ...fila("tienda", "Tienda Lima", "l", 1000, 200, -120), igvCobrado: 270, claureSinIgv: 500 } as FilaER;
      const tru = { ...fila("tienda", "Tienda Trujillo", "t", 1000, 500, 450), igvCobrado: 180, claureSinIgv: 0 } as FilaER;
      const j = sedesJuntas([lima, tru], UNIDADES)!;
      const l = j.tiendas.find((s) => s.nombre === "Lima")!;
      expect(l).toMatchObject({ vendio: 1770, igv: 270, claure: 500, costo: 800, dejo: -120 });
      expect(l.vendio - (l.igv ?? 0) - l.claure - l.costo - l.gastos).toBeCloseTo(l.dejo, 2);
      expect(j.tiendas.find((s) => s.nombre === "Trujillo")!.claure).toBe(0);
      expect(j.total).toMatchObject({ vendio: 2950, claure: 500 });
    });

    it("si a una columna le falta el IGV, ninguna lo muestra: la tabla no mezcla bases", () => {
      const mezcla = sedesJuntas([conIgv(270, FILAS[0]!), ...FILAS.slice(1)], UNIDADES)!;
      expect(mezcla.conIgv).toBe(false);
      expect(mezcla.total).toMatchObject({ vendio: 1500, igv: null });
    });
  });

  it("sin consolidado, el total es la suma; con una sola sede no hay nada que juntar", () => {
    const sin = sedesJuntas(FILAS.slice(1), UNIDADES)!;
    expect(sin.total).toMatchObject({ vendio: 1500, dejo: 300 });
    expect(sedesJuntas([fila("tienda", "Tienda Lima", "l", 500, 300, 150)], UNIDADES)).toBeNull();
  });
});

// Tarea 75: en la comparación de sedes se ve cuánto de lo vendido de cada una lleva costo estimado.
describe("cada sede con su costo estimado", () => {
  it("cada tienda muestra el suyo, y la fila de CAYLA el de todas", () => {
    const j = sedesJuntas(FILAS, UNIDADES, { l: 63.1, t: 27, todas: 38.6 })!;
    expect(j.tiendas.map((s) => [s.nombre, s.pctEstimado])).toEqual([["Trujillo", 27], ["Lima", 63.1]]);
    expect(j.total.pctEstimado).toBe(38.6);
  });
  it("el Taller y la Empresa no venden: no llevan", () => {
    const j = sedesJuntas(FILAS, UNIDADES, { l: 63.1, t: 27, x: 10 })!;
    expect(j.aparte.map((s) => s.pctEstimado)).toEqual([null, null]);
  });
  it("sin la lectura, ninguna lo dice", () => {
    expect(sedesJuntas(FILAS, UNIDADES)!.tiendas.every((s) => s.pctEstimado === null)).toBe(true);
  });
});
