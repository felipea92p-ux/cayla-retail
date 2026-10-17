import { describe, expect, it } from "vitest";
import { compararMargen, margenPorDia, margenPrudentePorDia, montoPorDia, rangoDeDias, ritmoReciente, unaSolaVenta, VECES_QUE_ACELERA, VENTAS_MINIMAS_ULTIMA_SEMANA } from "./analisis-ritmo";

// Una Poisson contada a mano, aparte de la que usa el código: así la prueba no se cree a sí misma.
function acumulada(k: number, lambda: number): number {
  let termino = Math.exp(-lambda);
  let suma = termino;
  for (let i = 1; i <= k; i++) {
    termino *= lambda / i;
    suma += termino;
  }
  return suma;
}

const un = (n: number) => Math.round(n * 10) / 10;

describe("rangoDeDias: el rango en el que cabe lo que te queda (intervalo exacto al 80 %)", () => {
  it("2 ventas en 7 días con 4 en stock: de 5,3 a 52,7 días (se dice «5 a 53»)", () => {
    const r = rangoDeDias({ ventas: 2, ventana: 7, enStock: 4 })!;
    expect(un(r.desdeExacto)).toBe(5.3);
    expect(un(r.hastaExacto)).toBe(52.7);
    expect([r.desde, r.hasta]).toEqual([5, 53]);
  });

  it("1 venta en 9 días con 1 en stock: de 2,3 a 85,4 días (se dice «2 a 85»)", () => {
    const r = rangoDeDias({ ventas: 1, ventana: 9, enStock: 1 })!;
    expect(un(r.desdeExacto)).toBe(2.3);
    expect(un(r.hastaExacto)).toBe(85.4);
    expect([r.desde, r.hasta]).toEqual([2, 85]);
  });

  it("no se pinta nada sin base: sin ventas no hay ritmo y con nada en stock ya no hay días que contar", () => {
    expect(rangoDeDias({ ventas: 0, ventana: 7, enStock: 4 })).toBeNull();
    expect(rangoDeDias({ ventas: 2, ventana: 7, enStock: 0 })).toBeNull();
    expect(rangoDeDias({ ventas: 2, ventana: 0, enStock: 4 })).toBeNull();
    expect(rangoDeDias({ ventas: -1, ventana: 7, enStock: 4 })).toBeNull();
    expect(rangoDeDias({ ventas: Number.NaN, ventana: 7, enStock: 4 })).toBeNull();
  });

  it("los dos lados son LOS límites de la definición: dejan afuera el 10 % de azar por cada punta (cuenta aparte)", () => {
    for (const [ventas, ventana, enStock] of [
      [1, 7, 1],
      [2, 17, 4],
      [3, 10, 3],
      [8, 14, 6],
      [25, 30, 12],
      [60, 30, 40],
    ] as const) {
      const r = rangoDeDias({ ventas, ventana, enStock })!;
      // λ en la ventana a partir de los días: días = enStock × ventana / λ.
      const lambdaAlto = (enStock * ventana) / r.desdeExacto;
      const lambdaBajo = (enStock * ventana) / r.hastaExacto;
      // P(ver `ventas` o menos | λ alto) = 0,1  y  P(ver `ventas` o más | λ bajo) = 0,1.
      expect(acumulada(ventas, lambdaAlto)).toBeCloseTo(0.1, 6);
      expect(1 - acumulada(ventas - 1, lambdaBajo)).toBeCloseTo(0.1, 6);
    }
  });

  it("el ritmo de la pantalla (ventas ÷ ventana) siempre cabe adentro, de 1 a 200 ventas y con ventanas de 7, 17 y 30", () => {
    for (const ventana of [7, 17, 30]) {
      for (let ventas = 1; ventas <= 200; ventas++) {
        for (const enStock of [1, 5, 40]) {
          const r = rangoDeDias({ ventas, ventana, enStock })!;
          const puntual = enStock / (ventas / ventana);
          expect(r.desdeExacto).toBeLessThan(puntual);
          expect(r.hastaExacto).toBeGreaterThan(puntual);
        }
      }
    }
  });

  it("más ventas en la misma ventana: el peor caso sube y el rango se cierra (la base pesa)", () => {
    const rangos = [1, 2, 4, 8, 16, 32].map((ventas) => rangoDeDias({ ventas, ventana: 14, enStock: 6 })!);
    for (let i = 1; i < rangos.length; i++) {
      expect(rangos[i]!.desdeExacto).toBeLessThan(rangos[i - 1]!.desdeExacto);
      // Con más ventas el ritmo es más alto (menos días), pero lo ancho del rango, relativo a su centro, baja.
      const ancho = (x: (typeof rangos)[number]) => (x.hastaExacto - x.desdeExacto) / x.hastaExacto;
      expect(ancho(rangos[i]!)).toBeLessThan(ancho(rangos[i - 1]!));
    }
  });

  it("con muchas ventas no se rompe (ni NaN ni infinito) y queda cerca de lo puntual", () => {
    const r = rangoDeDias({ ventas: 600, ventana: 30, enStock: 100 })!;
    expect(Number.isFinite(r.desdeExacto)).toBe(true);
    expect(Number.isFinite(r.hastaExacto)).toBe(true);
    const puntual = 100 / (600 / 30);
    expect(r.desdeExacto).toBeGreaterThan(puntual * 0.9);
    expect(r.hastaExacto).toBeLessThan(puntual * 1.1);
  });

  it("nunca dice menos de 1 día, y el mejor caso no baja del peor", () => {
    const r = rangoDeDias({ ventas: 40, ventana: 7, enStock: 1 })!;
    expect(r.desde).toBe(1);
    expect(r.hasta).toBeGreaterThanOrEqual(r.desde);
  });

  it("el mismo resultado cada vez (la cuenta se guarda y no cambia)", () => {
    const a = rangoDeDias({ ventas: 3, ventana: 11, enStock: 5 });
    const b = rangoDeDias({ ventas: 3, ventana: 11, enStock: 5 });
    expect(b).toEqual(a);
  });
});

describe("unaSolaVenta", () => {
  it("solo con exactamente una venta", () => {
    expect(unaSolaVenta(1)).toBe(true);
    expect([0, 2, 3, 30].some(unaSolaVenta)).toBe(false);
  });
});

describe("A15 · lo que dejas de ganar por día", () => {
  it("vendidas ÷ ventana × (precio sin IGV − costo)", () => {
    // 6 vendidas en 12 días a S/ 59 (con IGV: S/ 50 sin él) con costo S/ 24: media vendida por día × S/ 26 = S/ 13 por día.
    expect(margenPorDia({ vendidas30: 6, precio: 59, costo: 24 }, 12)).toBeCloseTo(13, 10);
    // 1 vendida en 9 días a S/ 118 (S/ 100 sin IGV) con costo S/ 40: S/ 60 ÷ 9.
    expect(margenPorDia({ vendidas30: 1, precio: 118, costo: 40 }, 9)).toBeCloseTo(60 / 9, 10);
  });
  it("el precio trae el IGV y el costo no: restarlos tal cual inflaba la ganancia en el 15 % del precio", () => {
    // Precio S/ 118 y costo S/ 70: quedan S/ 30 (100 − 70), no S/ 48. Una vendida por día = S/ 30 por día.
    expect(margenPorDia({ vendidas30: 1, precio: 118, costo: 70 }, 1)).toBeCloseTo(30, 10);
    // Un precio que apenas cubre el costo SIN contar el IGV (50 − 44 = 6) no deja ganancia de verdad (50 / 1,18 = 42,4 < 44).
    expect(margenPorDia({ vendidas30: 6, precio: 50, costo: 44 }, 12)).toBeNull();
  });
  it("sin costo, sin precio, sin ventas o con pérdida no hay cifra (no se inventa)", () => {
    expect(margenPorDia({ vendidas30: 6, precio: 50, costo: null }, 12)).toBeNull();
    expect(margenPorDia({ vendidas30: 6, precio: null, costo: 24 }, 12)).toBeNull();
    expect(margenPorDia({ vendidas30: 0, precio: 50, costo: 24 }, 12)).toBeNull();
    expect(margenPorDia({ vendidas30: 6, precio: 20, costo: 24 }, 12)).toBeNull();
    expect(margenPorDia({ vendidas30: 6, precio: 24, costo: 24 }, 12)).toBeNull();
    expect(margenPrudentePorDia({ vendidas30: 6, precio: 50, costo: null }, 12)).toBeNull();
    expect(margenPrudentePorDia({ vendidas30: 0, precio: 50, costo: 24 }, 12)).toBeNull();
    expect(margenPrudentePorDia({ vendidas30: 6, precio: 20, costo: 24 }, 12)).toBeNull();
    expect(margenPorDia({ vendidas30: 6, precio: 50, costo: 24 }, 0)).toBeNull();
    expect(margenPorDia({ vendidas30: 6, precio: Number.NaN, costo: 24 }, 12)).toBeNull();
  });
  it("se muestra en soles enteros desde 1; por debajo, a los diez céntimos; y nada si no llega a diez céntimos", () => {
    expect(montoPorDia(26)).toBe(26);
    expect(montoPorDia(2.89)).toBe(3);
    expect(montoPorDia(1)).toBe(1);
    expect(montoPorDia(0.87)).toBe(0.9);
    expect(montoPorDia(0.4)).toBe(0.4);
    expect(montoPorDia(0.04)).toBeNull();
    expect(montoPorDia(0)).toBeNull();
    expect(montoPorDia(null)).toBeNull();
  });
  it("para ordenar, el ritmo va en su cota baja: una sola venta de mucha ganancia no pasa delante de varias de menos", () => {
    // Misma ventana de 30 días. A: 1 venta con S/ 150 de ganancia (puntual 5 por día). B: 4 ventas con S/ 30 (puntual 4 por día).
    const sinIgv = (ganancia: number, costo: number) => (ganancia + costo) * 1.18;
    const a = { vendidas30: 1, precio: sinIgv(150, 30), costo: 30 };
    const b = { vendidas30: 4, precio: sinIgv(30, 30), costo: 30 };
    expect(margenPorDia(a, 30)!).toBeGreaterThan(margenPorDia(b, 30)!); // la cifra que se ve: A deja más
    expect(margenPrudentePorDia(a, 30)!).toBeLessThan(margenPrudentePorDia(b, 30)!); // la que ordena: B tiene más base
    expect(compararMargen(margenPrudentePorDia(b, 30), margenPrudentePorDia(a, 30))).toBeLessThan(0);
  });
  it("la cota baja nunca pasa de la cifra que se ve, crece con las ventas y con muchas se le acerca", () => {
    let anterior = 0;
    for (const k of [1, 2, 3, 5, 10, 30, 100, 600]) {
      const p = { vendidas30: k, precio: 118, costo: 70 };
      const prudente = margenPrudentePorDia(p, 30)!;
      const puntual = margenPorDia(p, 30)!;
      expect(prudente).toBeGreaterThan(0);
      expect(prudente).toBeLessThan(puntual);
      expect(prudente / puntual).toBeGreaterThan(anterior); // la fracción que se conserva sube con la base
      anterior = prudente / puntual;
    }
    expect(anterior).toBeGreaterThan(0.9); // con 600 ventas casi no se descuenta nada
    // Con una sola venta se queda con una décima parte: no se fía.
    expect(margenPrudentePorDia({ vendidas30: 1, precio: 118, costo: 70 }, 30)! / margenPorDia({ vendidas30: 1, precio: 118, costo: 70 }, 30)!).toBeLessThan(0.15);
  });
  it("el orden: el que más deja de ganar primero, sin cifra después, y entre dos sin cifra no decide", () => {
    expect(compararMargen(30, 10)).toBeLessThan(0);
    expect(compararMargen(10, 30)).toBeGreaterThan(0);
    expect(compararMargen(10, 10)).toBe(0);
    expect(compararMargen(null, 5)).toBeGreaterThan(0);
    expect(compararMargen(5, null)).toBeLessThan(0);
    expect(compararMargen(null, null)).toBe(0);
    // Es un orden de verdad (se puede usar en sort): ordena una lista revuelta.
    expect([null, 3, 9, null, 6].sort(compararMargen)).toEqual([9, 6, 3, null, null]);
  });
});

// Segundo pase visual (2026-10-17): el gráfico de semanas de la ficha subía 1 → 2 → 4 y la cifra decía «te dura 13 días».
describe("ritmoReciente: la última semana vende claramente más que la ventana", () => {
  const SEMANAS = [0, 0, 0, 0, 0, 1, 2, 4];

  it("el Bolso (1 → 2 → 4, 7 en 30 días, quedan 3): la ventana vende 1,6 por semana y la última 4 (más de 1,5 veces): a ese paso, ~5 días", () => {
    expect(ritmoReciente({ semanas: SEMANAS, enStock: 3, ventas: 7, ventana: 30 })).toEqual({ vendidas: 4, dias: 5 });
  });

  it("la Capa (1 → 2 → 3 → 7, 13 en 30 días, quedan 5): a ese paso, 5 días", () => {
    expect(ritmoReciente({ semanas: [0, 0, 0, 0, 1, 2, 3, 7], enStock: 5, ventas: 13, ventana: 30 })).toEqual({ vendidas: 7, dias: 5 });
  });

  it("el borde: justo 1,5 veces el ritmo de la ventana cuenta; un poco menos, no", () => {
    // 4 ventas en 7 días = 4 por semana; 1,5 veces = 6.
    expect(VECES_QUE_ACELERA).toBe(1.5);
    expect(ritmoReciente({ semanas: [0, 0, 0, 0, 0, 0, 0, 6], enStock: 6, ventas: 4, ventana: 7 })).toEqual({ vendidas: 6, dias: 7 });
    expect(ritmoReciente({ semanas: [0, 0, 0, 0, 0, 0, 0, 5], enStock: 6, ventas: 4, ventana: 7 })).toBeNull();
  });

  it("con menos de 3 ventas en la semana no habla, aunque la triplique: un día bueno no es una tendencia", () => {
    expect(VENTAS_MINIMAS_ULTIMA_SEMANA).toBe(3);
    expect(ritmoReciente({ semanas: [0, 0, 0, 0, 0, 0, 0, 2], enStock: 3, ventas: 2, ventana: 30 })).toBeNull();
    expect(ritmoReciente({ semanas: [0, 0, 0, 0, 0, 0, 0, 3], enStock: 3, ventas: 3, ventana: 30 })).toEqual({ vendidas: 3, dias: 7 });
  });

  it("un ritmo parejo no se dice (la cifra principal ya lo cuenta): 4 por semana, todas las semanas", () => {
    expect(ritmoReciente({ semanas: [4, 4, 4, 4, 4, 4, 4, 4], enStock: 3, ventas: 17, ventana: 30 })).toBeNull();
  });

  it("sin stock no hay días que contar; sin ventas o sin semanas no hay base", () => {
    expect(ritmoReciente({ semanas: SEMANAS, enStock: 0, ventas: 7, ventana: 30 })).toBeNull();
    expect(ritmoReciente({ semanas: SEMANAS, enStock: 3, ventas: 0, ventana: 30 })).toBeNull();
    expect(ritmoReciente({ semanas: SEMANAS, enStock: 3, ventas: 7, ventana: 0 })).toBeNull();
    expect(ritmoReciente({ semanas: [], enStock: 3, ventas: 7, ventana: 30 })).toBeNull();
    expect(ritmoReciente({ semanas: [0, 0, 0, 0, 0, 0, 0, Number.NaN], enStock: 3, ventas: 7, ventana: 30 })).toBeNull();
  });

  it("nunca dice «0 días»: con mucho ritmo y casi nada en stock, 1 día", () => {
    expect(ritmoReciente({ semanas: [0, 0, 0, 0, 0, 0, 0, 20], enStock: 1, ventas: 20, ventana: 30 })).toEqual({ vendidas: 20, dias: 1 });
  });

  it("solo mira la ÚLTIMA semana (la que termina hoy): una semana buena de hace un mes no cuenta", () => {
    expect(ritmoReciente({ semanas: [0, 0, 9, 0, 0, 0, 0, 0], enStock: 3, ventas: 9, ventana: 30 })).toBeNull();
  });
});
