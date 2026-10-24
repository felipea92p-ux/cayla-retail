import { describe, expect, it } from "vitest";
import { juntarTiendas, notaSinRegistrar } from "./etiqueta-rotacion";

describe("juntarTiendas — una talla, todas las tiendas", () => {
  it("suma piso, almacén y lo vendido de cada tienda", () => {
    const suma = juntarTiendas({
      tru: [{ varianteId: "a", piso: 2, almacen: 1, vendidas30: 3 }],
      lim: [
        { varianteId: "a", piso: 0, almacen: 4, vendidas30: 1 },
        { varianteId: "b", piso: 1, almacen: 0, vendidas30: 0 },
      ],
    });
    expect(suma.get("a")).toEqual({ stock: 7, vendidas: 4 });
    expect(suma.get("b")).toEqual({ stock: 1, vendidas: 0 });
  });
  it("un número negativo no resta (la base no debería mandarlo, pero no se confía)", () => {
    expect(juntarTiendas({ tru: [{ varianteId: "a", piso: -2, almacen: 3, vendidas30: -1 }] }).get("a")).toEqual({ stock: 3, vendidas: 0 });
  });
});

describe("notaSinRegistrar — con cuántos datos se juzga", () => {
  it("dice cuántas salieron sin registrar y que las cifras solo ven las registradas", () => {
    expect(notaSinRegistrar(537, 839)).toMatch(/^En 30 días se vendieron 1[,.  ]?376 unidades y 839 salieron sin registrar qué prenda eran: las cifras de abajo solo ven las 537 registradas\.$/);
  });
  it("sin ventas sin registrar, o sin saberlo, no hay nota", () => {
    expect(notaSinRegistrar(500, 0)).toBeNull();
    expect(notaSinRegistrar(500, null)).toBeNull();
  });
});
