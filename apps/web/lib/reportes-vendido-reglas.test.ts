import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claureDelVendido, hrefCuadreFinanzas, instanteLima, lineaClaure, pieVendido, TITULO_COLUMNA_VENDIDO } from "./reportes-vendido-reglas";
import type { VendidoEmpresa } from "./vendido-por-empresa-reglas";

// Tarea 77: el «Vendido» de Ventas ▸ Reportes dice qué incluye. Cifras inventadas y redondas (ADR-0609).

const empresa = (clave: string, total: number): VendidoEmpresa => ({ empresaId: clave, clave, nombre: clave.toUpperCase(), orden: clave === "cayla" ? 1 : 2, ventas: 10, unidades: 20, total });
const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");

describe("rótulos de «Vendido»", () => {
  it("la tarjeta y la columna dicen que va con IGV", () => {
    expect(pieVendido("Del 1 al 8 de noviembre")).toBe("Del 1 al 8 de noviembre · con IGV");
    expect(TITULO_COLUMNA_VENDIDO).toBe("Vendido con IGV");
  });

  it("las pantallas usan los rótulos (control: sin el arreglo, la tarjeta y la tabla decían solo «Vendido»)", () => {
    const cifras = leer("components/reportes-ventas/CifrasReporteMes.tsx");
    expect(cifras).toContain("pie={pieVendido(tramoEnPalabras(r))}");
    expect(cifras).toContain("lineaClaure(");
    const tabla = leer("components/reportes-ventas/TablaCortes.tsx");
    expect(tabla).not.toContain('{ titulo: "Vendido" }');
    expect(tabla.match(/titulo: TITULO_COLUMNA_VENDIDO/g)).toHaveLength(2);
    expect(tabla).toContain("lineaClaure(");
  });

  it("el enlace al cuadro solo se arma para quien ve Estados financieros", () => {
    const pagina = leer("app/(app)/vender/reportes/page.tsx");
    expect(pagina).toMatch(/veModulo\(persona, "reportes_financieros"\) \? hrefCuadreFinanzas\(mes, tienda\) : null/);
  });
});

describe("lo de CLAURE", () => {
  it("con Lima o todas, y CLAURE mayor que cero, la línea dice cuánto", () => {
    const monto = claureDelVendido([empresa("cayla", 10000), empresa("claure", 500)]);
    expect(monto).toBe(500);
    expect(lineaClaure(monto)).toBe("Lo vendido incluye S/ 500.00 con IGV de prendas de CLAURE, cobradas en la misma caja.");
  });

  it("con Trujillo (solo CAYLA) no dice «incluye CLAURE» (control: la línea sí sale cuando hay CLAURE)", () => {
    expect(lineaClaure(claureDelVendido([empresa("cayla", 10000)]))).toBeNull();
    expect(lineaClaure(claureDelVendido([empresa("cayla", 10000), empresa("claure", 0)]))).toBeNull();
    expect(lineaClaure(claureDelVendido([empresa("cayla", 10000), empresa("claure", 100)]))).not.toBeNull();
  });

  it("si la lectura falla, no hay línea (nunca una cifra a medias)", () => {
    expect(claureDelVendido(null)).toBe(0);
    expect(lineaClaure(0)).toBeNull();
  });

  it("suma en céntimos, sin arrastre de coma flotante", () => {
    expect(claureDelVendido([empresa("claure", 0.1), empresa("claure", 0.2)])).toBe(0.3);
  });
});

describe("el enlace y el tramo", () => {
  it("lleva al cuadro abierto, con el mes y la sede que se miran", () => {
    expect(hrefCuadreFinanzas({ anio: 2026, mes: 10 }, null)).toBe("/finanzas/reportes?mes=2026-10&cuadre=1#de-ventas-a-finanzas");
    expect(hrefCuadreFinanzas({ anio: 2026, mes: 3 }, "sede-1")).toBe("/finanzas/reportes?mes=2026-03&sede=sede-1&cuadre=1#de-ventas-a-finanzas");
  });

  it("el tramo se lee en días de Lima", () => {
    expect(instanteLima("2026-10-01")).toBe("2026-10-01T00:00:00-05:00");
  });
});
