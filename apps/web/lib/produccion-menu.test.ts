import { describe, expect, it } from "vitest";
import { hijosMenuProduccion } from "./produccion-menu";

describe("hijosMenuProduccion (ADR-0133, D-A)", () => {
  it("el líder ve el recorrido completo desde cualquier ubicación", () => {
    const esperado = ["proveedores", "comprobantes", "recibir", "porPagar", "ordenes"];
    for (const ubicacionTipo of ["tienda", "almacen", "taller"] as const) {
      expect(hijosMenuProduccion({ esLider: true, ubicacionTipo })).toEqual(esperado);
    }
  });

  it("quien trabaja en el Taller ve solo las órdenes (su Recibir sigue en Inventario)", () => {
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "taller" })).toEqual(["ordenes"]);
  });

  it("quien trabaja en una tienda o un almacén no ve el módulo", () => {
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "tienda" })).toEqual([]);
    expect(hijosMenuProduccion({ esLider: false, ubicacionTipo: "almacen" })).toEqual([]);
  });

  it("Recibir aparece a lo sumo una vez, para que la ruta no marque dos filas activas", () => {
    const veces = hijosMenuProduccion({ esLider: true, ubicacionTipo: "tienda" }).filter((c) => c === "recibir").length;
    expect(veces).toBe(1);
  });
});
