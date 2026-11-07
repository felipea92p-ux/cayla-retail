import { describe, expect, it } from "vitest";
import { puedeVerProduccion } from "./produccion-menu";

const TIPOS = ["tienda", "almacen", "taller"] as const;

describe("puedeVerProduccion", () => {
  it("depende solo del tipo de la ubicación activa, no del rol", () => {
    expect(TIPOS.filter((ubicacionTipo) => puedeVerProduccion({ ubicacionTipo }))).toEqual(["taller"]);
  });
});
