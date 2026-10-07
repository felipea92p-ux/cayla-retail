import { describe, expect, it } from "vitest";
import { celdaColgarVarias, llenarTodasCon, totalesColgar } from "./colgar-varias-tabla";

const t = (id: string, talla: string, piso: number, almacen: number) => ({ varianteId: id, talla, pisoDisponible: piso, almacenDisponible: almacen });

describe("celdaColgarVarias", () => {
  const faltan = new Set(["a"]);
  it("con algo en almacén se edita; dice si falta en el piso", () => {
    expect(celdaColgarVarias(t("a", "S", 0, 3), faltan)).toEqual({ tipo: "editable", falta: true, piso: 0, almacen: 3 });
    expect(celdaColgarVarias(t("b", "M", 2, 1), faltan)).toEqual({ tipo: "editable", falta: false, piso: 2, almacen: 1 });
  });
  it("sin almacén no se edita: dice lo colgado, o «se acabó» si no queda nada", () => {
    expect(celdaColgarVarias(t("c", "L", 1, 0), faltan)).toEqual({ tipo: "sinAlmacen", piso: 1 });
    expect(celdaColgarVarias(t("d", "XL", 0, 0), faltan)).toEqual({ tipo: "acabo" });
  });
});

describe("llenarTodasCon", () => {
  const tallas = [t("a", "S", 0, 3), t("b", "M", 0, 1), t("c", "L", 2, 0)];
  it("pone N en cada celda editable, nunca más de lo que hay en su almacén", () => {
    expect(llenarTodasCon(tallas, 2)).toEqual({ a: 2, b: 1 });
  });
  it("vacío deja todas en 0", () => {
    expect(llenarTodasCon(tallas, null)).toEqual({ a: 0, b: 0 });
  });
});

describe("totalesColgar", () => {
  it("suma por color, por talla y en total, y cuenta las tallas tocadas", () => {
    const colores = [
      { clave: "verde", tallas: [t("a", "S", 0, 3), t("b", "M", 0, 3)] },
      { clave: "rojo", tallas: [t("c", "S", 1, 1)] },
    ];
    expect(totalesColgar(colores, { a: 2, b: 1, c: 1 })).toEqual({ porColor: { verde: 3, rojo: 1 }, porTalla: { S: 3, M: 1 }, total: 4, tallas: 3 });
  });
});
