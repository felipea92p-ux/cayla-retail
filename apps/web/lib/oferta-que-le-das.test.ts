import { describe, expect, it } from "vitest";
import { FORMA_DE_FABRICA } from "./campana-reglas";
import { TIPOS_DE_OFERTA, loQueHace, opcionesDeQueLeDas } from "./oferta-que-le-das";

const de = (tipo: keyof typeof FORMA_DE_FABRICA, parche = {}) => ({ ...FORMA_DE_FABRICA[tipo], ...parche });

describe("«Qué le das»: las cinco formas, y el ejemplo es la opción (ADR-0677, 7a)", () => {
  it("las cinco, en el orden de la maqueta; sin elegir, ninguna marcada y con los ejemplos de fábrica", () => {
    const op = opcionesDeQueLeDas(de("pct"), false);
    expect(op.map((x) => x.tipo)).toEqual([...TIPOS_DE_OFERTA]);
    expect(op.some((x) => x.elegida)).toBe(false);
    expect(op.map((x) => `${x.glifo} | ${x.linea}`)).toEqual([
      "−20 % | Descuento",
      "3 x 2 · 2 x 1 | Lleva más, paga menos",
      "2 por S/ 59.90 | Precio por varias",
      "2.ª −50 % | La segunda",
      "−S/ 30 | Desde S/ 300",
    ]);
  });

  it("la elegida dice sus números de ahora; las demás siguen con los de fábrica", () => {
    const op = opcionesDeQueLeDas(de("nxm", { lleva: 2, paga: 1 }), true);
    expect(op[1]).toMatchObject({ elegida: true, glifo: "2 x 1", linea: "Lleva 2, paga 1" });
    expect(op[0]).toMatchObject({ elegida: false, glifo: "−20 %" });
    expect(opcionesDeQueLeDas(de("pct", { porcentaje: 35 }), true)[0].glifo).toBe("−35 %");
    expect(opcionesDeQueLeDas(de("nesima_pct", { lleva: 3, porcentaje: 30 }), true)[3]).toMatchObject({ glifo: "3.ª −30 %", linea: "La 3.ª" });
    expect(opcionesDeQueLeDas(de("n_por_monto", { lleva: 3, monto: 100 }), true)[2].glifo).toBe("3 por S/ 100");
  });

  it("un monto dice su primer escalón, en soles o en %", () => {
    expect(opcionesDeQueLeDas(de("monto", { escalones: [{ desde: 500, ahorra: 50 }] }), true)[4]).toMatchObject({ glifo: "−S/ 50", linea: "Desde S/ 500" });
    expect(opcionesDeQueLeDas(de("monto", { ahorroEn: "pct", escalones: [{ desde: 200, ahorra: 10 }] }), true)[4].glifo).toBe("−10 %");
  });

  it("el % nunca se separa de su número (espacio que no se corta)", () => {
    for (const x of opcionesDeQueLeDas(de("pct"), false)) expect(x.glifo).not.toMatch(/ %/);
  });
});

/** La línea con espacios comunes: los montos llevan un espacio que no se corta («S/\u00a030»). */
const dicho = (f: Parameters<typeof loQueHace>[0]) => loQueHace(f).replace(/\u00a0/g, " ");

describe("«Qué le das»: la línea que dice qué hace la forma elegida (Felipe 2026-11-18)", () => {
  it("cada forma dice lo que la caja cobra, con sus números de ahora", () => {
    expect(dicho(de("pct", { porcentaje: 35 }))).toBe("Cada prenda baja 35 % en caja.");
    expect(dicho(de("nxm"))).toBe("De cada 3 prendas, la más barata va gratis.");
    expect(dicho(de("nxm", { lleva: 5, paga: 3 }))).toBe("De cada 5 prendas, las 2 más baratas van gratis.");
    expect(dicho(de("n_por_monto"))).toBe("2 prendas juntas cuestan S/ 59.90.");
    expect(dicho(de("nesima_pct", { lleva: 3, porcentaje: 30 }))).toBe("De cada 3 prendas, la más barata baja 30 %.");
    expect(dicho(de("monto"))).toBe("Si compra S/ 300 o más, ahorra S/ 30.");
    expect(dicho(de("monto", { ahorroEn: "pct", escalones: [{ desde: 200, ahorra: 10 }] }))).toBe("Si compra S/ 200 o más, ahorra 10 %.");
  });

  it("toda forma de fábrica tiene su línea, y una línea cabe en una (12 palabras o menos)", () => {
    for (const tipo of TIPOS_DE_OFERTA) {
      const linea = dicho(de(tipo));
      expect(linea, tipo).not.toBe("");
      expect(linea.split(" ").length, linea).toBeLessThanOrEqual(12);
    }
  });

  it("calla mientras los números no arman una oferta: eso lo dice el error del campo", () => {
    expect(dicho(de("n_por_monto", { monto: 0 }))).toBe("");
    expect(dicho(de("nxm", { lleva: 2, paga: 2 }))).toBe("");
    expect(dicho(de("monto", { escalones: [] }))).toBe("");
  });
});
