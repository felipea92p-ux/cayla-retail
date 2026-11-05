import { describe, expect, it } from "vitest";
import { primerPasoMetas, alturas, heredaLoNormal, mesMasAlto, mesTipico, montoCorto, semanaEfectiva } from "./metas-tubos-reglas";

describe("los tubos de Metas", () => {
  it("«Lo normal» se lleva a 30 días para compararse; sin metas no vale nada", () => {
    expect(mesTipico([700, 700, 700, 700, 700, 700, 700])).toBe(21000);
    expect(mesTipico([700, null, null, null, null, null, null])).toBe(3000);
    expect(mesTipico([null, null, null, null, null, null, null])).toBeNull();
  });

  it("cada tubo se mide contra el más alto, y uno muy chico igual se ve", () => {
    expect(alturas([100, 50, null])).toEqual([1, 0.5, 0]);
    expect(alturas([1000, 1])).toEqual([1, 0.04]);
  });

  it("sin ninguna meta, todos vacíos", () => {
    expect(alturas([null, null])).toEqual([0, 0]);
    expect(alturas([0, null])).toEqual([0, 0]);
  });

  it("el monto corto cabe bajo el tubo", () => {
    expect(montoCorto(null)).toBe("—");
    expect(montoCorto(850)).toBe("850");
    expect(montoCorto(123456)).toBe("123 mil");
    expect(montoCorto(1_250_000)).toBe("1.3 M");
  });

  it("un mes sin días propios usa lo normal; uno con un solo día, ese día y lo normal en el resto", () => {
    const normal = [100, 100, 100, 100, 100, 100, 100];
    expect(heredaLoNormal(Array(7).fill(null))).toBe(true);
    expect(heredaLoNormal([200, null, null, null, null, null, null])).toBe(false);
    expect(semanaEfectiva([200, null, null, null, null, null, null], normal)).toEqual([200, 100, 100, 100, 100, 100, 100]);
  });

  it("el mes más alto ignora los que no tienen dato", () => {
    expect(mesMasAlto([{ total: null, n: "a" }, { total: 50, n: "b" }, { total: 80, n: "c" }])?.n).toBe("c");
    expect(mesMasAlto([{ total: null }])).toBeNull();
  });
});

describe("por dónde empezar en Metas", () => {
  it("una tienda sin semana normal empieza por ahí; con un día escrito, ya no lo dice", () => {
    expect(primerPasoMetas([null, null, null, null, null, null, null])).toContain("Normal");
    expect(primerPasoMetas([700, null, null, null, null, null, null])).toBeNull();
  });
});
