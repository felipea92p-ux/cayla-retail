import { describe, expect, it } from "vitest";
import { juntarPorPrenda, prendasNoDisponibles, type LineaTraslado } from "./traslado-lineas-reglas";

const linea = (varianteId: string, cantidad = "1"): LineaTraslado => ({ varianteId, cantidad });

describe("prendasNoDisponibles: lo que una línea no puede elegir", () => {
  it("lo que ya está en OTRA línea queda bloqueado", () => {
    const lineas = [linea("blusa"), linea(""), linea("falda")];
    expect([...prendasNoDisponibles(lineas, 1)].sort()).toEqual(["blusa", "falda"]);
  });

  it("la propia prenda de la línea no se bloquea a sí misma", () => {
    const lineas = [linea("blusa"), linea("falda")];
    expect([...prendasNoDisponibles(lineas, 0)]).toEqual(["falda"]);
    expect([...prendasNoDisponibles(lineas, 1)]).toEqual(["blusa"]);
  });

  it("una línea vacía no bloquea nada: «sin prenda» no es una prenda", () => {
    const lineas = [linea(""), linea("")];
    expect(prendasNoDisponibles(lineas, 0).size).toBe(0);
    expect(prendasNoDisponibles(lineas, 1).size).toBe(0);
  });

  it("si dos líneas ya llegaron con la misma, cada una conserva la suya", () => {
    const lineas = [linea("blusa"), linea("blusa")];
    expect(prendasNoDisponibles(lineas, 0).has("blusa")).toBe(false);
    expect(prendasNoDisponibles(lineas, 1).has("blusa")).toBe(false);
  });

  it("una sola línea no se bloquea nada", () => {
    expect(prendasNoDisponibles([linea("blusa")], 0).size).toBe(0);
  });

  it("al cambiar o quitar una línea, su prenda vuelve a estar disponible para las demás", () => {
    expect(prendasNoDisponibles([linea("blusa"), linea("")], 1).has("blusa")).toBe(true);
    expect(prendasNoDisponibles([linea("falda"), linea("")], 1).has("blusa")).toBe(false);
    expect(prendasNoDisponibles([linea("")], 0).size).toBe(0);
  });

  it("un índice fuera de rango no revienta (la línea acaba de agregarse o de quitarse)", () => {
    expect([...prendasNoDisponibles([linea("blusa")], 5)]).toEqual(["blusa"]);
  });
});

describe("juntarPorPrenda: nunca dos filas de la misma prenda", () => {
  it("sin repetidas, deja todo igual y en el mismo orden", () => {
    expect(
      juntarPorPrenda([
        { varianteId: "blusa", cantidadNum: 3 },
        { varianteId: "falda", cantidadNum: 2 },
      ]),
    ).toEqual([
      { variante_id: "blusa", cantidad: 3 },
      { variante_id: "falda", cantidad: 2 },
    ]);
  });

  it("la misma prenda en dos líneas viaja en UNA fila con las cantidades sumadas", () => {
    expect(
      juntarPorPrenda([
        { varianteId: "blusa", cantidadNum: 3 },
        { varianteId: "falda", cantidadNum: 2 },
        { varianteId: "blusa", cantidadNum: 4 },
      ]),
    ).toEqual([
      { variante_id: "blusa", cantidad: 7 },
      { variante_id: "falda", cantidad: 2 },
    ]);
  });

  it("conserva el total de unidades y no repite ninguna variante", () => {
    const lineas = ["a", "b", "a", "c", "b", "a"].map((varianteId, n) => ({ varianteId, cantidadNum: n + 1 }));
    const filas = juntarPorPrenda(lineas);
    expect(filas.reduce((acc, f) => acc + f.cantidad, 0)).toBe(lineas.reduce((acc, l) => acc + l.cantidadNum, 0));
    expect(new Set(filas.map((f) => f.variante_id)).size).toBe(filas.length);
  });

  it("sin líneas, sin filas", () => {
    expect(juntarPorPrenda([])).toEqual([]);
  });
});
