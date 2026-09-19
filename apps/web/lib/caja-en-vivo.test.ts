import { describe, it, expect } from "vitest";
import { firmaDeConteos, hayNovedad, nuevosPorId } from "./caja-en-vivo";

describe("firmaDeConteos", () => {
  it("junta ventas y movimientos en una huella", () => {
    expect(firmaDeConteos({ count: 3, error: null }, { count: 1, error: null })).toBe("3:1");
    expect(firmaDeConteos({ count: 0, error: null }, { count: 0, error: null })).toBe("0:0"); // caja recién abierta: 0 es un dato
  });

  it("si cualquiera de las dos consultas falla, no hay huella (no se decide nada)", () => {
    expect(firmaDeConteos({ count: null, error: new Error("red") }, { count: 1, error: null })).toBeNull();
    expect(firmaDeConteos({ count: 3, error: null }, { count: null, error: { message: "RLS" } })).toBeNull();
    expect(firmaDeConteos({ count: null, error: null }, { count: 1, error: null })).toBeNull(); // sin conteo tampoco
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
