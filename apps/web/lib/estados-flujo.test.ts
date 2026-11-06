import { describe, expect, it } from "vitest";
import { columnasDeCascada, lecturaDelFlujo, libroDelFlujo, partesDelEstadoFlujo } from "./estados-flujo";
import { periodoDe } from "./estados-periodo";
import { solesCentimos, type FlujoReal } from "./flujo-caja-reglas";

const HOY = "2026-11-05";
const OCT = periodoDe("2026-10-01", "2026-10-31", HOY);

const real = (o: Partial<FlujoReal> = {}): FlujoReal => ({
  desde: "2026-10-01",
  hasta: "2026-10-31",
  hoy: HOY,
  saldoInicial: 30000,
  saldoFinal: 33000,
  entro: 70000,
  salio: 67000,
  ajustes: 0,
  descuadre: 0,
  categorias: [
    { clave: "tarjeta", lado: "entra", monto: 70000 },
    { clave: "proveedores", lado: "sale", monto: 40000 },
    { clave: "gastos", lado: "sale", monto: 22000 },
    { clave: "activos", lado: "sale", monto: 3000 },
    { clave: "dueno_saca", lado: "sale", monto: 2000 },
  ],
  semanas: [],
  sinCuenta: [],
  arranques: [],
  planillaVisible: true,
  planilla: [],
  ...o,
});

describe("lo que dice la pantalla", () => {
  it("un período cerrado", () => {
    const l = lecturaDelFlujo(real(), null, OCT);
    expect(l).toMatchObject({ valor: 33000, mal: false, frase: `Terminaste octubre con ${solesCentimos(3000)} más que al empezar.` });
    expect(l.chip).toEqual({ texto: `Empezaste con ${solesCentimos(30000)}`, tono: null });
  });
  it("menos, igual y otras fechas", () => {
    expect(lecturaDelFlujo(real({ saldoFinal: 28000 }), null, OCT).frase).toBe(`Terminaste octubre con ${solesCentimos(2000)} menos que al empezar.`);
    expect(lecturaDelFlujo(real({ saldoFinal: 30000 }), null, OCT).frase).toBe("Terminaste octubre con lo mismo que al empezar.");
    expect(lecturaDelFlujo(real(), null, periodoDe("2026-10-05", "2026-10-20", HOY)).frase).toBe(`Terminaste el período con ${solesCentimos(3000)} más que al empezar.`);
  });
  it("el período que sigue corriendo", () => {
    expect(lecturaDelFlujo(real(), null, periodoDe("2026-11-01", HOY, HOY)).frase).toBe(`Hoy tienes ${solesCentimos(3000)} más que al empezar noviembre.`);
  });
  it("plata en negativo, en rojo", () => {
    expect(lecturaDelFlujo(real({ saldoFinal: -500 }), null, OCT).mal).toBe(true);
  });
  it("con una cuenta que arrancó a mitad de período no se afirma cuánto cambió (ADR-0609)", () => {
    const l = lecturaDelFlujo(real({ arranques: [{ cuentaId: "c", cuenta: "BCP", desde: "2026-10-15", saldoInicial: 5000, cobros: 100, salidas: 0, entreCuentas: 0, comision: 0 } as FlujoReal["arranques"][number]] }), 3000, OCT);
    expect(l.frase).toMatch(/^No se puede decir cuánto subió o bajó: una cuenta arrancó el /);
    expect(l.chip!.texto).toBe(`Saldo de partida: ${solesCentimos(30000)}`);
    expect(l.nota).toBeNull();
  });
});

describe("la razón de la cifra", () => {
  const nota = (r: FlujoReal, g: number | null) => lecturaDelFlujo(r, g, OCT).nota;
  it("ganó y la plata bajó: nombra lo que se fue fuera del día a día", () => {
    expect(nota(real({ saldoFinal: 28000 }), 5000)).toBe(`Ganaste ${solesCentimos(5000)}, pero compraste cosas que duran años por ${solesCentimos(3000)} y retiraste ${solesCentimos(2000)}.`);
  });
  it("el día a día en contra", () => {
    const r = real({ categorias: [{ clave: "tarjeta", lado: "entra", monto: 100 }, { clave: "gastos", lado: "sale", monto: 400 }] });
    expect(nota(r, null)).toBe(`En el día a día pagaste ${solesCentimos(300)} más de lo que cobraste.`);
  });
  it("cobraste más de lo que pagaste", () => {
    expect(nota(real({ categorias: [{ clave: "tarjeta", lado: "entra", monto: 500 }, { clave: "gastos", lado: "sale", monto: 100 }] }), null)).toBe("Cobraste más de lo que pagaste, y por eso la plata subió.");
  });
  it("el día a día a favor y aun así bajó", () => {
    const r = real({ saldoFinal: 29000, categorias: [{ clave: "tarjeta", lado: "entra", monto: 500 }, { clave: "activos", lado: "sale", monto: 1500 }] });
    expect(nota(r, null)).toBe(`En el día a día entraron ${solesCentimos(500)}, pero salió más por otro lado.`);
  });
});

describe("las partes", () => {
  const p = partesDelEstadoFlujo({ real: real(), comparadas: [{ etiqueta: "Sep", real: real({ saldoFinal: 30000, categorias: [{ clave: "tarjeta", lado: "entra", monto: 40000 }, { clave: "gastos", lado: "sale", monto: 10000 }] }) }], etiquetaActual: "Oct", periodo: OCT });
  it("empezar, lo que movió la plata y terminar", () => {
    expect(p.map((x) => x.clave)).toEqual(["inicio", "operacion", "inversion", "financiamiento", "fin"]);
    expect(p[0]!.soloEnElGrafico).toBe(true);
    expect(p[4]!.soloEnElGrafico).toBe(true);
  });
  it("cada movimiento con su signo, su color y sus líneas", () => {
    expect(p[1]).toMatchObject({ nombre: "Del día a día", cifra: 8000, tono: "bien", color: "var(--color-verde)", conSignos: true });
    expect(p[2]).toMatchObject({ cifra: -3000, tono: "mal", color: "var(--color-rojo)" });
    expect(p[1]!.filas.map((f) => f.valor)).toEqual([70000, -40000, -22000]);
  });
  it("compara con el período de antes; una parte que antes no existió vale cero", () => {
    expect(p[1]!.columnas.map((c) => c.valor)).toEqual([30000, 8000]);
    expect(p[1]!.chip).toEqual({ texto: `${solesCentimos(22000)} menos que septiembre`, tono: "mal" });
    expect(p[2]!.columnas.map((c) => c.valor)).toEqual([0, -3000]);
  });
  it("terminar se explica con lo que entró y salió", () => {
    expect(p[4]!.filas).toEqual([
      { nombre: "Entró", valor: 70000 },
      { nombre: "Salió", valor: -67000 },
      { nombre: "Diferencias", valor: 0 },
    ]);
  });
  it("un período anterior que no se pudo leer no se dibuja", () => {
    const q = partesDelEstadoFlujo({ real: real(), comparadas: [{ etiqueta: "Sep", real: null }], etiquetaActual: "Oct", periodo: OCT });
    expect(q[1]!.columnas).toHaveLength(1);
    expect(q[1]!.chip).toBeNull();
  });
});

describe("las columnas", () => {
  const c = columnasDeCascada(partesDelEstadoFlujo({ real: real(), comparadas: [], etiquetaActual: "Oct", periodo: OCT }));
  it("cada movimiento empieza donde terminó el anterior", () => {
    // 30000 → +8000 = 38000 → −3000 = 35000 → −2000 = 33000
    const tope = 38000 * 1.14;
    expect(c[0]).toMatchObject({ total: true, abajo: 0 });
    expect(c[0]!.alto).toBeCloseTo((30000 / tope) * 100);
    expect(c[1]!.abajo).toBeCloseTo((30000 / tope) * 100);
    expect(c[1]!.alto).toBeCloseTo((8000 / tope) * 100);
    expect(c[2]!.abajo).toBeCloseTo((35000 / tope) * 100);
    expect(c[1]!.enlace).toBeCloseTo((38000 / tope) * 100);
    expect(c[4]).toMatchObject({ abajo: 0, enlace: null });
    expect(c[3]!.enlace).toBeCloseTo((33000 / tope) * 100);
  });
  it("los movimientos llevan signo y los saldos su moneda", () => {
    expect(c[1]!.texto).toBe("+8,000.00");
    expect(c[2]!.texto).toBe("−3,000.00");
    expect(c[0]!.texto).toBe(solesCentimos(30000));
  });
  it("con plata en negativo el piso baja y todo cabe", () => {
    const n = columnasDeCascada(partesDelEstadoFlujo({ real: real({ saldoInicial: 1000, saldoFinal: -2000, categorias: [{ clave: "gastos", lado: "sale", monto: 3000 }] }), comparadas: [], etiquetaActual: "Oct", periodo: OCT }));
    for (const col of n) {
      expect(col.abajo).toBeGreaterThanOrEqual(0);
      expect(col.abajo + col.alto).toBeLessThanOrEqual(100);
    }
    expect(n.at(-1)!.abajo).toBe(0);
    expect(n.at(-1)!.alto).toBeGreaterThan(0);
  });
  it("sin plata ni movimientos no se rompe", () => {
    for (const col of columnasDeCascada(partesDelEstadoFlujo({ real: real({ saldoInicial: 0, saldoFinal: 0, categorias: [] }), comparadas: [], etiquetaActual: "Oct", periodo: OCT }))) expect(Number.isFinite(col.alto)).toBe(true);
  });
});

it("el libro suma: inicio + cada actividad = final", () => {
  const l = libroDelFlujo(real());
  expect(l.map((x) => x.nombre)).toEqual(["Saldo inicial", "Actividades de operación", "Actividades de inversión", "Actividades de financiamiento", "Saldo final"]);
  expect(l.slice(0, -1).reduce((a, x) => a + x.valor, 0)).toBe(l.at(-1)!.valor);
});
