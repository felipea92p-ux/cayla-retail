import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { colorDeSede, cuentaDelMes, deCadaCien, gastosDelMes, hojaVecina, rubrosEnBarra, ventasDiaADia, ventasPorTienda } from "./hojas-resumen-reglas";
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


describe("los gráficos de las hojas", () => {
  it("de cada S/ 100: ropa, gastos y lo que quedó suman lo vendido", () => {
    const x = deCadaCien({ ventas: 10_000, margen: 6_000, gastos: 4_000, resultado: 2_000 })!;
    expect(x.tramos.map((t) => [t.clave, t.valor])).toEqual([["ropa", 4_000], ["gastos", 4_000], ["deja", 2_000]]);
    expect(x.total).toBe(10_000);
    expect(x.frase.replace(/ /g, " ")).toBe("De cada S/ 100 vendidos, 40 se fueron en la ropa, 40 en gastos y 20 te quedaron.");
  });
  it("si faltó, la barra se mide contra lo que salió y dice cuánto faltó", () => {
    const x = deCadaCien({ ventas: 796, margen: 316, gastos: 768, resultado: -452 })!;
    expect(x.tramos.map((t) => t.clave)).toEqual(["ropa", "gastos"]);
    expect(x.total).toBe(480 + 768);
    expect(x.frase).toContain("faltaron 57");
    expect(deCadaCien({ ventas: 0, margen: 0, gastos: 10, resultado: -10 })).toBeNull();
  });
  it("los rubros: los cuatro mayores y el resto junto", () => {
    const g = [6, 5, 4, 3, 2, 1].map((n) => ({ nombre: `R${n}`, monto: n * 100, deCada100: 0 }));
    const t = rubrosEnBarra(g);
    expect(t.map((x) => x.nombre)).toEqual(["R6", "R5", "R4", "R3", "Otros 2"]);
    expect(t.at(-1)!.valor).toBe(300);
    expect(rubrosEnBarra(g.slice(0, 3))).toHaveLength(3);
  });
  it("la venta de cada día va con cero los días sin venta y no pasa de hoy", () => {
    const d = ventasDiaADia({ "2026-11-02": 500 }, "2026-11-01", "2026-11-30", "2026-11-04");
    expect(d.map((x) => x.total)).toEqual([0, 500, 0, 0]);
  });
  it("cada sede con su color de dato", () => {
    expect(colorDeSede("tru")).toBe("var(--color-sede-tru)");
    expect(colorDeSede("otra")).toBe("var(--color-grafico-neutro)");
  });
});
