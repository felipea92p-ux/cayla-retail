import { describe, expect, it } from "vitest";
import { leerPanelFiltros } from "./panel-filtros";

describe("panel-filtros — abierto por defecto, cerrado solo si se cerró", () => {
  it("sin cookie o con algo raro, abierto", () => {
    for (const v of [undefined, null, "", "abierto", "CERRADO", "0"]) expect(leerPanelFiltros(v)).toBe("abierto");
  });
  it("si se cerró en este equipo, vuelve cerrado", () => {
    expect(leerPanelFiltros("cerrado")).toBe("cerrado");
  });
});
