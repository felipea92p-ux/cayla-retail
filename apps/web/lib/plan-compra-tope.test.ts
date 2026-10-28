import { describe, expect, it } from "vitest";
import { calcular, cuantilCritico, type FilaPlan } from "./plan-compra-reglas";
import {
  PRECIO_DE_LA_PLATA_MIN,
  compararPlanes,
  lineasDeTope,
  pasoDelTope,
  planConGanancia,
  planConPrecioDeLaPlata,
  porcentajeDe,
  precioDeLaPlataPara,
  rangoDelTope,
  retornoDeComprar,
  techoDelPrecio,
  topeEnElRango,
  valorDeTener,
  type DatosDeLinea,
  type LineaDeTope,
} from "./plan-compra-tope";

// Las categorías de la maqueta de Presupuesto (docs/maquetas/plan-campana-vision-2026-10/app.js): precios, costos y lo que sobra de verdad.
const base = (precio: number, costo: number, recuperoPct: number, normal: number, stock: number, nombre: string): LineaDeTope => ({
  clave: nombre.toLowerCase(),
  nombre,
  stock,
  linea: { precio, costo, recuperoPct, flojo: Math.round(normal * 0.8), normal, bueno: Math.round(normal * 2) },
});
const CATEGORIAS: LineaDeTope[] = [
  base(39.9, 19, 50, 438, 458, "Polos"),
  base(69.9, 32, 45, 363, 531, "Camisas"),
  base(47.47, 24.46, 40, 227, 264, "Tops"),
  base(89.9, 42, 55, 162, 107, "Pantalones"),
  base(69.9, 31, 50, 109, 88, "Faldas"),
  base(119.9, 58, 35, 102, 103, "Conjuntos"),
  base(79.9, 36, 40, 88, 105, "Chalecos"),
  base(109.9, 50, 30, 85, 194, "Vestidos"),
];

// Un generador con semilla (mulberry32): las pruebas de propiedad repiten exactamente la misma corrida.
function azar(semilla: number) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function lineasAlAzar(semilla: number): LineaDeTope[] {
  const r = azar(semilla);
  return Array.from({ length: 6 + Math.floor(r() * 8) }, (_, i) => {
    const costo = 8 + r() * 60;
    const precio = costo * (1.4 + r() * 1.6);
    const normal = 20 + Math.floor(r() * 400);
    return {
      clave: `c${i}`,
      nombre: `Categoría ${i}`,
      stock: Math.floor(r() * normal * 1.2),
      linea: {
        precio: Math.round(precio * 100) / 100,
        costo: Math.round(costo * 100) / 100,
        // Lo que sobra se vende por debajo del precio de campaña: el caso del modelo (si valiera más, retener sería mejor que vender).
        recuperoPct: Math.floor(10 + r() * 50),
        descuentoPct: r() < 0.3 ? Math.floor(r() * 30) : 0,
        flojo: Math.round(normal * (0.5 + r() * 0.4)),
        normal,
        bueno: Math.round(normal * (1.3 + r() * 1.5)),
      },
    };
  });
}
const inversion = (lineas: readonly LineaDeTope[], l: number) => planConPrecioDeLaPlata(lineas, l).inversion;

describe("el precio de la plata en el cuantil crítico", () => {
  const l: DatosDeLinea = { precio: 39.9, costo: 19, recuperoPct: 30, flojo: 100, normal: 200, bueno: 400 };
  it("con 0 es exactamente Cu ÷ (Cu + Co): el plan de siempre", () => {
    // Cu = 39.9 − 19 = 20.9; Co = 19 − 11.97 = 7.03
    expect(cuantilCritico(l.precio, l.costo, l.recuperoPct)).toBeCloseTo(20.9 / 27.93, 10);
    expect(cuantilCritico(l.precio, l.costo, l.recuperoPct, 0, 0)).toBe(cuantilCritico(l.precio, l.costo, l.recuperoPct));
  });
  it("positivo aprieta, negativo afloja, y nunca sale de 0 a 1", () => {
    const f = (lambda: number) => cuantilCritico(l.precio, l.costo, l.recuperoPct, 0, lambda);
    expect(f(0.1)).toBeCloseTo((20.9 - 1.9) / 27.93, 10);
    expect(f(0.1)).toBeLessThan(f(0));
    expect(f(-0.05)).toBeGreaterThan(f(0));
    expect(f(5)).toBe(0);
    expect(f(PRECIO_DE_LA_PLATA_MIN)).toBe(1);
  });
  it("un precio que no es un número cuenta como 0, no como un plan roto", () => {
    expect(cuantilCritico(l.precio, l.costo, l.recuperoPct, 0, Number.NaN)).toBe(cuantilCritico(l.precio, l.costo, l.recuperoPct));
  });
  it("sin ganancia ni pérdida posible, seguir en 0,5 aunque la plata cueste", () => {
    expect(cuantilCritico(10, 10, 100, 0, 0.5)).toBe(0.5);
  });
  it("calcular() sin el tercer argumento da lo de siempre", () => {
    expect(calcular(l, 120)).toEqual(calcular(l, 120, 0));
  });
  it("con el descuento de la campaña la compra se aprieta antes (el margen que se pierde por faltar es menor)", () => {
    const sin = cuantilCritico(l.precio, l.costo, l.recuperoPct, 0, 0.3);
    const con = cuantilCritico(l.precio, l.costo, l.recuperoPct, 20, 0.3);
    expect(con).toBeLessThan(sin);
  });
});

describe("el plan con un precio de la plata", () => {
  it("con 0 suma exactamente lo que calcula cada categoría", () => {
    const plan = planConPrecioDeLaPlata(CATEGORIAS, 0);
    const esperado = CATEGORIAS.map((x) => calcular(x.linea, x.stock));
    expect(plan.prendas).toBe(esperado.reduce((s, c) => s + c.comprar, 0));
    expect(plan.inversion).toBeCloseTo(esperado.reduce((s, c) => s + c.inversion, 0), 2);
    expect(plan.filas.map((f) => f.calculo)).toEqual(esperado);
  });
  it("cuanto más cara la plata, menos se compra: la inversión no sube al subir λ", () => {
    for (const semilla of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const lineas = lineasAlAzar(semilla);
      let anterior = Infinity;
      for (let l = PRECIO_DE_LA_PLATA_MIN; l <= techoDelPrecio(lineas) + 0.5; l += 0.05) {
        const ahora = inversion(lineas, l);
        expect(ahora).toBeLessThanOrEqual(anterior + 1e-9);
        anterior = ahora;
      }
    }
  });
  it("con λ = −1 toda categoría cubre el bueno y con λ en el techo solo el flojo", () => {
    for (const x of CATEGORIAS) {
      expect(calcular(x.linea, x.stock, PRECIO_DE_LA_PLATA_MIN).objetivo).toBe(x.linea.bueno);
      expect(calcular(x.linea, x.stock, techoDelPrecio(CATEGORIAS)).objetivo).toBe(x.linea.flojo);
    }
  });
  it("sin categorías con plan no hay nada que apretar", () => {
    expect(techoDelPrecio([])).toBe(0);
    expect(planConPrecioDeLaPlata([], 0.4)).toMatchObject({ prendas: 0, inversion: 0, filas: [] });
  });
});

describe("el precio de la plata que deja la compra en el tope", () => {
  const hoy = inversion(CATEGORIAS, 0);
  const mas = inversion(CATEGORIAS, PRECIO_DE_LA_PLATA_MIN);
  const menos = inversion(CATEGORIAS, techoDelPrecio(CATEGORIAS));

  it("el plan de hoy cuesta entre lo más flaco y lo más lleno", () => {
    expect(menos).toBeLessThan(hoy);
    expect(hoy).toBeLessThan(mas);
  });
  it("si el tope es lo que ya cuesta el plan, no hay nada que ajustar", () => {
    expect(precioDeLaPlataPara(CATEGORIAS, hoy)).toEqual({ precioDeLaPlata: 0, cabe: true, techo: false });
  });
  it("con un tope menor, el plan nuevo cabe y es el más cercano: un λ apenas menor ya se pasaría", () => {
    for (const parte of [0.9, 0.8, 0.7, 0.6]) {
      const tope = Math.round(hoy * parte);
      const ajuste = precioDeLaPlataPara(CATEGORIAS, tope);
      expect(ajuste).toMatchObject({ cabe: true, techo: false });
      expect(ajuste.precioDeLaPlata).toBeGreaterThan(0);
      expect(inversion(CATEGORIAS, ajuste.precioDeLaPlata)).toBeLessThanOrEqual(tope);
      expect(inversion(CATEGORIAS, ajuste.precioDeLaPlata - 0.002)).toBeGreaterThan(tope);
    }
  });
  it("con un tope mayor, el λ baja de 0 y se gasta más, sin pasarse", () => {
    const tope = Math.round(hoy + (mas - hoy) / 2);
    const ajuste = precioDeLaPlataPara(CATEGORIAS, tope);
    expect(ajuste.precioDeLaPlata).toBeLessThan(0);
    expect(ajuste.techo).toBe(false);
    const gasta = inversion(CATEGORIAS, ajuste.precioDeLaPlata);
    expect(gasta).toBeLessThanOrEqual(tope);
    expect(gasta).toBeGreaterThan(hoy);
  });
  it("con un tope que sobra aun para cubrir el bueno en todas, lo dice (techo) y no inventa más compra", () => {
    const ajuste = precioDeLaPlataPara(CATEGORIAS, mas + 5000);
    expect(ajuste).toEqual({ precioDeLaPlata: PRECIO_DE_LA_PLATA_MIN, cabe: true, techo: true });
  });
  it("con un tope que no alcanza ni para el flojo, dice que no cabe y deja el plan más flaco que hay", () => {
    const ajuste = precioDeLaPlataPara(CATEGORIAS, menos - 100);
    expect(ajuste.cabe).toBe(false);
    expect(ajuste.precioDeLaPlata).toBe(techoDelPrecio(CATEGORIAS));
    expect(inversion(CATEGORIAS, ajuste.precioDeLaPlata)).toBe(menos);
  });
  it("en cualquier campaña: si cabe, nunca se pasa del tope; si no cabe, es porque ni el flojo entra", () => {
    for (let semilla = 1; semilla <= 120; semilla++) {
      const lineas = lineasAlAzar(semilla);
      const minimo = inversion(lineas, techoDelPrecio(lineas));
      const maximo = inversion(lineas, PRECIO_DE_LA_PLATA_MIN);
      const r = azar(semilla * 7919);
      const tope = Math.round((minimo * 0.8 + r() * (maximo * 1.1 - minimo * 0.8)) * 100) / 100;
      const ajuste = precioDeLaPlataPara(lineas, tope);
      const gasta = inversion(lineas, ajuste.precioDeLaPlata);
      if (ajuste.cabe) expect(gasta).toBeLessThanOrEqual(tope);
      else expect(minimo).toBeGreaterThan(tope);
      // Y es el MENOR λ que cabe, salvo los extremos: un poco menos ya se pasa.
      if (ajuste.cabe && !ajuste.techo && ajuste.precioDeLaPlata !== 0) expect(inversion(lineas, ajuste.precioDeLaPlata - 0.002)).toBeGreaterThan(tope);
    }
  });
});

describe("lo que se espera ganar", () => {
  const l: DatosDeLinea = { precio: 100, costo: 40, recuperoPct: 30, flojo: 50, normal: 100, bueno: 200 };
  it("tener 0 prendas no vale nada, y tener más nunca vale menos", () => {
    expect(valorDeTener(l, 0)).toBe(0);
    let antes = 0;
    for (let q = 0; q <= 400; q += 10) {
      const v = valorDeTener(l, q);
      expect(v).toBeGreaterThanOrEqual(antes - 1e-9);
      antes = v;
    }
  });
  it("con mucho más de lo que se puede vender, se vende toda la demanda al precio y el resto se recupera", () => {
    const Q = 10_000;
    const demandaMedia = (l.flojo + l.normal + l.bueno) / 3; // la media de la triangular
    expect(valorDeTener(l, Q)).toBeCloseTo(100 * demandaMedia + 30 * (Q - demandaMedia), -1);
  });
  it("el descuento baja lo que se cobra, no lo que se recupera de lo que sobra", () => {
    const sin = valorDeTener(l, 120);
    const con = valorDeTener({ ...l, descuentoPct: 25 }, 120);
    expect(con).toBeLessThan(sin);
    expect(valorDeTener({ ...l, descuentoPct: 25 }, 10_000) - valorDeTener(l, 10_000)).toBeCloseTo(-25 * ((l.flojo + l.normal + l.bueno) / 3), -1);
  });
  it("no comprar nada no gana ni pierde, y sin costo no hay «por cada sol»", () => {
    expect(retornoDeComprar(l, 50, 0)).toEqual({ ganancia: 0, retorno: null });
    expect(retornoDeComprar({ ...l, costo: 0 }, 50, 20)).toEqual({ ganancia: 0, retorno: null });
  });
  it("comprar lo que pide el plan de siempre suma; comprar mucho más, deja de sumar", () => {
    const stock = 40;
    const justo = calcular(l, stock).comprar;
    expect(justo).toBeGreaterThan(0);
    const bien = retornoDeComprar(l, stock, justo);
    expect(bien.ganancia).toBeGreaterThan(0);
    expect(bien.retorno).toBeCloseTo(bien.ganancia / (justo * l.costo), 10);
    expect(retornoDeComprar(l, stock, justo + 300).ganancia).toBeLessThan(bien.ganancia);
  });
  it("en cualquier campaña, el plan de siempre espera ganar al menos tanto como el de cubrir el bueno en todas (más compra no es más ganancia)", () => {
    for (let semilla = 1; semilla <= 80; semilla++) {
      const lineas = lineasAlAzar(semilla);
      const plan = planConGanancia(lineas, 0);
      const lleno = planConGanancia(lineas, PRECIO_DE_LA_PLATA_MIN);
      expect(plan.ganancia).toBeGreaterThanOrEqual(lleno.ganancia - 1e-6);
      for (const f of plan.filas) if (f.calculo.comprar > 0) expect(f.ganancia).toBeGreaterThanOrEqual(-1e-6);
    }
  });
  it("el plan con ganancia dice cuánto se espera ganar por cada sol, o nada si no se compra", () => {
    const plan = planConGanancia(CATEGORIAS, 0);
    expect(plan.ganancia).toBeCloseTo(plan.filas.reduce((s, f) => s + f.ganancia, 0), 8);
    expect(plan.porSol).toBeCloseTo(plan.ganancia / plan.inversion, 10);
    const nada = planConGanancia(CATEGORIAS.map((x) => ({ ...x, stock: 99_999 })), 0);
    expect(nada).toMatchObject({ inversion: 0, ganancia: 0, porSol: null });
  });
  it("al apretar la compra se gasta menos y se deja de ganar menos de lo que se ahorra: recortar poco cuesta poco", () => {
    const hoy = planConGanancia(CATEGORIAS, 0);
    const tope = Math.round(hoy.inversion * 0.9);
    const apretado = planConGanancia(CATEGORIAS, precioDeLaPlataPara(CATEGORIAS, tope).precioDeLaPlata);
    const ahorro = hoy.inversion - apretado.inversion;
    const pierde = hoy.ganancia - apretado.ganancia;
    expect(ahorro).toBeGreaterThan(0);
    expect(pierde).toBeGreaterThanOrEqual(0);
    expect(pierde).toBeLessThan(ahorro);
  });
});

describe("hoy contra con tope", () => {
  it("lista las categorías que compran algo hoy o que el tope mueve, en el orden del plan", () => {
    const hoy = planConPrecioDeLaPlata(CATEGORIAS, 0);
    const conTope = planConPrecioDeLaPlata(CATEGORIAS, precioDeLaPlataPara(CATEGORIAS, Math.round(hoy.inversion * 0.7)).precioDeLaPlata);
    const cambios = compararPlanes(hoy, conTope);
    expect(cambios.length).toBeGreaterThan(0);
    for (const c of cambios) {
      expect(c.conTope - c.hoy).toBe(c.dif);
      expect(c.hoy > 0 || c.dif !== 0).toBe(true);
    }
    expect(cambios.some((c) => c.dif < 0)).toBe(true);
    expect(cambios.reduce((s, c) => s + c.difInversion, 0)).toBeCloseTo(conTope.inversion - hoy.inversion, 2);
  });
  it("un plan comparado consigo mismo no cambia nada", () => {
    const hoy = planConPrecioDeLaPlata(CATEGORIAS, 0);
    expect(compararPlanes(hoy, hoy).every((c) => c.dif === 0 && c.difInversion === 0)).toBe(true);
  });
  it("el porcentaje no se inventa sin base", () => {
    expect(porcentajeDe(25, 200)).toBe(13);
    expect(porcentajeDe(5, 0)).toBeNull();
  });
});

describe("el rango del deslizador", () => {
  it("va de lo más flaco a lo más lleno, en múltiplos del paso", () => {
    const r = rangoDelTope(CATEGORIAS, null)!;
    expect(r.min % r.paso).toBe(0);
    expect(r.max % r.paso).toBe(0);
    expect(r.min).toBeLessThanOrEqual(inversion(CATEGORIAS, techoDelPrecio(CATEGORIAS)));
    expect(r.max).toBeGreaterThanOrEqual(inversion(CATEGORIAS, PRECIO_DE_LA_PLATA_MIN));
    expect(r.min).toBeLessThan(r.max);
  });
  it("incluye el tope guardado aunque esté fuera, para poder ver dónde está", () => {
    const sin = rangoDelTope(CATEGORIAS, null)!;
    expect(rangoDelTope(CATEGORIAS, sin.max + 20_000)!.max).toBeGreaterThanOrEqual(sin.max + 20_000);
    expect(rangoDelTope(CATEGORIAS, 100)!.min).toBeLessThanOrEqual(100);
  });
  it("sin nada que comprar no hay deslizador", () => {
    expect(rangoDelTope([], null)).toBeNull();
    expect(rangoDelTope(CATEGORIAS.map((x) => ({ ...x, stock: 99_999 })), null)).toBeNull();
  });
  it("el paso se achica con la campaña", () => {
    expect(pasoDelTope(45_000)).toBe(500);
    expect(pasoDelTope(5_000)).toBe(100);
    expect(pasoDelTope(900)).toBe(50);
  });
  it("lleva un tope a una posición válida", () => {
    const r = { min: 15_000, max: 45_000, paso: 500 };
    expect(topeEnElRango(28_240, r)).toBe(28_000);
    expect(topeEnElRango(1_000, r)).toBe(15_000);
    expect(topeEnElRango(90_000, r)).toBe(45_000);
  });
});

describe("de la hoja a la cuenta", () => {
  it("solo entran las categorías con plan, con lo que hay más lo que viene en camino", () => {
    const fila = (id: string, conPlan: boolean): FilaPlan =>
      ({
        c: { id, nombre: id, prefijo: null, familia: null, tallas: [] },
        linea: conPlan ? CATEGORIAS[0].linea : undefined,
        stock: 100,
        enCamino: 30,
        calculo: conPlan ? calcular(CATEGORIAS[0].linea, 130) : null,
      }) as unknown as FilaPlan;
    const lineas = lineasDeTope([fila("a", true), fila("b", false), fila("c", true)]);
    expect(lineas.map((x) => x.clave)).toEqual(["a", "c"]);
    expect(lineas.every((x) => x.stock === 130)).toBe(true);
  });
});
