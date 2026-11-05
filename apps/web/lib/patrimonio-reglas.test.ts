import { describe, expect, it } from "vitest";
import { cambioDelMes, cuadroFormalPatrimonio, fraseTuyo, mesesBajando, filasTuyo, recomendacionesTuyo, tieneExtremos } from "./patrimonio-reglas";
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
const suma = (filas: ReturnType<typeof filasTuyo>) => filas.filter((f) => f.tipo === "paso").reduce((a, f) => a + f.valor, 0);

describe("tieneExtremos", () => {
  it("sin arranque o sin extremos no hay con qué contar", () => {
    expect(tieneExtremos(null)).toBe(false);
    expect(tieneExtremos(datos({ sinArranque: true }))).toBe(false);
    expect(tieneExtremos(datos({ fin: null }))).toBe(false);
    expect(tieneExtremos(datos())).toBe(true);
  });
});

describe("filasTuyo", () => {
  it("lo que lo movió, con su signo, y al final cuánto creció: los pasos suman el final", () => {
    const d = datos();
    if (!tieneExtremos(d)) throw new Error();
    const f = filasTuyo(d);
    expect(f.map((x) => [x.clave, x.tipo, x.valor])).toEqual([
      ["ganancia", "paso", 10000],
      ["aportes", "paso", 5000],
      ["retiros", "paso", -6000],
      ["cambio", "final", 9000],
    ]);
    expect(f.at(-1)!.nombre).toBe("Creció");
    expect(suma(f)).toBe(9000);
  });
  it("una pérdida resta, lo que es cero no se dibuja y lo sin explicar se muestra", () => {
    const d = datos({ ganancia: -2000, aportes: 0, retiros: 0, otros: 500, fin: { fecha: "2026-10-31", capital: 100000, aportes: 20000, utilidades: 28500, total: 148500 } });
    if (!tieneExtremos(d)) throw new Error();
    const f = filasTuyo(d);
    expect(f.map((x) => x.clave)).toEqual(["ganancia", "otros", "cambio"]);
    expect(f[0]).toMatchObject({ nombre: "Lo que perdiste", valor: -2000 });
    expect(f.at(-1)).toMatchObject({ nombre: "Bajó", valor: -1500 });
    expect(suma(f)).toBe(-1500);
  });
});

describe("fraseTuyo", () => {
  it("dice qué parte de lo ganado retiraste", () => {
    const d = datos();
    if (!tieneExtremos(d)) throw new Error();
    expect(fraseTuyo(d)).toBe(S("De los S/ 10,000 que ganaste, retiraste S/ 6,000: el 60 % y pusiste S/ 5,000."));
  });
  it("si retiras más de lo ganado, lo dice", () => {
    const d = datos({ aportes: 0, retiros: 12000 });
    if (!tieneExtremos(d)) throw new Error();
    expect(fraseTuyo(d)).toBe(S("Ganaste S/ 10,000 y retiraste S/ 12,000: más de lo que ganaste."));
  });
  it("sin retiros, con pérdida o sin nada", () => {
    const a = datos({ aportes: 0, retiros: 0 });
    const b = datos({ ganancia: -3000, aportes: 0, retiros: 1000 });
    const c = datos({ ganancia: 0, aportes: 0, retiros: 0 });
    if (!tieneExtremos(a) || !tieneExtremos(b) || !tieneExtremos(c)) throw new Error();
    expect(fraseTuyo(a)).toBe(S("Ganaste S/ 10,000 y no retiraste nada."));
    expect(fraseTuyo(b)).toBe(S("Perdiste S/ 3,000 en el mes y retiraste S/ 1,000."));
    expect(fraseTuyo(c)).toBe("No se movió en el mes.");
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
  it("una pérdida lleva a ¿Ganamos?", () => {
    const r = recomendacionesTuyo({ datos: datos({ ganancia: -4000, retiros: 0 }), href });
    expect(r[0]).toMatchObject({ clave: "perdida", accion: { href: "/finanzas/reportes?mes=2026-10" } });
  });
  it("sin nada fuera de lo normal, lo dice", () => {
    const r = recomendacionesTuyo({ datos: datos({ retiros: 2000 }), href });
    expect(r).toHaveLength(1);
    expect(r[0]!.tono).toBe("exito");
  });
});
