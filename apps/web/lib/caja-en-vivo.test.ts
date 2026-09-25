import { describe, it, expect } from "vitest";
import { selloDeCaja, hayNovedad, nuevosPorId } from "./caja-en-vivo";

describe("selloDeCaja", () => {
  it("el sello de la base es la huella", () => {
    expect(selloDeCaja({ data: "3:0:1:0:0", error: null })).toBe("3:0:1:0:0");
    expect(selloDeCaja({ data: "0:0:0:0:0", error: null })).toBe("0:0:0:0:0"); // caja recién abierta: 0 es un dato
  });

  it("si la consulta falla o no trae texto, no hay huella (no se decide nada)", () => {
    expect(selloDeCaja({ data: null, error: new Error("red") })).toBeNull();
    expect(selloDeCaja({ data: "3:0:1:0:0", error: { message: "42501" } })).toBeNull();
    expect(selloDeCaja({ data: null, error: null })).toBeNull();
    expect(selloDeCaja({ data: "", error: null })).toBeNull();
  });
});

describe("hayNovedad", () => {
  it("la primera medición es la línea base, no una novedad", () => {
    expect(hayNovedad(null, "3:1")).toBe(false);
  });

  it("igual → nada; distinta → novedad", () => {
    expect(hayNovedad("3:1", "3:1")).toBe(false);
    expect(hayNovedad("3:1", "4:1")).toBe(true); // entró una venta
    expect(hayNovedad("3:1", "3:2")).toBe(true); // entró un ingreso o egreso
    expect(hayNovedad("3:0:1:0:0", "3:1:1:0:0")).toBe(true); // se anuló una venta: mismas filas, otro sello
  });

  it("una medición fallida nunca cuenta como novedad ni borra la línea base", () => {
    expect(hayNovedad("3:1", null)).toBe(false);
  });
});

describe("nuevosPorId", () => {
  const v = (id: string) => ({ id });
  it("devuelve solo lo que no se había visto", () => {
    const nuevos = nuevosPorId(new Set(["a", "b"]), [v("a"), v("b"), v("c")], (x) => x.id);
    expect(nuevos).toEqual([{ id: "c" }]);
  });
  it("sin nada visto, todo es nuevo; sin cambios, nada lo es", () => {
    expect(nuevosPorId(new Set(), [v("a")], (x) => x.id)).toHaveLength(1);
    expect(nuevosPorId(new Set(["a"]), [v("a")], (x) => x.id)).toHaveLength(0);
  });
});
