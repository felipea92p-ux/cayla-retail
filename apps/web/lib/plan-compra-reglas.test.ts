import { describe, expect, it } from "vitest";
import {
  argsGuardar,
  borradorDe,
  calcular,
  comprarPorTalla,
  cuantilCritico,
  cuantilTriangular,
  curvaSugerida,
  estadoCampana,
  fraseDeLoReal,
  leerPlan,
  lineaDeBorrador,
  porQue,
  problemasDelBorrador,
  repartir,
  type Borrador,
  type TallaPlan,
} from "./plan-compra-reglas";
import { camposDelPlan } from "./plan-compra-guia";
import { sePuedeConfirmar } from "./guia-campos";

const TALLAS: TallaPlan[] = [
  { id: "s", valor: "S" },
  { id: "m", valor: "M" },
  { id: "l", valor: "L" },
  { id: "xl", valor: "XL" },
];
const BIEN: Borrador = { flojo: "80", normal: "120", bueno: "180", precio: "79.90", costo: "32", recupero: "50", curva: { s: "20", m: "35", l: "30", xl: "15" } };

describe("cuantilCritico: cuánto cuesta quedarse corto frente a pasarse", () => {
  it("precio 100, costo 40, lo que sobra se vende a la mitad: 60 ÷ (60 + 0) → cubrir todo", () => {
    expect(cuantilCritico(100, 40, 50)).toBe(1);
  });
  it("lo que sobra no se recupera: 60 ÷ (60 + 40) = 0,6", () => {
    expect(cuantilCritico(100, 40, 0)).toBeCloseTo(0.6);
  });
  it("margen chico y sobrar caro: se compra corto", () => {
    expect(cuantilCritico(50, 40, 0)).toBeCloseTo(10 / 50);
  });
});

describe("cuantilTriangular", () => {
  it("los extremos y la moda", () => {
    expect(cuantilTriangular(80, 120, 180, 0)).toBe(80);
    expect(cuantilTriangular(80, 120, 180, 1)).toBe(180);
    expect(cuantilTriangular(80, 120, 180, 0.4)).toBeCloseTo(120); // F(moda) = 40/100
  });
  it("sube con el cuantil y no se sale del rango", () => {
    const qs = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => cuantilTriangular(80, 120, 180, p));
    for (let i = 1; i < qs.length; i++) expect(qs[i]).toBeGreaterThan(qs[i - 1]);
    expect(Math.min(...qs)).toBeGreaterThan(80);
    expect(Math.max(...qs)).toBeLessThan(180);
  });
  it("escenarios iguales: ese número", () => {
    expect(cuantilTriangular(50, 50, 50, 0.7)).toBe(50);
  });
});

describe("calcular", () => {
  it("compra hasta el cuantil y descuenta lo que ya hay", () => {
    const c = calcular({ flojo: 80, normal: 120, bueno: 180, precio: 100, costo: 40, recuperoPct: 0 }, 30);
    expect(c.cuantil).toBeCloseTo(0.6);
    expect(c.objetivo).toBe(Math.ceil(cuantilTriangular(80, 120, 180, 0.6)));
    expect(c.comprar).toBe(c.objetivo - 30);
    expect(c.inversion).toBeCloseTo(c.comprar * 40);
    expect(porQue(c)).toContain("60 de cada 100");
  });
  it("si sobrar no cuesta, el porqué lo dice en palabras (no «100 de cada 100»)", () => {
    expect(porQue(calcular({ flojo: 1, normal: 2, bueno: 3, precio: 100, costo: 40, recuperoPct: 50 }, 0))).toContain("casi al costo");
  });
  it("si ya hay más de lo que conviene, no compra (nunca negativo)", () => {
    expect(calcular({ flojo: 10, normal: 20, bueno: 30, precio: 100, costo: 40, recuperoPct: 0 }, 500).comprar).toBe(0);
  });
  it("dos categorías con la misma venta esperada compran distinto según cuánto cuesta sobrar", () => {
    const basico = calcular({ flojo: 80, normal: 120, bueno: 180, precio: 60, costo: 25, recuperoPct: 90 }, 0);
    const moda = calcular({ flojo: 80, normal: 120, bueno: 180, precio: 60, costo: 25, recuperoPct: 10 }, 0);
    expect(basico.comprar).toBeGreaterThan(moda.comprar);
  });
});

describe("repartir y la curva", () => {
  it("enteros que suman exacto", () => {
    const r = repartir(100, [{ id: "a", peso: 1 }, { id: "b", peso: 1 }, { id: "c", peso: 1 }]);
    expect([...r.values()].reduce((s, x) => s + x, 0)).toBe(100);
    expect(r.get("a")).toBe(34);
  });
  it("sin ventas, la curva es pareja", () => {
    expect(curvaSugerida(TALLAS, undefined)).toEqual({ s: 25, m: 25, l: 25, xl: 25 });
  });
  it("con pocas ventas, se apoya en el reparto parejo; con muchas, manda lo vendido", () => {
    const pocas = curvaSugerida(TALLAS, new Map([["m", 2]]));
    expect(pocas.m).toBeGreaterThan(25);
    expect(pocas.m).toBeLessThan(50);
    const muchas = curvaSugerida(TALLAS, new Map([["s", 20], ["m", 70], ["l", 60], ["xl", 50]]));
    expect(Object.values(muchas).reduce((s, x) => s + x, 0)).toBe(100);
    expect(muchas.m).toBeGreaterThan(muchas.s);
    expect(muchas.m).toBeGreaterThan(30);
  });
  it("una categoría sin tallas no tiene curva", () => {
    expect(curvaSugerida([], new Map())).toEqual({});
  });
  it("comprarPorTalla sigue la curva, o reparte parejo sin ella", () => {
    const r = comprarPorTalla(40, TALLAS, { s: 20, m: 35, l: 30, xl: 15 });
    expect([...r.values()]).toEqual([8, 14, 12, 6]);
    expect([...comprarPorTalla(10, TALLAS, {}).values()].reduce((s, x) => s + x, 0)).toBe(10);
  });
});

describe("problemasDelBorrador: lo mismo que rechaza la base", () => {
  it("un borrador completo no tiene problemas", () => {
    expect(problemasDelBorrador(BIEN, TALLAS)).toEqual({});
  });
  it("escenarios desordenados, costo ≥ precio, recupero > 100, curva que no suma 100", () => {
    const p = problemasDelBorrador({ ...BIEN, normal: "60", costo: "80", recupero: "120", curva: { s: "50", m: "60" } }, TALLAS);
    expect(Object.keys(p).sort()).toEqual(["costo", "curva", "normal", "recupero"]);
    expect(p.curva).toBe("La curva suma 110 %: tiene que sumar 100 %.");
  });
  it("la curva vacía vale (todavía no se decidió); el flojo puede ser 0", () => {
    expect(problemasDelBorrador({ ...BIEN, flojo: "0", curva: {} }, TALLAS)).toEqual({});
  });
  it("vacío: todo falta salvo la curva", () => {
    const p = problemasDelBorrador({ flojo: "", normal: "", bueno: "", precio: "", costo: "", recupero: "", curva: {} }, TALLAS);
    expect(Object.keys(p).sort()).toEqual(["bueno", "costo", "flojo", "normal", "precio", "recupero"]);
  });
});

describe("la guía de foco dice lo mismo que la validación", () => {
  const casos: Borrador[] = [
    BIEN,
    { ...BIEN, flojo: "" },
    { ...BIEN, normal: "10" },
    { ...BIEN, bueno: "100" },
    { ...BIEN, precio: "0" },
    { ...BIEN, costo: "90" },
    { ...BIEN, recupero: "101" },
    { ...BIEN, curva: { s: "10" } },
    { ...BIEN, curva: {} },
    { flojo: "", normal: "", bueno: "", precio: "", costo: "", recupero: "", curva: {} },
  ];
  for (const [i, b] of casos.entries()) {
    for (const listo of [true, false]) {
      it(`caso ${i}, responsable ${listo ? "listo" : "sin elegir"}`, () => {
        const campos = camposDelPlan(b, TALLAS, { listo, motivo: null });
        const valido = Object.keys(problemasDelBorrador(b, TALLAS)).length === 0;
        expect(sePuedeConfirmar(campos)).toBe(valido && listo);
      });
    }
  }
});

describe("borrador, args y lo real", () => {
  it("una categoría sin plan arranca vacía con la curva propuesta; con plan, trae lo guardado", () => {
    const vacio = borradorDe(undefined, TALLAS, undefined);
    expect(vacio.flojo).toBe("");
    expect(vacio.curva).toEqual({ s: "25", m: "25", l: "25", xl: "25" });
    const guardado = borradorDe({ categoriaId: "c", flojo: 1, normal: 2, bueno: 3, precio: 50, costo: 20, recuperoPct: 40, curva: { s: 100 }, nota: null, actualizadoPor: null, actualizadoEn: null }, TALLAS, undefined);
    expect(guardado).toMatchObject({ flojo: "1", precio: "50.00", recupero: "40", curva: { s: "100" } });
  });
  it("los argumentos van como los espera la base", () => {
    expect(argsGuardar("p", "c", { ...BIEN, precio: "79,90" }, TALLAS, "  ")).toEqual({
      p_plan_id: "p", p_categoria_id: "c", p_flojo: 80, p_normal: 120, p_bueno: 180, p_precio: 79.9, p_costo: 32, p_recupero_pct: 50,
      p_curva: { s: 20, m: 35, l: 30, xl: 15 }, p_nota: null,
    });
    expect(argsGuardar("p", "c", { ...BIEN, curva: {} }, TALLAS, "x").p_curva).toEqual({});
  });
  it("lineaDeBorrador calcula solo si el borrador vale", () => {
    expect(lineaDeBorrador(BIEN, TALLAS)?.normal).toBe(120);
    expect(lineaDeBorrador({ ...BIEN, costo: "" }, TALLAS)).toBeNull();
  });
  it("antes, durante y después; y la frase de enero", () => {
    expect(estadoCampana("2026-10-05", "2026-12-01", "2026-12-31")).toBe("antes");
    expect(estadoCampana("2026-12-15", "2026-12-01", "2026-12-31")).toBe("durante");
    expect(estadoCampana("2027-01-02", "2026-12-01", "2026-12-31")).toBe("despues");
    expect(fraseDeLoReal(140, { flojo: 80, normal: 120, bueno: 180 })).toBe("Se vendieron 140: entre el normal y el bueno.");
    expect(fraseDeLoReal(200, { flojo: 80, normal: 120, bueno: 180 })).toBe("Se vendieron 200: más que el diciembre bueno.");
  });
});

describe("leerPlan", () => {
  it("lee la respuesta de la base", () => {
    const l = leerPlan({
      plan: { id: "p", nombre: "Diciembre 2026", desde: "2026-12-01", hasta: "2026-12-31" },
      hoy: "2026-10-05",
      planes: [{ id: "p", nombre: "Diciembre 2026" }],
      categorias: [{ id: "c", nombre: "Polos", prefijo: "POL", familia: "indumentaria", tallas: [{ id: "s", valor: "S" }] }],
      lineas: [{ categoria_id: "c", flojo: 1, normal: 2, bueno: 3, precio: "50.00", costo: "20.00", recupero_pct: 40, curva: { s: 100 }, nota: null }],
      stock: [{ categoria_id: "c", unidades: 7 }],
      curvas: [{ categoria_id: "c", talla_id: "s", unidades: 4 }],
      vendido: [{ categoria_id: "c", unidades: 9 }],
    })!;
    expect(l.categorias[0].tallas).toHaveLength(1);
    expect(l.lineas.get("c")?.precio).toBe(50);
    expect(l.stock.get("c")).toBe(7);
    expect(l.vendidoPorTalla.get("c")?.get("s")).toBe(4);
    expect(l.vendidoEnCampana.get("c")).toBe(9);
  });
  it("forma rara → null", () => {
    expect(leerPlan(null)).toBeNull();
    expect(leerPlan({ plan: {} })).toBeNull();
  });
});
