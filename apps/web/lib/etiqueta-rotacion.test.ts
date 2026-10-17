import { describe, expect, it } from "vitest";
import { juntarTiendas, notaSinRegistrar, rotacionDeEtiqueta, textoRotacion } from "./etiqueta-rotacion";

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

describe("rotacionDeEtiqueta — lo de sus prendas", () => {
  const aLaVenta = [
    { id: "a", categoriaId: "c-tops" },
    { id: "b", categoriaId: "c-tops" },
    { id: "c", categoriaId: "c-faldas" },
    { id: "d", categoriaId: null },
  ];
  const porTalla = new Map([
    ["a", { stock: 0, vendidas: 7 }],
    ["c", { stock: 1, vendidas: 0 }],
    ["d", { stock: 5, vendidas: 2 }],
  ]);
  it("cuenta las de sus categorías y las marcadas a mano; la que la lectura no trae vale 0", () => {
    expect(rotacionDeEtiqueta(aLaVenta, new Set(["c-tops"]), new Set(["d"]), porTalla)).toEqual({ tallas: 3, unidades: 5, vendidas: 9, agotadas: 2 });
  });
  it("sin prendas, todo en 0", () => {
    expect(rotacionDeEtiqueta(aLaVenta, new Set(), new Set(), porTalla)).toEqual({ tallas: 0, unidades: 0, vendidas: 0, agotadas: 0 });
  });
});

describe("textoRotacion — en unidades, no en tallas", () => {
  it("«Últimas unidades» de producción: 4 tallas marcadas y queda 1 unidad", () => {
    expect(textoRotacion({ tallas: 4, unidades: 1, vendidas: 2, agotadas: 3 })).toBe("Queda 1 unidad · 2 vendidas en 30 días · 3 tallas agotadas");
  });
  it("sin ventas lo dice, y sin unidades no repite «agotadas»", () => {
    expect(textoRotacion({ tallas: 3, unidades: 12, vendidas: 0, agotadas: 0 })).toBe("Quedan 12 unidades · ninguna vendida en 30 días");
    expect(textoRotacion({ tallas: 2, unidades: 0, vendidas: 1, agotadas: 2 })).toBe("No queda ninguna unidad · 1 vendida en 30 días");
  });
  it("sin prendas no dice nada (la tarjeta ya dice «Sin prendas a la venta»)", () => {
    expect(textoRotacion({ tallas: 0, unidades: 0, vendidas: 0, agotadas: 0 })).toBeNull();
  });
  it("los miles van con su separador", () => {
    expect(textoRotacion({ tallas: 200, unidades: 1250, vendidas: 30, agotadas: 0 })).toMatch(/^Quedan 1[,.  ]?250 unidades/);
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
