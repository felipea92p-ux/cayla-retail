import { describe, expect, it } from "vitest";
import { formatoSellThroughExposicion, textoExposicionDias, textoPendienteMadurez, textoSinVenta, textoStockPisoAlmacen, tooltipStockPisoAlmacen } from "./resumen-formato";

// Formatos de comportamiento comercial (piso vs. almacén, 2026-09-24): lo que se prueba es que la UI nunca
// muestre una fracción física que no existe — la aproximación decimal de `armarCohortes`
// (`inventario-exposicion.ts`) es válida para el cálculo interno, nunca para lo que lee una persona.

describe("textoPendienteMadurez", () => {
  it("redondea SIEMPRE antes de mostrar: una cohorte dividida proporcionalmente puede dar 4.2857 (sección 7 del pedido)", () => {
    expect(textoPendienteMadurez(4.2857142857142856)).toBe("4 nuevas pendientes");
    expect(textoPendienteMadurez(0.6)).toBe("1 nueva pendiente");
    expect(textoPendienteMadurez(1)).toBe("1 nueva pendiente");
    expect(textoPendienteMadurez(3)).toBe("3 nuevas pendientes");
  });

  it("sin nada pendiente, no hay nota que mostrar", () => {
    expect(textoPendienteMadurez(0)).toBeNull();
    expect(textoPendienteMadurez(0.4)).toBeNull(); // redondea a 0
  });
});

describe("formatoSellThroughExposicion", () => {
  it("entero, nunca decimales sueltos; N/D cuando no hay base", () => {
    expect(formatoSellThroughExposicion(60)).toBe("60%");
    expect(formatoSellThroughExposicion(59.6)).toBe("60%");
    expect(formatoSellThroughExposicion(null)).toBe("N/D");
  });
});

describe("textoExposicionDias", () => {
  it("«N de M días en piso», redondeado", () => {
    expect(textoExposicionDias(6, 7)).toBe("6 de 7 días en piso");
    expect(textoExposicionDias(1, 30)).toBe("1 de 30 días en piso");
  });
});

describe("textoSinVenta", () => {
  it("Vendió hoy / 1 día / N días expuesto / Nunca vendió, nunca días de calendario", () => {
    expect(textoSinVenta({ ultimaVentaEn: "2026-09-24T00:00:00Z", pisoExpuestoDesdeUltimaVentaDias: 0.4 })).toBe("Vendió hoy");
    expect(textoSinVenta({ ultimaVentaEn: "2026-09-01T00:00:00Z", pisoExpuestoDesdeUltimaVentaDias: 1 })).toBe("1 día");
    expect(textoSinVenta({ ultimaVentaEn: "2026-09-01T00:00:00Z", pisoExpuestoDesdeUltimaVentaDias: 9 })).toBe("9 días expuesto");
    expect(textoSinVenta({ ultimaVentaEn: null, pisoExpuestoDesdeUltimaVentaDias: 0 })).toBe("Nunca vendió");
    expect(textoSinVenta({ ultimaVentaEn: null, pisoExpuestoDesdeUltimaVentaDias: 12 })).toBe("Nunca vendió (12 días expuesto)");
    expect(textoSinVenta({ ultimaVentaEn: null, pisoExpuestoDesdeUltimaVentaDias: null })).toBe("N/D");
  });
});

describe("textoStockPisoAlmacen / tooltipStockPisoAlmacen (2026-09-24 — Stock actual P/A)", () => {
  it("A: piso 5, almacén 60 → «5 / 60», tooltip con el desglose y el total", () => {
    expect(textoStockPisoAlmacen({ piso: 5, almacen: 60 })).toBe("5 / 60");
    expect(tooltipStockPisoAlmacen({ piso: 5, almacen: 60 })).toBe("Piso: 5\nAlmacén: 60\nTotal: 65");
  });

  it("B: piso 0, almacén 35 → «0 / 35» (un cero real, no N/D)", () => {
    expect(textoStockPisoAlmacen({ piso: 0, almacen: 35 })).toBe("0 / 35");
  });

  it("C: piso 0, almacén 0 → «0 / 0» (se sabe con certeza que no hay stock, no es lo mismo que 'no lo sabemos')", () => {
    expect(textoStockPisoAlmacen({ piso: 0, almacen: 0 })).toBe("0 / 0");
    expect(tooltipStockPisoAlmacen({ piso: 0, almacen: 0 })).toBe("Piso: 0\nAlmacén: 0\nTotal: 0");
  });

  it("D: sede sin separación piso/almacén → N/D, NUNCA se inventa un 0 para el que falta", () => {
    expect(textoStockPisoAlmacen(null)).toBe("N/D");
    expect(tooltipStockPisoAlmacen(null)).toBe("Esta sede no separa piso de almacén: no se puede saber el split con rigor");
  });
});
