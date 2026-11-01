import { describe, expect, it } from "vitest";
import { cantidadTexto, seCuentaEntera, problemaDeCantidad, UNIDADES_INSUMO, type UnidadInsumo } from "./insumos-reglas";

// «0,5» en «¿Ya tienes?» de un botón se aceptaba sin una palabra: la base guardaba `0.500` y la pantalla decía
// «1 unid.». Dos mentiras a la vez — medio botón no existe, y la pantalla no decía lo que había (/chaos de «Nuevo
// avío», 2026-10-31, hallazgo 2; Felipe pidió cerrarlo).
//
// Lo que se cuenta de uno en uno (unidades, conos, pares, docenas) no admite partes. Lo que se mide sí (metros,
// kilos): medio metro de tela es medio metro.

const TODAS = Object.keys(UNIDADES_INSUMO) as UnidadInsumo[];

describe("qué unidades se cuentan de uno en uno", () => {
  it("las que no admiten decimales al pedirlas son las que no admiten partes: una sola fuente, no dos listas", () => {
    for (const u of TODAS) expect(seCuentaEntera(u), u).toBe(UNIDADES_INSUMO[u].decimales === 0);
  });
  it("y son estas, dicho a la cara por si alguien cambia la tabla sin querer", () => {
    expect(TODAS.filter(seCuentaEntera).sort()).toEqual(["cono", "docena", "par", "unidad"]);
    expect(TODAS.filter((u) => !seCuentaEntera(u)).sort()).toEqual(["kilo", "metro"]);
  });
});

describe("medio botón no entra", () => {
  it("el artículo concuerda: «Las unidades», «Los conos» — nada de «Los unidades»", () => {
    expect(problemaDeCantidad(0.5, "unidad")).toMatch(/^Las unidades /);
    expect(problemaDeCantidad(0.5, "docena")).toMatch(/^Las docenas /);
    expect(problemaDeCantidad(0.5, "cono")).toMatch(/^Los conos /);
    expect(problemaDeCantidad(0.5, "par")).toMatch(/^Los pares /);
  });
  it("una fracción se rechaza, con la unidad en el mensaje", () => {
    const p = problemaDeCantidad(0.5, "unidad");
    expect(p).toBeTruthy();
    expect(p).toContain("unidades");
    expect(problemaDeCantidad(0.5, "cono")).toContain("conos");
    expect(problemaDeCantidad(2.5, "par")).toContain("pares");
    expect(problemaDeCantidad(1.001, "docena")).toBeTruthy();
  });
  it("un entero pasa, y el cero y lo vacío no son asunto suyo", () => {
    for (const u of TODAS) {
      expect(problemaDeCantidad(3, u), u).toBeNull();
      expect(problemaDeCantidad(0, u), u).toBeNull();
      expect(problemaDeCantidad(null, u), u).toBeNull();
    }
  });
  it("lo que se MIDE sigue admitiendo partes: medio metro de tela es medio metro", () => {
    expect(problemaDeCantidad(0.5, "metro")).toBeNull();
    expect(problemaDeCantidad(12.25, "metro")).toBeNull();
    expect(problemaDeCantidad(0.75, "kilo")).toBeNull();
  });
});

describe("y la pantalla no dice que es uno", () => {
  it("si de algún modo hubiera media unidad guardada, se VE media, no «1 unid.»", () => {
    // Redondear a 0 decimales mentía en las dos direcciones: 0.5 se veía «1 unid.» y 0.4, «0 unid.».
    expect(cantidadTexto(0.5, "unidad")).not.toBe("1 unid.");
    expect(cantidadTexto(0.5, "unidad")).toContain("0.5");
    expect(cantidadTexto(0.4, "unidad")).toContain("0.4");
    expect(cantidadTexto(2.5, "cono")).toContain("2.5");
  });
  it("un entero se sigue viendo limpio, sin decimales de adorno", () => {
    expect(cantidadTexto(40, "unidad")).toBe("40 unid.");
    expect(cantidadTexto(0, "unidad")).toBe("0 unid.");
    expect(cantidadTexto(1200, "unidad")).toBe("1,200 unid.");
  });
  it("y lo que se mide no cambió: dos decimales siempre (Felipe 2026-10-30)", () => {
    expect(cantidadTexto(0.7, "metro")).toBe("0.70 m");
    expect(cantidadTexto(9, "metro")).toBe("9.00 m");
    expect(cantidadTexto(2.345, "kilo")).toBe("2.35 kg");
  });
});
