import { describe, expect, it } from "vitest";
import { cambioDelMes, cuadroFormalPatrimonio, mesesBajando, recomendacionesTuyo, tieneExtremos, empiezaAntesDelArranque, puntoDePartidaDelPatrimonio } from "./patrimonio-reglas";
import type { PatrimonioCambios } from "./estados-financieros-reglas";

const S = (s: string) => s.replace(/S\/ /g, "S/ ");
const datos = (p: Partial<PatrimonioCambios> = {}): PatrimonioCambios => ({
  mes: "2026-10",
  corte: "2026-10-31",
  arranque: "2026-08-01",
  sinArranque: false,
  inicio: { fecha: "2026-09-30", capital: 100000, aportes: 20000, utilidades: 30000, total: 150000 },
  fin: { fecha: "2026-10-31", capital: 100000, aportes: 25000, utilidades: 34000, total: 159000 },
  ganancia: 10000,
  aportes: 5000,
  retiros: 6000,
  otros: 0,
  serie: [
    { mes: "2026-08", corte: "2026-08-31", total: 140000 },
    { mes: "2026-09", corte: "2026-09-30", total: 150000 },
    { mes: "2026-10", corte: "2026-10-31", total: 159000 },
  ],
  ...p,
});
const href = (r: string) => `${r}?mes=2026-10`;

describe("tieneExtremos", () => {
  it("sin arranque o sin extremos no hay con qué contar", () => {
    expect(tieneExtremos(null)).toBe(false);
    expect(tieneExtremos(datos({ sinArranque: true }))).toBe(false);
    expect(tieneExtremos(datos({ fin: null }))).toBe(false);
    expect(tieneExtremos(datos())).toBe(true);
  });
});

describe("mesesBajando", () => {
  it("cuenta los meses seguidos que bajó, desde el último", () => {
    const s = (xs: number[]) => xs.map((total, i) => ({ mes: `2026-0${i + 1}`, corte: "", total }));
    expect(mesesBajando(s([10, 12, 11, 9]))).toBe(2);
    expect(mesesBajando(s([10, 9, 12]))).toBe(0);
    expect(mesesBajando(s([10]))).toBe(0);
    expect(mesesBajando([])).toBe(0);
  });
});

describe("cuadroFormalPatrimonio", () => {
  it("cada columna va del inicio al cierre y el total cuadra", () => {
    const d = datos();
    if (!tieneExtremos(d)) throw new Error();
    const f = cuadroFormalPatrimonio(d);
    expect(f.map((x) => x.clave)).toEqual(["inicio", "ganancia", "aportes", "retiros", "fin"]);
    const mov = f.filter((x) => x.clave !== "inicio" && x.clave !== "fin");
    for (const col of ["capital", "aportes", "utilidades", "total"] as const) expect(f[0]![col] + mov.reduce((a, x) => a + x[col], 0)).toBeCloseTo(f.at(-1)![col]);
    expect(cambioDelMes(d)).toBe(9000);
  });
  it("lo sin explicar cae en «Otros ajustes» de su columna", () => {
    const d = datos({ otros: 800, fin: { fecha: "2026-10-31", capital: 100800, aportes: 25000, utilidades: 34000, total: 159800 } });
    if (!tieneExtremos(d)) throw new Error();
    expect(cuadroFormalPatrimonio(d).find((x) => x.clave === "otros")).toMatchObject({ capital: 800, aportes: 0, utilidades: 0, total: 800 });
  });
});

describe("recomendacionesTuyo", () => {
  it("sin arranque, nada", () => {
    expect(recomendacionesTuyo({ datos: datos({ sinArranque: true }), href })).toEqual([]);
  });
  it("retirar más de la mitad de lo ganado dice cuánto habría crecido con la mitad", () => {
    const r = recomendacionesTuyo({ datos: datos(), href });
    expect(r.map((x) => x.clave)).toEqual(["retiro-alto"]);
    expect(r[0]!.titulo).toBe("Retiraste el 60 % de lo ganado");
    // Creció 9,000 retirando 6,000; retirando 5,000 habría crecido 10,000.
    expect(r[0]!.texto).toBe(S("Retirando la mitad, S/ 5,000, lo tuyo habría crecido S/ 10,000 en vez de S/ 9,000."));
  });
  it("retirar más de lo ganado, perder y bajar meses seguidos se avisan; lo sin explicar va primero", () => {
    const r = recomendacionesTuyo({
      datos: datos({
        otros: -300,
        retiros: 15000,
        serie: [
          { mes: "2026-08", corte: "", total: 170000 },
          { mes: "2026-09", corte: "", total: 160000 },
          { mes: "2026-10", corte: "", total: 159000 },
        ],
      }),
      href,
    });
    expect(r.map((x) => x.clave)).toEqual(["otros", "retiro-mayor", "bajando"]);
    expect(r[0]!.accion?.href).toBe("/finanzas/reportes/balance?mes=2026-10");
    expect(r[2]!.titulo).toBe("Lo tuyo baja hace 2 meses");
  });
  it("una pérdida lleva a Ganancias y pérdidas", () => {
    const r = recomendacionesTuyo({ datos: datos({ ganancia: -4000, retiros: 0 }), href });
    expect(r[0]).toMatchObject({ clave: "perdida", accion: { href: "/finanzas/reportes?mes=2026-10" } });
  });
  it("sin nada fuera de lo normal, lo dice", () => {
    const r = recomendacionesTuyo({ datos: datos({ retiros: 2000 }), href });
    expect(r).toHaveLength(1);
    expect(r[0]!.tono).toBe("exito");
  });
});

describe("retirar contra lo ganado de verdad (tarea 23)", () => {
  const base = { sinArranque: false, inicio: { capital: 0, aportes: 0, utilidades: 0, total: 1000 }, fin: { capital: 0, aportes: 0, utilidades: 0, total: 1200 }, ganancia: 1000, aportes: 0, retiros: 800, otros: 0, serie: [] };
  const claves = (sueldosEstimados?: number) => recomendacionesTuyo({ datos: base as never, href: (r) => r, sueldosEstimados }).map((x) => x.clave);
  it("sin sueldos pendientes, retirar el 80 % es un retiro alto; con sueldos pendientes, ya es más de lo ganado", () => {
    expect(claves()).toContain("retiro-alto");
    expect(claves(500)).toContain("retiro-mayor");
    expect(claves(500)).not.toContain("retiro-alto");
  });
});

describe("antes del punto de partida del Balance no hay puente (tarea 20)", () => {
  const conArranque = (arranque: string | null) => ({ ...datos(), arranque });
  it("un período que empieza antes del arranque: también si cruza y termina después", () => {
    expect(empiezaAntesDelArranque(conArranque("2026-11-01"), "2026-10-01")).toBe(true);
    expect(empiezaAntesDelArranque(conArranque("2026-11-01"), "2026-10-15")).toBe(true);
  });
  it("desde el arranque en adelante hay puente", () => {
    expect(empiezaAntesDelArranque(conArranque("2026-11-01"), "2026-11-01")).toBe(false);
    expect(empiezaAntesDelArranque(conArranque("2026-11-01"), "2026-12-01")).toBe(false);
  });
  it("sin dato no se afirma nada", () => {
    expect(empiezaAntesDelArranque(conArranque(null), "2026-10-01")).toBe(false);
    expect(empiezaAntesDelArranque(null, "2026-10-01")).toBe(false);
  });
  it("dice cuál es el punto de partida y a dónde ir por lo ganado", () => {
    const f = puntoDePartidaDelPatrimonio("2026-11-01");
    expect(f).toContain("1 de noviembre de 2026");
    expect(f).toContain("punto de partida");
    expect(f).toContain("Ganancias y pérdidas");
    expect(f).not.toContain("sin explicar");
  });
});

describe("la recomendación de lo que no es venta ni gasto (tarea 20)", () => {
  it("nombra la carga inicial y no da por hecho un error", () => {
    const r = recomendacionesTuyo({ datos: datos({ otros: 10000, retiros: 0 }), href });
    expect(r[0]).toMatchObject({ clave: "otros", tono: "info" });
    expect(r[0]!.titulo).toContain("carga inicial");
    expect(r[0]!.titulo).not.toContain("sin explicar");
  });
});
