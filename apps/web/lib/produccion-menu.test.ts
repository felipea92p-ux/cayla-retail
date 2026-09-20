import { describe, expect, it } from "vitest";
import { hijosMenuCompras, hijosMenuProduccion } from "./produccion-menu";

const TIPOS = ["tienda", "almacen", "taller"] as const;

describe("hijosMenuProduccion (ADR-0133, D-A)", () => {
  it("el líder ve Producción desde cualquier ubicación", () => {
    for (const ubicacionTipo of TIPOS) {
      expect(hijosMenuProduccion({ esLider: true, ubicacionTipo })).toEqual(["ordenes", "insumos"]);
    }
  });

  it("quien trabaja en el Taller ve las pantallas de fabricación", () => {
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "taller" })).toEqual(["ordenes", "insumos"]);
  });

  it("quien trabaja en una tienda o un almacén no ve el módulo", () => {
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "tienda" })).toEqual([]);
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "almacen" })).toEqual([]);
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
});

describe("Producción y Compras son módulos distintos", () => {
  it("ninguna pantalla aparece en los dos menús", () => {
    const prod = hijosMenuProduccion({ esLider: true, ubicacionTipo: "tienda" }) as string[];
    const comp = hijosMenuCompras({ esLider: true, ubicacionTipo: "tienda" }) as string[];
    expect(prod.filter((c) => comp.includes(c))).toEqual([]);
  });
});
