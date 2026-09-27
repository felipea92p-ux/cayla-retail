import { describe, expect, it } from "vitest";
import { leerSaldos, textoQuedan, textoQuedaron } from "./movimientos-saldo";

describe("textoQuedan", () => {
  it("dice cuántas quedan en palabras de tienda", () => {
    expect(textoQuedan(4)).toBe("quedan 4");
    expect(textoQuedan(1)).toBe("queda 1");
    expect(textoQuedan(0)).toBe("no queda ninguna");
    expect(textoQuedan(1200)).toBe("quedan 1,200");
  });
  it("sin dato no inventa uno: la fila sigue sin el saldo", () => {
    expect(textoQuedan(null)).toBeNull();
    expect(textoQuedan(undefined)).toBeNull();
    expect(textoQuedan(Number.NaN)).toBeNull();
  });
  it("un saldo negativo (stock roto) no se muestra como «quedan −2»", () => {
    expect(textoQuedan(-2)).toBe("no queda ninguna");
  });
});

describe("leerSaldos", () => {
  it("arma el mapa por id de movimiento", () => {
    expect(leerSaldos([{ movimiento_id: "a", quedan: 3 }, { movimiento_id: "b", quedan: 0 }])).toEqual({ a: 3, b: 0 });
  });
  it("ignora filas raras y respuestas que no son lista", () => {
    expect(leerSaldos([{ movimiento_id: "a" }, { quedan: 2 }, null])).toEqual({});
    expect(leerSaldos(null)).toEqual({});
  });
});

describe("textoQuedaron", () => {
  it("dice el saldo del detalle con el formato de «Hoy en la sede»", () => {
    expect(textoQuedaron(4)).toBe("4 unidades");
    expect(textoQuedaron(1)).toBe("1 unidad");
    expect(textoQuedaron(0)).toBe("No quedó ninguna");
  });
});
