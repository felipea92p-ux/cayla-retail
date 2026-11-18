import { describe, expect, it } from "vitest";
import { conIgvDeLasVentas, leerFilasIgvVentas, metaConIgv, ventaParaDecir } from "./igv-ventas-reglas";
import type { FilaER } from "./resultados-reglas";

const columna = (unidad: FilaER["unidad"], ubicacionId: string | null): FilaER => ({ unidad, ubicacionId, ventas: 100, margen: 50, resultado: 10 }) as FilaER;

describe("el IGV de las ventas por columna (ADR-0624)", () => {
  const igv = leerFilasIgvVentas([
    { mes: "2026-10-01", ubicacion_id: "tru", igv: "90.00" },
    { mes: "2026-10-01", ubicacion_id: "lim", igv: "81.50" },
    { mes: "2026-10-01", ubicacion_id: null, igv: "-1.50" },
    { mes: "2026-11-01", ubicacion_id: "tru", igv: "18" },
  ]);

  it("lee los numeric que llegan como texto y el mes como «2026-10»", () => {
    expect(igv[0]).toEqual({ mes: "2026-10", ubicacionId: "tru", igv: 90 });
    expect(leerFilasIgvVentas(null)).toEqual([]);
  });
  it("CAYLA suma todas; «De la empresa», las sin tienda; una tienda, la suya", () => {
    const [cayla, empresa, tru, otra] = conIgvDeLasVentas([columna("consolidado", null), columna("empresa", null), columna("tienda", "tru"), columna("tienda", "aqp")], igv, []);
    expect(cayla!.igvCobrado).toBe(188);
    expect(empresa!.igvCobrado).toBe(-1.5);
    expect(tru!.igvCobrado).toBe(108);
    expect(otra!.igvCobrado).toBe(0);
  });
  it("no toca ninguna cifra del libro", () => {
    const [f] = conIgvDeLasVentas([columna("tienda", "tru")], igv, []);
    expect(f).toMatchObject({ ventas: 100, margen: 50, resultado: 10 });
  });
  it("sin la lectura, las columnas quedan tal cual, sin el IGV", () => {
    const [f] = conIgvDeLasVentas([columna("tienda", "tru")], null, []);
    expect(f!.igvCobrado).toBeUndefined();
  });

  // Felipe 2026-11-09: el IGV de la base trae el de CLAURE. Si no se puede saber cuánto vendió CLAURE, «Vendiste con IGV» saldría con una venta de CAYLA y un IGV ajeno.
  it("sin lo de CLAURE tampoco hay IGV: la cuenta queda entera o no se dibuja", () => {
    const [f] = conIgvDeLasVentas([columna("tienda", "tru")], igv, null);
    expect(f!.igvCobrado).toBeUndefined();
    expect(f!.claureSinIgv).toBeUndefined();
  });
  it("lo de CLAURE va por sede, sin IGV y en positivo; CAYLA suma todas", () => {
    const claure = [{ ubicacionId: "lim", claure: -500 }];
    const [cayla, lim, tru] = conIgvDeLasVentas([columna("consolidado", null), columna("tienda", "lim"), columna("tienda", "tru")], igv, claure);
    expect([cayla!.claureSinIgv, lim!.claureSinIgv, tru!.claureSinIgv]).toEqual([500, 500, 0]);
    expect(lim).toMatchObject({ ventas: 100, margen: 50, resultado: 10 });
  });
});

// Tarea 19: «cuánto hay que vender» es de CAYLA. Cifras inventadas con las proporciones de producción (las reales no entran al repo, que es público: ADR-0609).
describe("ventaParaDecir: lo de CAYLA con IGV", () => {
  it("Trujillo octubre, sin CLAURE: es lo vendido con IGV", () => {
    const v = ventaParaDecir({ ventas: 75_000, igvCobrado: 13_500, claureSinIgv: 0 });
    expect(v.vendido).toBe(88_500);
    expect(v.rotulo).toBe("con IGV");
  });
  it("Tienda LIM octubre no sale inflada: el IGV de CLAURE no se le carga a lo de CAYLA", () => {
    const v = ventaParaDecir({ ventas: 1_000, igvCobrado: 270, claureSinIgv: 500 });
    expect(v.vendido).toBe(1_180);
    expect(v.factor).toBeCloseTo(1.18, 3);
    expect(v.rotulo).toBe("con IGV y sin lo de CLAURE");
    // Lo que no debe pasar: 270 ÷ 1,000 = 27 %.
    expect(v.factor).toBeLessThan(1.2);
  });
  it("Tienda LIM noviembre al 8: lo de CAYLA, no lo cobrado en la tienda", () => {
    const v = ventaParaDecir({ ventas: 400, igvCobrado: 180, claureSinIgv: 600 });
    expect(v.vendido).toBe(472);
    expect(v.vendido).toBeLessThan(1_180);
  });
  it("sin la lectura no convierte y lo dice", () => {
    expect(ventaParaDecir({ ventas: 1_000 })).toEqual({ factor: 1, vendido: 1_000, rotulo: "sin IGV" });
  });
  it("sin ventas o con un IGV que no calza, usa el 18 % de respaldo", () => {
    expect(ventaParaDecir({ ventas: 0, igvCobrado: 0, claureSinIgv: 0 }).factor).toBe(1.18);
    expect(ventaParaDecir({ ventas: 100, igvCobrado: -40, claureSinIgv: 0 }).factor).toBe(1.18);
    expect(ventaParaDecir({ ventas: 100, igvCobrado: 90, claureSinIgv: 0 }).factor).toBe(1.18);
  });
  it("con ventas y sin IGV cobrado no le agrega ninguno", () => {
    expect(ventaParaDecir({ ventas: 500, igvCobrado: 0, claureSinIgv: 0 }).factor).toBe(1);
  });
});

describe("metaConIgv: la meta como se escribió", () => {
  it("devuelve la meta como se escribió, sin perder el céntimo del medio", () => {
    expect(metaConIgv(125_000.25)).toBe(147_500.3);
    expect(metaConIgv(80_000)).toBe(94_400);
    expect(metaConIgv(28_000)).toBe(33_040);
    expect(metaConIgv(5_000)).toBe(5_900);
  });
});
