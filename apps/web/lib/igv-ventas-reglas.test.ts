import { describe, expect, it } from "vitest";
import { conIgvDeLasVentas, leerFilasIgvVentas } from "./igv-ventas-reglas";
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
    const [cayla, empresa, tru, otra] = conIgvDeLasVentas([columna("consolidado", null), columna("empresa", null), columna("tienda", "tru"), columna("tienda", "aqp")], igv);
    expect(cayla!.igvCobrado).toBe(188);
    expect(empresa!.igvCobrado).toBe(-1.5);
    expect(tru!.igvCobrado).toBe(108);
    expect(otra!.igvCobrado).toBe(0);
  });
  it("no toca ninguna cifra del libro", () => {
    const [f] = conIgvDeLasVentas([columna("tienda", "tru")], igv);
    expect(f).toMatchObject({ ventas: 100, margen: 50, resultado: 10 });
  });
  it("sin la lectura, las columnas quedan tal cual, sin el IGV", () => {
    const [f] = conIgvDeLasVentas([columna("tienda", "tru")], null);
    expect(f!.igvCobrado).toBeUndefined();
  });
});
