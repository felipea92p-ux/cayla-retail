import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { cuentaDelMes, gastosDelMes, hojaVecina, ventasPorTienda } from "./hojas-resumen-reglas";
import type { FilaER } from "./resultados-reglas";
import { leerResumen } from "./resumen-finanzas-reglas";

const r = leerResumen(fixture.todas);
if (r.resultadosMes.estado !== "ok") throw new Error("fixture");
const base = r.resultadosMes.datos.find((f) => f.unidad === "consolidado")!;
const fila = (c: Partial<FilaER>): FilaER => ({ ...base, ...c });

describe("las hojas del Resumen", () => {
  it("«Siguiente» recorre solo las hojas que hay, en su orden", () => {
    const hay = ["plata", "deja", "sunat"] as const;
    expect(hojaVecina("plata", hay, 1)).toBe("deja");
    expect(hojaVecina("deja", hay, 1)).toBe("sunat");
    expect(hojaVecina("sunat", hay, 1)).toBeNull();
    expect(hojaVecina("plata", hay, -1)).toBeNull();
  });

  it("la cuenta del mes cierra en lo que deja, con «Otros» si hace falta", () => {
    const f = fila({ ventas: 10_000, margen: 6_000, gastos: 4_000, resultado: 1_900 });
    const filas = cuentaDelMes(f, { tipo: "cerrado", resultado: 1_900, porCien: 19 });
    expect(filas.find((x) => x.texto === "Lo que costaron las prendas")?.monto).toBe(-4_000);
    expect(filas.find((x) => x.texto === "Otros")?.monto).toBe(-100);
    expect(filas.at(-1)).toMatchObject({ texto: "Te dejó", monto: 1_900 });
    expect(cuentaDelMes(fila({ ventas: 100, margen: 40, gastos: 90, resultado: -50 }), { tipo: "cerrado", resultado: -50, porCien: -50 }).at(-1)).toMatchObject({ texto: "Te faltó", monto: 50 });
    // Vendiste − costo + (−gastos) + otros = te dejó.
    const sumables = filas.filter((x) => x.tipo !== "total");
    expect(sumables.reduce((a, x) => a + x.monto, 0)).toBe(1_900);
  });

  it("mientras el mes corre, sigue hasta el estimado", () => {
    const f = fila({ ventas: 40_000, margen: 20_000, gastos: 12_000, resultado: 8_000 });
    const filas = cuentaDelMes(f, { tipo: "estimado", estimado: 42_000, rango: [40_000, 44_000], hastaHoy: 8_000, faltaVender: 80_000, faltaGastar: 6_000, dias: { van: 10, total: 30 } });
    expect(filas.map((x) => x.texto)).toContain("Te deja hasta hoy");
    expect(filas.find((x) => x.texto === "Lo que falta vender, al ritmo de hoy")?.monto).toBe(40_000);
    expect(filas.at(-1)).toMatchObject({ texto: "Te deja (estimado)", monto: 42_000 });
    expect(8_000 + 40_000 - 6_000).toBe(42_000);
  });

  it("lo vendido por tienda va de la que más vende a la que menos, con su cambio", () => {
    const filas = [
      fila({ unidad: "tienda", ubicacionId: "a", nombre: "Tienda Trujillo", ventas: 100 }),
      fila({ unidad: "tienda", ubicacionId: "b", nombre: "Tienda Lima", ventas: 300 }),
      fila({ unidad: "consolidado", ubicacionId: null, ventas: 400 }),
    ];
    const antes = [fila({ unidad: "tienda", ubicacionId: "b", ventas: 200 })];
    const v = ventasPorTienda(filas, antes);
    expect(v.map((x) => x.nombre)).toEqual(["Lima", "Trujillo"]);
    expect(v[0]!.cambio).toBeCloseTo(0.5);
    expect(v[1]!.cambio).toBeNull();
  });

  it("los gastos van por rubro, del mayor al menor, con su parte de cada S/ 100", () => {
    const g = gastosDelMes(fila({ detalleGastos: [{ cuenta: "62", nombre: "Sueldos", monto: 600 }, { cuenta: "63", nombre: "Alquiler", monto: 300 }, { cuenta: "63", nombre: "Alquiler", monto: 100 }] }));
    expect(g).toEqual([
      { nombre: "Sueldos", monto: 600, deCada100: 60 },
      { nombre: "Alquiler", monto: 400, deCada100: 40 },
    ]);
  });
});
