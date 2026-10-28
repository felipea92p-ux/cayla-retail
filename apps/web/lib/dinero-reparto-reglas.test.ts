import { describe, expect, it } from "vitest";
import type { GrupoCuentas } from "./dinero-telar-reglas";
import { porcentajesEnteros, repartoDeDinero, trazoDeArco } from "./dinero-reparto-reglas";

const SEDES = [
  { clave: "aqp", color: "aqp" as const },
  { clave: "lim", color: "lim" as const },
  { clave: "tru", color: "tru" as const },
];
const g = (clave: string, titulo: string, total: number, ocultos = false): GrupoCuentas => ({ clave, titulo, total, ocultos, filas: [], nota: null });
// Un día cualquiera con cifras inventadas: las tiendas, la empresa y lo en camino, que está en negativo.
const HOY = [g("aqp", "Tienda AQP", 1500), g("lim", "Tienda LIM", 200), g("tru", "Tienda TRU", 3700), g("tal", "Taller", 0), g("empresa", "CAYLA entera", 20000), g("camino", "En camino", -24000)];

describe("porcentajesEnteros", () => {
  it("suma siempre 100: tres tercios dan 33 + 33 + 34, no 99", () => {
    const p = porcentajesEnteros([1, 1, 1]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...p].sort()).toEqual([33, 33, 34]);
  });
  it("le da el entero que sobra al que tiene mayor resto", () => {
    expect(porcentajesEnteros([60.6, 39.4])).toEqual([61, 39]);
  });
  it("con todo en cero no inventa porcentajes", () => {
    expect(porcentajesEnteros([0, 0])).toEqual([0, 0]);
  });
  it("para muchas combinaciones, la suma es 100 y nadie se aleja más de un punto de su valor exacto", () => {
    for (let a = 1; a <= 40; a++) {
      for (let b = 1; b <= 40; b += 3) {
        const partes = [a, b, 17, 5.5];
        const total = partes.reduce((x, y) => x + y, 0);
        const p = porcentajesEnteros(partes);
        expect(p.reduce((x, y) => x + y, 0)).toBe(100);
        p.forEach((v, i) => expect(Math.abs(v - (partes[i]! / total) * 100)).toBeLessThan(1));
      }
    }
  });
});

describe("repartoDeDinero", () => {
  const r = repartoDeDinero(HOY, SEDES)!;
  it("ordena de la que más tiene a la que menos y deja fuera lo que está en cero", () => {
    expect(r.porciones.map((x) => x.clave)).toEqual(["empresa", "tru", "aqp", "lim"]);
  });
  it("lo negativo no entra al círculo: se dice aparte, y el total lo resta (es el «Tienes» de la cabecera)", () => {
    expect(r.aparte).toEqual([{ clave: "camino", titulo: "En camino", monto: -24000 }]);
    expect(r.enCuentas).toBe(25400);
    expect(r.neto).toBe(1400);
  });
  it("los porcentajes enteros suman 100 y los ángulos cubren el círculo completo sin saltos", () => {
    expect(r.porciones.reduce((a, p) => a + p.pctEntero, 0)).toBe(100);
    expect(r.porciones[0]!.desde).toBe(0);
    expect(r.porciones.at(-1)!.hasta).toBe(360);
    r.porciones.slice(1).forEach((p, i) => expect(p.desde).toBeCloseTo(r.porciones[i]!.hasta, 9));
  });
  it("el ángulo de cada porción es proporcional a su plata", () => {
    for (const p of r.porciones) expect(p.hasta - p.desde).toBeCloseTo((p.monto / r.enCuentas) * 360, 6);
  });
  it("cada porción lleva el color de su sede, que es un token y nunca un hex", () => {
    expect(r.porciones.find((p) => p.clave === "tru")!.color).toBe("var(--color-sede-tru)");
    expect(r.porciones.find((p) => p.clave === "empresa")!.color).toBe("var(--color-sede-emp)");
    expect(r.porciones.every((p) => !p.color.includes("#"))).toBe(true);
  });
  it("sin nada negativo no hay «aparte» y el neto es lo que suma el círculo", () => {
    const sano = repartoDeDinero([g("aqp", "AQP", 100), g("tru", "TRU", 300)], SEDES)!;
    expect(sano.aparte).toEqual([]);
    expect(sano.neto).toBe(sano.enCuentas);
    expect(sano.porciones.map((p) => p.pctEntero)).toEqual([75, 25]);
  });
  it("avisa cuando algún grupo no deja ver su saldo", () => {
    expect(repartoDeDinero([g("aqp", "AQP", 100, true), g("tru", "TRU", 300)], SEDES)!.ocultos).toBe(true);
    expect(r.ocultos).toBe(false);
  });
  it("con menos de dos grupos con plata no hay círculo: una sede elegida, un grupo vacío o todo en cero", () => {
    expect(repartoDeDinero([g("tru", "TRU", 500)], SEDES)).toBeNull();
    expect(repartoDeDinero([g("tru", "TRU", 500), g("lim", "LIM", 0)], SEDES)).toBeNull();
    expect(repartoDeDinero([g("tru", "TRU", 500), g("camino", "En camino", -40)], SEDES)).toBeNull();
    expect(repartoDeDinero([], SEDES)).toBeNull();
  });
});

describe("trazoDeArco", () => {
  it("la primera porción arranca arriba, a las 12, y gira con el reloj", () => {
    const d = trazoDeArco(0, 90, 80, 100, 0);
    expect(d).toBe("M100 20A80 80 0 0 1 180 100");
  });
  it("una porción de más de media vuelta pide el arco grande", () => {
    expect(trazoDeArco(0, 200, 80, 100, 0)).toContain("A80 80 0 1 1");
    expect(trazoDeArco(0, 170, 80, 100, 0)).toContain("A80 80 0 0 1");
  });
  it("deja un hueco entre porciones, pero una rebanada fina no desaparece ni se voltea", () => {
    const fina = trazoDeArco(10, 10.5, 80, 100, 2.4);
    const [ini, fin] = fina.replace("M", "").split("A");
    expect(ini).not.toBe(fin!.split(" ").slice(-2).join(" "));
    expect(fina).toContain("A80 80 0 0 1");
  });
});
