import { describe, expect, it } from "vitest";
import { hijosMenuCompras, hijosMenuProduccion, puedeVerProduccion } from "./produccion-menu";

const TIPOS = ["tienda", "almacen", "taller"] as const;

describe("hijosMenuProduccion (ADR-0133, D-A revertida el 2026-09-20)", () => {
  it("parado en el Taller, el líder ve además los Proveedores de Producción", () => {
    expect(hijosMenuProduccion({ esLider: true, ubicacionTipo: "taller" })).toEqual(["ordenes", "insumos", "proveedoresProduccion"]);
  });

  it("parado en el Taller, quien trabaja ahí ve las pantallas de fabricación pero no los Proveedores (datos bancarios y montos)", () => {
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "taller" })).toEqual(["ordenes", "insumos"]);
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

describe("hijosMenuCompras", () => {
  it("el líder ve las cinco pantallas de Compras, en el orden proveedor → factura → recepción → pago → notas", () => {
    for (const ubicacionTipo of TIPOS) {
      expect(hijosMenuCompras({ esLider: true, ubicacionTipo })).toEqual(["proveedores", "comprobantes", "recibir", "porPagar", "notasCredito"]);
    }
  });

  it("quien no es líder no ve Compras, ni siquiera trabajando en el Taller", () => {
    for (const ubicacionTipo of TIPOS) {
      expect(hijosMenuCompras({ esLider: false, ubicacionTipo })).toEqual([]);
    }
  });

  it("Compras no depende de dónde está parado el líder: Producción cambió de regla, Compras no", () => {
    // Guardia contra un arreglo «por simetría»: la regla del Taller no se le aplica a Compras.
    // Se compara contra otro tipo de ubicación en vez de contra un número fijo: así el día que Compras gane
    // o pierda una pantalla (hoy son cinco, desde ADR-0142) la prueba sigue diciendo lo que quiere decir.
    expect(hijosMenuCompras({ esLider: true, ubicacionTipo: "tienda" })).toEqual(hijosMenuCompras({ esLider: true, ubicacionTipo: "taller" }));
    expect(hijosMenuCompras({ esLider: true, ubicacionTipo: "tienda" })).toHaveLength(5);
  });
});

describe("Producción y Compras son módulos distintos", () => {
  it("ninguna pantalla aparece en los dos menús", () => {
    // Se prueba parado en el Taller, el único lugar donde Producción muestra algo: en una tienda la lista sale vacía y
    // la prueba pasaría siempre, aunque los dos menús se hubieran mezclado.
    const prod = hijosMenuProduccion({ esLider: true, ubicacionTipo: "taller" }) as string[];
    const comp = hijosMenuCompras({ esLider: true, ubicacionTipo: "taller" }) as string[];
    expect(prod.length).toBeGreaterThan(0);
    expect(prod.filter((c) => comp.includes(c))).toEqual([]);
  });
});
