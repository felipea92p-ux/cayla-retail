import { describe, expect, it } from "vitest";
import {
  conForma,
  formaDe,
  ESTADOS,
  filaDeLaSede,
  leerPatrimonio,
  respuestaGanamos,
  respuestaPlata,
  respuestaTuyo,
  respuestaVale,
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

describe("respuestaGanamos", () => {
  it("ganó: verde, con lo vendido", () => {
    const r = respuestaGanamos({ resultado: 3850, ventas: 48600 }, null);
    expect(r).toMatchObject({ valor: 3850, punto: "verde", contexto: "Sí: vendiste S/\u00a048,600", conSigno: false });
  });
  it("perdió: rojo", () => {
    expect(respuestaGanamos({ resultado: -1450, ventas: 12000 }, null)).toMatchObject({ punto: "rojo", contexto: "No: vendiste S/\u00a012,000" });
  });
  it("una unidad que no vende lo dice", () => {
    expect(respuestaGanamos({ resultado: -2680, ventas: 0 }, null).contexto).toBe("No: no vende, sus gastos los cubren las tiendas");
  });
  it("sin lectura: «no se pudo leer», nunca un cero", () => {
    expect(respuestaGanamos(null, "falló")).toMatchObject({ valor: null, noSePudoLeer: true });
    expect(respuestaGanamos(null, null)).toMatchObject({ valor: null, noSePudoLeer: false });
  });
});

describe("respuestaPlata", () => {
  it("bajó: ámbar y cuánto", () => {
    expect(respuestaPlata({ saldoInicial: 31200, saldoFinal: 27450 }, null, false)).toMatchObject({ valor: 27450, punto: "ambar", contexto: "Bajó S/\u00a03,750 en el mes" });
  });
  it("subió: verde; mirando una sede, dice que es de toda CAYLA", () => {
    expect(respuestaPlata({ saldoInicial: 100, saldoFinal: 400 }, null, true)).toMatchObject({ punto: "verde", contexto: "Subió S/\u00a0300 en el mes · toda CAYLA" });
  });
});

describe("respuestaVale", () => {
  it("CAYLA entera: lo tuyo del Balance, solo si cuadra", () => {
    expect(respuestaVale({ total: 103600, cuadra: true, sinArranque: false }, null, null)).toMatchObject({ valor: 103600, pregunta: "¿Cuánto vale CAYLA?" });
    expect(respuestaVale({ total: 103600, cuadra: false, sinArranque: false }, null, null)).toMatchObject({ valor: null, contexto: "Todavía no cuadra: el Balance dice qué falta." });
    expect(respuestaVale({ total: 0, cuadra: true, sinArranque: true }, null, null)).toMatchObject({ valor: null, contexto: "Faltan los saldos de arranque." });
  });
  it("una sede: lo invertido en ella, con otra pregunta", () => {
    expect(respuestaVale({ total: 25950, cuadra: true, sinArranque: false }, null, "Lima")).toMatchObject({
      valor: 25950,
      pregunta: "¿Cuánto hay invertido?",
      contexto: "Invertido en Lima",
    });
  });
});

describe("leerPatrimonio y respuestaTuyo", () => {
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
  it("creció: el cambio con su signo, y la frase con lo que lo movió", () => {
    expect(respuestaTuyo(p, null)).toMatchObject({ valor: 850, conSigno: true, punto: "verde", contexto: "Ganaste S/\u00a03,850 y retiraste S/\u00a03,000" });
  });
  it("con un aporte, lo dice", () => {
    expect(respuestaTuyo({ ...p, aportes: 1000 }, null).contexto).toBe("Ganaste S/\u00a03,850, pusiste S/\u00a01,000 y retiraste S/\u00a03,000");
  });
  it("sin arranque: lo dice, sin cifra", () => {
    expect(respuestaTuyo(leerPatrimonio({ sin_arranque: true }), null)).toMatchObject({ valor: null, contexto: "Faltan los saldos de arranque." });
  });
});

describe("la forma de mirar un estado (respuesta o formal)", () => {
  it("solo «formal» es formal; lo demás, la respuesta", () => {
    expect(formaDe("formal")).toBe("formal");
    expect(formaDe(undefined)).toBe("respuesta");
    expect(formaDe("otra")).toBe("respuesta");
  });
  it("la respuesta no se escribe en la URL; la formal se suma a lo que haya", () => {
    expect(conForma("/finanzas/reportes", "respuesta")).toBe("/finanzas/reportes");
    expect(conForma("/finanzas/reportes", "formal")).toBe("/finanzas/reportes?forma=formal");
    expect(conForma("/finanzas/reportes/flujo?mes=2026-09", "formal")).toBe("/finanzas/reportes/flujo?mes=2026-09&forma=formal");
  });
});
