import { describe, expect, it } from "vitest";
import { calcular, type FilaPlan } from "./plan-compra-reglas";
import type { PropuestaCategoria } from "./plan-compra-propuesta";
import { planConGanancia, planConPrecioDeLaPlata, type LineaDeTope } from "./plan-compra-tope";
import { cifrasDelPresupuesto, etiquetaDeLosDatos, filasDeCosto, fraseDelDescuentoDelPlan, fraseDelRecuperoDelPlan, solesEnterosES, tramosDeLaPlata } from "./plan-compra-presupuesto";

const lineas: LineaDeTope[] = [
  { clave: "polos", nombre: "Polos", stock: 458, linea: { precio: 39.9, costo: 19, recuperoPct: 50, flojo: 350, normal: 438, bueno: 876 } },
  { clave: "tops", nombre: "Tops", stock: 264, linea: { precio: 47.47, costo: 24.46, recuperoPct: 40, flojo: 182, normal: 227, bueno: 454 } },
  { clave: "pantalones", nombre: "Pantalones", stock: 107, linea: { precio: 89.9, costo: 42, recuperoPct: 55, flojo: 130, normal: 162, bueno: 324 } },
  { clave: "vestidos", nombre: "Vestidos", stock: 194, linea: { precio: 109.9, costo: 50, recuperoPct: 30, flojo: 68, normal: 85, bueno: 170 } },
];

describe("soles enteros", () => {
  it("sin centavos, con miles, y nunca -0", () => {
    expect(solesEnterosES(33481.72)).toBe("S/\u00a033,482");
    expect(solesEnterosES(-0.3)).toBe("S/\u00a00");
    expect(solesEnterosES(0)).toBe("S/\u00a00");
  });
});

describe("las cifras del Presupuesto", () => {
  const plan = planConGanancia(lineas, 0);
  it("si te pasas, dice cuánto y qué % del tope", () => {
    const c = cifrasDelPresupuesto(plan, 5000);
    expect(c.pasa).toBeCloseTo(plan.inversion - 5000, 2);
    expect(c.pasa!).toBeGreaterThan(0);
    expect(c.pasaPct).toBe(Math.round(((plan.inversion - 5000) / 5000) * 100));
  });
  it("si no te pasas, lo que queda es negativo y no hay porcentaje", () => {
    const c = cifrasDelPresupuesto(plan, plan.inversion + 1000);
    expect(c.pasa).toBe(-1000);
    expect(c.pasaPct).toBeNull();
  });
  it("sin tope no hay cuánto te pasas", () => {
    expect(cifrasDelPresupuesto(plan, null)).toMatchObject({ tope: null, pasa: null, pasaPct: null });
  });
  it("lleva lo que se espera ganar y por cada sol", () => {
    const c = cifrasDelPresupuesto(plan, null);
    expect(c.ganancia).toBe(plan.ganancia);
    expect(c.porSol).toBe(plan.porSol);
    expect(c.prendas).toBe(plan.prendas);
  });
});

describe("dónde se va la plata", () => {
  it("de la categoría que más cuesta a la que menos, sin las que no cuestan nada", () => {
    const plan = planConPrecioDeLaPlata(lineas, 0);
    const tramos = tramosDeLaPlata(plan);
    expect(tramos.every((t) => t.valor > 0)).toBe(true);
    for (let i = 1; i < tramos.length; i++) expect(tramos[i - 1].valor).toBeGreaterThanOrEqual(tramos[i].valor);
    expect(tramos.reduce((s, t) => s + t.valor, 0)).toBeCloseTo(plan.inversion, 2);
  });
  it("una categoría que no compra no sale", () => {
    const plan = planConPrecioDeLaPlata([{ ...lineas[0], stock: 99_999 }, lineas[1]], 0);
    expect(tramosDeLaPlata(plan).map((t) => t.clave)).toEqual(["tops"]);
  });
});

describe("cuánto creerle a cada categoría", () => {
  const propuesta = { flojo: 1, normal: 2, bueno: 3 } as unknown as PropuestaCategoria;
  it("una categoría que no vendió nada dice que su plan lo escribiste tú", () => {
    expect(etiquetaDeLosDatos(null, 26, false)).toMatchObject({ tono: "neutro", texto: "Sin ventas" });
  });
  it("con pocos días de ventas es orientativo, y la ayuda es la del aviso de exactitud", () => {
    const e = etiquetaDeLosDatos(propuesta, 26, false)!;
    expect(e).toMatchObject({ tono: "ambar", texto: "Orientativo" });
    expect(e.ayuda).toContain("26 de 90");
  });
  it("con 90 días pero sin la campaña del año pasado, aproximado", () => {
    expect(etiquetaDeLosDatos(propuesta, 90, false)).toMatchObject({ tono: "pizarra", texto: "Aproximado" });
  });
  it("con 90 días y la campaña del año pasado, exacto", () => {
    expect(etiquetaDeLosDatos(propuesta, 90, true)).toMatchObject({ tono: "verde", texto: "Exacto" });
  });
  it("si la base no manda la propuesta, o no se sabe cuántos días hay, no se inventa nada", () => {
    expect(etiquetaDeLosDatos(undefined, 26, false)).toBeNull();
    expect(etiquetaDeLosDatos(propuesta, undefined, false)).toBeNull();
  });
});

describe("la tabla «Cuánto cuesta cada categoría»", () => {
  const fila = (clave: string, nombre: string, extra: Partial<FilaPlan> = {}) => ({ c: { id: clave, nombre }, linea: undefined, ...extra }) as unknown as FilaPlan;
  it("ordena por lo que cuesta, saca el % del total y pone la etiqueta de datos de cada categoría", () => {
    const plan = planConGanancia(lineas, 0);
    const filas = [fila("polos", "Polos", { propuesta: null }), fila("tops", "Tops", { propuesta: { flojo: 1, normal: 2, bueno: 3 } as unknown as PropuestaCategoria, diasDeVentas: 26, conCampanaAnterior: false })];
    const tabla = filasDeCosto(plan, filas);
    for (let i = 1; i < tabla.length; i++) expect(tabla[i - 1].inversion).toBeGreaterThanOrEqual(tabla[i].inversion);
    expect(tabla.reduce((s, f) => s + (f.pctDelTotal ?? 0), 0)).toBeGreaterThanOrEqual(98);
    expect(tabla.reduce((s, f) => s + (f.pctDelTotal ?? 0), 0)).toBeLessThanOrEqual(102);
    expect(tabla.find((f) => f.clave === "polos")!.datos?.texto).toBe("Sin ventas");
    expect(tabla.find((f) => f.clave === "tops")!.datos?.texto).toBe("Orientativo");
    // Una categoría que la hoja no trae (la base no mandó la propuesta) queda sin etiqueta, no con una inventada.
    expect(tabla.find((f) => f.clave === "vestidos")!.datos).toBeNull();
  });
  it("cada fila trae lo que compra, lo que cuesta cada prenda y lo que rinde cada sol", () => {
    const plan = planConGanancia(lineas, 0);
    const t = filasDeCosto(plan, [])[0];
    const c = calcular(lineas.find((l) => l.clave === t.clave)!.linea, lineas.find((l) => l.clave === t.clave)!.stock);
    expect(t.comprar).toBe(c.comprar);
    expect(t.inversion).toBe(c.inversion);
    expect(t.costo).toBe(lineas.find((l) => l.clave === t.clave)!.linea.costo);
    expect(t.retorno === null || Number.isFinite(t.retorno)).toBe(true);
  });
  it("si el plan no cuesta nada, no hay porcentajes", () => {
    const plan = planConGanancia(lineas.map((l) => ({ ...l, stock: 99_999 })), 0);
    expect(filasDeCosto(plan, []).every((f) => f.pctDelTotal === null)).toBe(true);
  });
});

describe("los supuestos de toda la campaña", () => {
  const con = (descuentoPct: number | undefined, conDescuento = true) => ({ c: { id: String(descuentoPct), nombre: "x" }, linea: { descuentoPct }, conDescuento }) as unknown as FilaPlan;
  it("sin descuento, uno solo para todas o un rango", () => {
    expect(fraseDelDescuentoDelPlan([con(0), con(undefined)])).toBe("Sin descuento");
    expect(fraseDelDescuentoDelPlan([con(20), con(20)])).toBe("−20 %");
    expect(fraseDelDescuentoDelPlan([con(10), con(25)])).toBe("Varía por categoría: de −10 % a −25 %");
    expect(fraseDelDescuentoDelPlan([con(0), con(25)])).toBe("Varía por categoría: de sin descuento a −25 %");
  });
  it("si la base no guarda el descuento, o no hay categorías con plan, no se dice nada", () => {
    expect(fraseDelDescuentoDelPlan([con(0, false)])).toBeNull();
    expect(fraseDelDescuentoDelPlan([{ c: { id: "a", nombre: "a" }, linea: undefined } as unknown as FilaPlan])).toBeNull();
    expect(fraseDelDescuentoDelPlan([])).toBeNull();
  });
  it("lo que sobra se vende a un %, con su origen si es el de la campaña anterior", () => {
    expect(fraseDelRecuperoDelPlan({ pct: 45, heredado: false })).toBe("45 % del precio");
    expect(fraseDelRecuperoDelPlan({ pct: 40, heredado: true })).toBe("40 % del precio (el de la campaña anterior)");
    expect(fraseDelRecuperoDelPlan({ pct: null, heredado: false })).toBeNull();
  });
});
