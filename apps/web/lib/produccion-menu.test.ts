import { describe, expect, it } from "vitest";
import { hijosMenuCompras, hijosMenuProduccion, puedeVerCompras, puedeVerProduccion } from "./produccion-menu";

const TIPOS = ["tienda", "almacen", "taller"] as const;

describe("hijosMenuProduccion (ADR-0133, D-A revertida el 2026-09-20)", () => {
  it("parado en el Taller, el líder ve además el Resumen, los Proveedores, Comprobantes, Por pagar y Eficiencia de Producción", () => {
    expect(hijosMenuProduccion({ esLider: true, ubicacionTipo: "taller" })).toEqual(["resumenProduccion", "ordenes", "insumos", "proveedoresProduccion", "comprobantesProduccion", "recibirProduccion", "porPagarProduccion", "eficienciaProduccion"]);
  });

  it("parado en el Taller, quien trabaja ahí ve las pantallas de fabricación y Recibir, pero no Resumen, Proveedores, Comprobantes, Por pagar ni Eficiencia (datos bancarios y montos)", () => {
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "taller" })).toEqual(["ordenes", "insumos", "recibirProduccion"]);
  });

  it("un líder que mira desde una tienda o un almacén NO ve Producción", () => {
    expect(hijosMenuProduccion({ esLider: true, ubicacionTipo: "tienda" })).toEqual([]);
    expect(hijosMenuProduccion({ esLider: true, ubicacionTipo: "almacen" })).toEqual([]);
  });

  it("quien trabaja en una tienda o un almacén no ve el módulo", () => {
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "tienda" })).toEqual([]);
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "almacen" })).toEqual([]);
  });
});

describe("puedeVerProduccion", () => {
  it("depende solo del tipo de la ubicación activa, no del rol", () => {
    expect(TIPOS.filter((ubicacionTipo) => puedeVerProduccion({ ubicacionTipo }))).toEqual(["taller"]);
  });

  it("el menú y la puerta no pueden discrepar: el menú muestra Producción exactamente cuando la página abre", () => {
    for (const esLider of [true, false]) {
      for (const ubicacionTipo of TIPOS) {
        const menuLaMuestra = hijosMenuProduccion({ esLider, ubicacionTipo }).length > 0;
        expect(menuLaMuestra).toBe(puedeVerProduccion({ ubicacionTipo }));
      }
    }
  });
});

describe("hijosMenuCompras (Compras es de las tiendas: parado en el Taller no se muestra — Felipe, 2026-09-21)", () => {
  it("el líder ve las cinco pantallas de Compras desde una tienda o un almacén, en el orden proveedor → factura → recepción → pago → notas", () => {
    for (const ubicacionTipo of ["tienda", "almacen"] as const) {
      expect(hijosMenuCompras({ esLider: true, ubicacionTipo })).toEqual(["proveedores", "comprobantes", "recibir", "porPagar", "notasCredito"]);
    }
  });

  it("parado en el Taller, el líder NO ve Compras: allí se trabaja Producción", () => {
    expect(hijosMenuCompras({ esLider: true, ubicacionTipo: "taller" })).toEqual([]);
  });

  it("quien no es líder no ve Compras, esté donde esté", () => {
    for (const ubicacionTipo of TIPOS) {
      expect(hijosMenuCompras({ esLider: false, ubicacionTipo })).toEqual([]);
    }
  });

  it("el menú y la regla no pueden discrepar", () => {
    for (const esLider of [true, false]) {
      for (const ubicacionTipo of TIPOS) {
        expect(hijosMenuCompras({ esLider, ubicacionTipo }).length > 0).toBe(puedeVerCompras({ esLider, ubicacionTipo }));
      }
    }
  });

  it("en cada ubicación el líder ve UNO de los dos módulos: Producción en el Taller, Compras en las demás", () => {
    for (const ubicacionTipo of TIPOS) {
      const ve = [hijosMenuProduccion({ esLider: true, ubicacionTipo }).length > 0, hijosMenuCompras({ esLider: true, ubicacionTipo }).length > 0];
      expect(ve.filter(Boolean)).toHaveLength(1);
    }
  });
});

describe("Producción y Compras son módulos distintos", () => {
  it("ninguna pantalla aparece en los dos menús", () => {
    // Cada lista se pide donde su módulo SÍ muestra algo (Producción en el Taller, Compras en una tienda): pedida donde sale vacía,
    // la prueba pasaría siempre aunque los dos menús se hubieran mezclado.
    const prod = hijosMenuProduccion({ esLider: true, ubicacionTipo: "taller" }) as string[];
    const comp = hijosMenuCompras({ esLider: true, ubicacionTipo: "tienda" }) as string[];
    expect(prod.length).toBeGreaterThan(0);
    expect(comp.length).toBeGreaterThan(0);
    expect(prod.filter((c) => comp.includes(c))).toEqual([]);
  });
});
