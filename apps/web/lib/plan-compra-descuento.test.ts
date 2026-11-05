import { describe, expect, it } from "vitest";
import { camposDelPlan } from "./plan-compra-guia";
import { conDescuentos, fraseDelSugerido, leerDescuentos, sugeridoParcial } from "./plan-compra-descuento";
import { sePuedeConfirmar } from "./guia-campos";
import {
  argsGuardar,
  armarFilas,
  borradorDe,
  calcular,
  cuantilCritico,
  fraseDelMargen,
  leerDescuento,
  leerPlan,
  lineaDeBorrador,
  margenPorPrenda,
  precioEnCampana,
  problemasDelBorrador,
  veredictoDeLoQueSobra,
  type Borrador,
} from "./plan-compra-reglas";

// El descuento de la campaña en el Plan (ADR-0499): lo que se pierde por cada prenda que faltó se mide con el precio CON descuento; lo que
// sobra se recupera sobre el precio de lista (se vende después de la campaña).

const TALLAS = [{ id: "s", valor: "S" }, { id: "m", valor: "M" }];
const BIEN: Borrador = { flojo: "40", normal: "100", bueno: "220", precio: "79.90", costo: "30", recupero: "30", curva: { s: "50", m: "50" } };

describe("precioEnCampana", () => {
  it("lista menos el descuento, a centavos", () => {
    expect(precioEnCampana(79.9, 20)).toBe(63.92);
    expect(precioEnCampana(100, 0)).toBe(100);
    expect(precioEnCampana(100)).toBe(100);
  });
  it("un descuento fuera de 0–100 no da un precio negativo ni mayor que el de lista", () => {
    expect(precioEnCampana(100, 150)).toBe(0);
    expect(precioEnCampana(100, -10)).toBe(100);
  });
});

describe("cuantilCritico con descuento", () => {
  it("sin descuento es la cuenta de siempre", () => {
    expect(cuantilCritico(100, 40, 0)).toBeCloseTo(0.6);
    expect(cuantilCritico(100, 40, 0, 0)).toBeCloseTo(0.6);
  });
  it("con descuento, quedarse corto cuesta menos y el cuantil baja: 100 → 80, margen 60 → 40", () => {
    expect(cuantilCritico(100, 40, 0, 20)).toBeCloseTo(40 / (40 + 40));
  });
  it("lo que sobra se recupera sobre el precio de LISTA, no sobre el de la campaña", () => {
    // Co = 40 − 100 × 0,3 = 10 con o sin descuento; solo cambia Cu (60 → 40).
    expect(cuantilCritico(100, 40, 30, 0)).toBeCloseTo(60 / 70);
    expect(cuantilCritico(100, 40, 30, 20)).toBeCloseTo(40 / 50);
  });
  it("si el descuento se come el margen, Cu = 0 y se compra cerca del flojo", () => {
    expect(cuantilCritico(100, 40, 0, 60)).toBe(0);
    expect(cuantilCritico(100, 40, 0, 70)).toBe(0);
  });
});

describe("calcular: el ejemplo de la propuesta (precio 79,90, costo 30, sobra al 30 %, 40 · 100 · 220)", () => {
  const base = { flojo: 40, normal: 100, bueno: 220, precio: 79.9, costo: 30, recuperoPct: 30 };
  it("sin descuento se compran 172; con −20 %, 163: el descuento mueve poco la cantidad", () => {
    expect(calcular(base, 0).objetivo).toBe(172);
    expect(calcular({ ...base, descuentoPct: 20 }, 0).objetivo).toBe(163);
  });
  it("una línea sin descuentoPct (la base vieja) calcula igual que con 0", () => {
    expect(calcular(base, 0)).toEqual(calcular({ ...base, descuentoPct: 0 }, 0));
  });
  it("el descuento no cambia lo que cuesta cada prenda comprada", () => {
    expect(calcular({ ...base, descuentoPct: 20 }, 0).inversion).toBe(Math.round(163 * 30 * 100) / 100);
  });
});

describe("margenPorPrenda y su frase", () => {
  it("con y sin descuento", () => {
    const m = margenPorPrenda(79.9, 30, 20);
    expect(m).toMatchObject({ lista: 49.9, enCampana: 33.92, precioCampana: 63.92, pierde: false });
    expect(m?.pctEnCampana).toBeCloseTo(53.1, 1);
  });
  it("sin precio o sin costo no hay margen que decir", () => {
    expect(margenPorPrenda(0, 30, 20)).toBeNull();
    expect(margenPorPrenda(80, Number.NaN, 20)).toBeNull();
    expect(fraseDelMargen(0, 30, 20)).toBeNull();
  });
  it("sin descuento no dice nada", () => {
    expect(fraseDelMargen(79.9, 30, 0)).toBeNull();
  });
  it("la frase dice cuánto se gana con descuento, con el formato numérico de es-PE", () => {
    expect(fraseDelMargen(79.9, 30, 20)).toMatch(/^Con −20 % ganas S\/ 33[.,]92 por prenda en vez de S\/ 49[.,]90\.$/);
    expect(fraseDelMargen(79.9, 30, 12.5)).toMatch(/−12[.,]5 %/);
  });
  it("si el descuento se come el margen, lo dice con todas sus letras", () => {
    const f = fraseDelMargen(100, 40, 60);
    expect(f).toMatch(/no deja ganancia/);
    expect(f).not.toMatch(/ganas/);
    expect(margenPorPrenda(100, 40, 60)?.pierde).toBe(true);
    expect(margenPorPrenda(100, 40, 61)?.enCampana).toBe(-1);
  });
});

describe("leerDescuento: lo que escribe la persona", () => {
  it("vacío es sin descuento; acepta coma o punto, hasta dos decimales", () => {
    expect(leerDescuento("")).toBe(0);
    expect(leerDescuento(undefined)).toBe(0);
    expect(leerDescuento("  ")).toBe(0);
    expect(leerDescuento("20")).toBe(20);
    expect(leerDescuento("12,5")).toBe(12.5);
    expect(leerDescuento("12.25")).toBe(12.25);
    expect(leerDescuento("99.99")).toBe(99.99);
  });
  it("100 o más, negativos, letras y de tres decimales no se entienden", () => {
    for (const malo of ["100", "150", "-5", "abc", "12.345", "1e2", "20%"]) expect(leerDescuento(malo)).toBeNull();
  });
});

describe("el borrador y la validación", () => {
  it("un borrador sin descuento (el de antes) sigue siendo válido", () => {
    expect(problemasDelBorrador(BIEN, TALLAS)).toEqual({});
  });
  it("un descuento mal escrito bloquea y dice qué hacer", () => {
    const p = problemasDelBorrador({ ...BIEN, descuento: "100" }, TALLAS);
    expect(Object.keys(p)).toEqual(["descuento"]);
    expect(p.descuento).toMatch(/de 0 a menos de 100/);
  });
  it("lineaDeBorrador lleva el descuento a la cuenta en vivo", () => {
    expect(lineaDeBorrador({ ...BIEN, descuento: "20" }, TALLAS)?.descuentoPct).toBe(20);
    expect(lineaDeBorrador(BIEN, TALLAS)?.descuentoPct).toBe(0);
  });
  it("la categoría sin plan arranca con lo que sugiere la campaña; con plan, con lo guardado", () => {
    expect(borradorDe(undefined, TALLAS, undefined, null, null, 20).descuento).toBe("20");
    expect(borradorDe(undefined, TALLAS, undefined, null, null, 12.5).descuento).toBe("12.5");
    expect(borradorDe(undefined, TALLAS, undefined).descuento).toBe("");
    const guardado = { categoriaId: "c", flojo: 1, normal: 2, bueno: 3, precio: 50, costo: 20, recuperoPct: 40, descuentoPct: 15, curva: {}, nota: null, actualizadoPor: null, actualizadoEn: null, version: null };
    expect(borradorDe(guardado, TALLAS, undefined, null, null, 30).descuento).toBe("15");
    // Un plan guardado sin descuento NO vuelve a tomar el sugerido: la persona ya lo decidió.
    expect(borradorDe({ ...guardado, descuentoPct: 0 }, TALLAS, undefined, null, null, 30).descuento).toBe("");
  });
  it("el veredicto de «lo que sobra» cuenta con el descuento", () => {
    const v = { precio: "100", costo: "30", recupero: "0" };
    expect(veredictoDeLoQueSobra(v)).toMatch(/un poco por encima del normal/);
    expect(veredictoDeLoQueSobra({ ...v, descuento: "60" })).toMatch(/el flojo/);
  });
});

describe("los argumentos hacia la base", () => {
  it("sin base nueva NO viaja p_descuento_pct (una función que no lo conoce rechazaría la llamada)", () => {
    expect("p_descuento_pct" in argsGuardar("p", "c", { ...BIEN, descuento: "20" }, TALLAS, "")).toBe(false);
  });
  it("con la base nueva viaja, y vacío es 0", () => {
    expect(argsGuardar("p", "c", { ...BIEN, descuento: "12,5" }, TALLAS, "", undefined, true).p_descuento_pct).toBe(12.5);
    expect(argsGuardar("p", "c", BIEN, TALLAS, "", undefined, true).p_descuento_pct).toBe(0);
  });
});

describe("leerDescuentos y conDescuentos: lo que guardó el plan y lo que sugiere la campaña", () => {
  const plan = () =>
    leerPlan({
      plan: { id: "p", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25" },
      hoy: "2026-10-24",
      categorias: [{ id: "c", nombre: "Blusas", tallas: [] }, { id: "d", nombre: "Vestidos", tallas: [] }],
      lineas: [{ categoria_id: "c", flojo: 40, normal: 100, bueno: 220, precio: 79.9, costo: 30, recupero_pct: 30, curva: {} }],
    })!;
  const crudo = {
    con_descuento: true,
    campana: { id: "e", nombre: "Navidad", descuento_pct: "20.00" },
    lineas: [{ categoria_id: "c", descuento_pct: "20.00" }],
    sugeridos: [
      { categoria_id: "c", descuento_pct: "20.00", origen: "campana", fuente: "Navidad", desde: "2026-12-11", hasta: "2026-12-25", dias_semana: null, solo_en: null },
      { categoria_id: "d", descuento_pct: "35.00", origen: "oferta", fuente: "Martes y jueves", desde: "2026-12-15", hasta: "2026-12-16", dias_semana: [2, 4], solo_en: ["Tienda Trujillo"] },
    ],
  };
  it("sin la marca con_descuento (base vieja) o con basura, no hay lectura y el plan queda como estaba", () => {
    expect(leerDescuentos(null)).toBeNull();
    expect(leerDescuentos({ ...crudo, con_descuento: false })).toBeNull();
    expect(leerDescuentos("x")).toBeNull();
    const base = plan();
    expect(conDescuentos(base, null)).toBe(base);
    expect(base.conDescuento).toBe(false);
  });
  it("lee lo guardado y los sugeridos, con su origen, sus días y sus tiendas", () => {
    const d = leerDescuentos(crudo)!;
    expect(d.campana).toEqual({ nombre: "Navidad", pct: 20 });
    expect(d.guardado.get("c")).toBe(20);
    expect(d.sugeridos.get("c")).toMatchObject({ pct: 20, origen: "campana", dias: null, soloEn: null });
    expect(d.sugeridos.get("d")).toMatchObject({ pct: 35, origen: "oferta", fuente: "Martes y jueves", dias: [2, 4], soloEn: ["Tienda Trujillo"] });
  });
  it("un sugerido sin nombre, sin categoría o sin % no entra (nunca se inventa un descuento)", () => {
    const d = leerDescuentos({ ...crudo, sugeridos: [{ categoria_id: "c", descuento_pct: 0, fuente: "x" }, { descuento_pct: 20, fuente: "x" }, { categoria_id: "c", descuento_pct: 20 }] })!;
    expect(d.sugeridos.size).toBe(0);
  });
  it("conDescuentos pone el descuento en cada línea y marca que la base lo guarda; las categorías sin plan quedan con su sugerido aparte", () => {
    const p = conDescuentos(plan(), leerDescuentos(crudo))!;
    expect(p.conDescuento).toBe(true);
    expect(p.lineas.get("c")?.descuentoPct).toBe(20);
    expect(p.sugeridosDescuento.get("d")?.pct).toBe(35);
  });
  it("armarFilas calcula con el descuento de la línea y ofrece el sugerido a cada fila", () => {
    const filas = armarFilas(conDescuentos(plan(), leerDescuentos(crudo))!);
    const blusas = filas.find((f) => f.c.id === "c")!;
    expect(blusas.conDescuento).toBe(true);
    expect(blusas.calculo?.objetivo).toBe(163);
    expect(filas.find((f) => f.c.id === "d")?.descuentoSugerido?.pct).toBe(35);
    // Sin la lectura, el mismo plan se calcula a precio de lista (172) y no ofrece el campo.
    const sin = armarFilas(plan());
    expect(sin.find((f) => f.c.id === "c")?.calculo?.objetivo).toBe(172);
    expect(sin.find((f) => f.c.id === "c")?.conDescuento).toBe(false);
    expect(sin.find((f) => f.c.id === "c")?.descuentoSugerido).toBeUndefined();
  });
});

describe("fraseDelSugerido: de dónde sale, dicho como lo diría quien arma el plan", () => {
  const base = { categoriaId: "c", pct: 20, origen: "campana" as const, fuente: "Navidad 2026", desde: "2026-12-11", hasta: "2026-12-25", dias: null, soloEn: null };
  it("la campaña con sus fechas", () => {
    expect(fraseDelSugerido(base)).toMatch(/^La campaña Navidad 2026 da −20 % del 11\/12 al 25\/12\.$/);
    expect(sugeridoParcial(base)).toBe(false);
  });
  it("una oferta con días y tiendas lo dice, y se marca como parcial", () => {
    const o = { ...base, origen: "oferta" as const, fuente: "Martes y jueves", dias: [2, 4], soloEn: ["Tienda Trujillo"] };
    expect(fraseDelSugerido(o)).toBe("La oferta «Martes y jueves» da −20 % del 11/12 al 25/12, solo martes y jueves, solo en Tienda Trujillo.");
    expect(sugeridoParcial(o)).toBe(true);
  });
  it("sin fechas no inventa ninguna", () => {
    expect(fraseDelSugerido({ ...base, desde: null, hasta: null })).toBe("La campaña Navidad 2026 da −20 %.");
  });
});

describe("la guía de foco dice lo mismo que la validación (con descuento)", () => {
  const casos: (string | undefined)[] = [undefined, "", "20", "12,5", "99.99", "100", "abc", "-1"];
  for (const d of casos) {
    for (const listo of [true, false]) {
      it(`descuento ${JSON.stringify(d)}, responsable ${listo ? "listo" : "sin elegir"}`, () => {
        const b = { ...BIEN, descuento: d };
        const valido = Object.keys(problemasDelBorrador(b, TALLAS)).length === 0;
        expect(sePuedeConfirmar(camposDelPlan(b, TALLAS, { listo, motivo: null }))).toBe(valido && listo);
      });
    }
  }
  it("es opcional: vacío no bloquea, mal escrito sí", () => {
    const c = (d: string) => camposDelPlan({ ...BIEN, descuento: d }, TALLAS, { listo: true, motivo: null }).find((x) => x.id === "descuento");
    expect(c("")).toMatchObject({ requerido: false, hecho: false });
    expect(c("20")).toMatchObject({ requerido: false, hecho: true });
    expect(c("100")).toMatchObject({ requerido: true, hecho: false });
  });
});
