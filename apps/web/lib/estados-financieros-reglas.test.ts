import { describe, expect, it } from "vitest";
import {
  ESTADOS,
  filaDeLaSede,
  leerPatrimonio,
} from "./estados-financieros-reglas";
import type { FilaER } from "./resultados-reglas";

const fila = (p: Partial<FilaER>): FilaER => ({ ubicacionId: null, unidad: "tienda", nombre: "", resultado: 0, ventas: 0, ...p }) as FilaER;

describe("ESTADOS (ADR-0585)", () => {
  it("son los cuatro, con su pregunta y su nombre formal, y la ruta de siempre", () => {
    expect(ESTADOS.map((e) => e.clave)).toEqual(["ganamos", "plata", "vale", "tuyo"]);
    expect(ESTADOS.every((e) => e.ruta.startsWith("/finanzas/reportes"))).toBe(true);
    expect(new Set(ESTADOS.map((e) => e.ruta)).size).toBe(4);
  });
});

describe("filaDeLaSede", () => {
  const filas = [
    fila({ ubicacionId: "u-tru", unidad: "tienda", resultado: 6120 }),
    fila({ ubicacionId: null, unidad: "empresa", resultado: -2680 }),
    fila({ ubicacionId: null, unidad: "consolidado", resultado: 3440 }),
  ];
  it("todas → CAYLA; empresa → «De la empresa»; una sede → su columna", () => {
    expect(filaDeLaSede(filas, "todas")?.resultado).toBe(3440);
    expect(filaDeLaSede(filas, "empresa")?.resultado).toBe(-2680);
    expect(filaDeLaSede(filas, "u-tru")?.resultado).toBe(6120);
    expect(filaDeLaSede(filas, "u-lim")).toBeNull();
  });
  it("sin consolidado (la cuenta ve una sola sede), «todas» es esa", () => {
    expect(filaDeLaSede([filas[0]!], "todas")?.resultado).toBe(6120);
  });
});

describe("leerPatrimonio", () => {
  const p = leerPatrimonio({
    mes: "2026-10-01",
    corte: "2026-10-30",
    arranque: "2026-09-01",
    sin_arranque: false,
    inicio: { fecha: "2026-09-30", capital: 80000, aportes: 0, utilidades: "22750", total: 102750 },
    fin: { fecha: "2026-10-30", capital: 80000, aportes: 0, utilidades: 23600, total: "103600" },
    ganancia: 3850,
    aportes: 0,
    retiros: 3000,
    otros: 0,
    serie: [{ mes: "2026-09-01", corte: "2026-09-30", total: 102750 }],
  });
  it("lee los numeric que llegan como texto", () => {
    expect(p.inicio?.utilidades).toBe(22750);
    expect(p.fin?.total).toBe(103600);
    expect(p.serie[0]).toEqual({ mes: "2026-09", corte: "2026-09-30", total: 102750 });
  });
});

