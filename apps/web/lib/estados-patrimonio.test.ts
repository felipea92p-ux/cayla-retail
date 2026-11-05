import { describe, expect, it } from "vitest";
import { lecturaDelPatrimonio, libroDelPatrimonio, partesDelPatrimonio } from "./estados-patrimonio";
import { periodoDe } from "./estados-periodo";
import { soles } from "./flujo-caja-reglas";
import type { PatrimonioCambios } from "./estados-financieros-reglas";

const HOY = "2026-11-05";
const OCT = periodoDe("2026-10-01", "2026-10-31", HOY);
type P = PatrimonioCambios & { inicio: NonNullable<PatrimonioCambios["inicio"]>; fin: NonNullable<PatrimonioCambios["fin"]> };
const dato = (o: Partial<P> = {}): P => ({
  mes: "2026-10",
  corte: "2026-10-31",
  arranque: "2025-11-01",
  sinArranque: false,
  inicio: { fecha: "2026-09-30", capital: 60000, aportes: 8000, utilidades: 22000, total: 90000 },
  fin: { fecha: "2026-10-31", capital: 60000, aportes: 8000, utilidades: 28000, total: 96000 },
  ganancia: 9000,
  aportes: 0,
  retiros: 3000,
  otros: 0,
  serie: [],
  ...o,
});

describe("lo que dice la pantalla", () => {
  it("creció", () => {
    const l = lecturaDelPatrimonio(dato());
    expect(l).toMatchObject({ valor: 6000, mal: false, conSigno: true, frase: `Tu parte en CAYLA creció: pasó de ${soles(90000)} a ${soles(96000)}.` });
    expect(l.chip).toEqual({ texto: `Ganaste ${soles(9000)} y retiraste ${soles(3000)}`, tono: "bien" });
    expect(l.nota).toBe("El 67 % de lo ganado se quedó en CAYLA.");
  });
  it("bajó", () => {
    const l = lecturaDelPatrimonio(dato({ fin: { ...dato().fin, total: 85000 }, ganancia: -2000 }));
    expect(l).toMatchObject({ valor: -5000, mal: true, conSigno: false, frase: `Tu parte en CAYLA bajó: pasó de ${soles(90000)} a ${soles(85000)}.` });
    expect(l.chip).toEqual({ texto: `Perdiste ${soles(2000)} y retiraste ${soles(3000)}`, tono: "mal" });
    expect(l.nota).toBe(`Perdiste ${soles(2000)} y además retiraste ${soles(3000)}.`);
  });
  it("no se movió", () => {
    const l = lecturaDelPatrimonio(dato({ fin: dato().inicio, ganancia: 0, retiros: 0 }));
    expect(l).toMatchObject({ valor: 0, conSigno: false, frase: `Tu parte en CAYLA no se movió: sigue en ${soles(90000)}.`, chip: null, nota: null });
  });
  it("lo que puso también se dice", () => {
    expect(lecturaDelPatrimonio(dato({ aportes: 1000 })).chip!.texto).toBe(`Ganaste ${soles(9000)}, pusiste ${soles(1000)} y retiraste ${soles(3000)}`);
  });
  it("todo se quedó, más de lo ganado y sin ganancia", () => {
    expect(lecturaDelPatrimonio(dato({ retiros: 0 })).nota).toBe("Todo lo ganado se quedó en CAYLA.");
    expect(lecturaDelPatrimonio(dato({ retiros: 10000 })).nota).toBe(`Retiraste más de lo que ganaste: ${soles(1000)} salieron de lo que ya tenía CAYLA.`);
    expect(lecturaDelPatrimonio(dato({ ganancia: 0 })).nota).toBe(`No hubo ganancia y retiraste ${soles(3000)}.`);
    expect(lecturaDelPatrimonio(dato({ ganancia: -100, retiros: 0 })).nota).toBe("La pérdida baja tu parte igual que un retiro.");
  });
});

describe("las partes", () => {
  const base = { comparadas: [], etiquetaActual: "Oct", periodo: OCT, porSede: [] };
  it("empezaste, lo que lo movió y terminaste, sin lo que no pasó", () => {
    expect(partesDelPatrimonio({ ...base, datos: dato() }).map((p) => p.clave)).toEqual(["inicio", "ganancia", "retiros", "fin"]);
    expect(partesDelPatrimonio({ ...base, datos: dato({ aportes: 500, otros: 40 }) }).map((p) => p.clave)).toEqual(["inicio", "ganancia", "aportes", "retiros", "otros", "fin"]);
  });
  it("suman: empezar + lo que lo movió = terminar", () => {
    const p = partesDelPatrimonio({ ...base, datos: dato({ aportes: 500, otros: 40, fin: { ...dato().fin, total: 96540 } }) });
    const de = (c: string) => p.find((x) => x.clave === c)!.cifra;
    expect(de("inicio") + de("ganancia") + de("aportes") + de("retiros") + de("otros")).toBe(de("fin"));
  });
  it("perdiste en rojo y lo que no se explica aparte", () => {
    const p = partesDelPatrimonio({ ...base, datos: dato({ ganancia: -100, otros: 40 }) });
    expect(p.find((x) => x.clave === "ganancia")).toMatchObject({ nombre: "Perdiste", tono: "mal", color: "var(--color-rojo)" });
    expect(p.find((x) => x.clave === "otros")!.nombre).toBe("Sin explicar");
  });
  it("sin retiros, dice S/ 0 y no se pinta de rojo", () => {
    expect(partesDelPatrimonio({ ...base, datos: dato({ retiros: 0 }) }).find((x) => x.clave === "retiros")).toMatchObject({ texto: soles(0), tono: undefined, filas: [] });
  });
  it("de qué está hecho lo tuyo, y lo ganado por sede", () => {
    const p = partesDelPatrimonio({ ...base, datos: dato(), porSede: [{ nombre: "Lima", valor: 9500 }, { nombre: "Taller", valor: -500 }] });
    expect(p[0]!.filas.map((f) => f.valor)).toEqual([60000, 8000, 22000]);
    expect(p[1]!.filas).toEqual([{ nombre: "Lima", valor: 9500 }, { nombre: "Taller", valor: -500 }]);
  });
  it("compara con el período de antes; retirar más no es bueno; lo que no se pudo leer no se dibuja", () => {
    const p = partesDelPatrimonio({ ...base, datos: dato(), comparadas: [{ etiqueta: "Ago", datos: null }, { etiqueta: "Sep", datos: dato({ ganancia: 4000, retiros: 1000 }) }] });
    const g = p.find((x) => x.clave === "ganancia")!;
    expect(g.columnas.map((c) => [c.etiqueta, c.valor])).toEqual([["Sep", 4000], ["Oct", 9000]]);
    expect(g.chip).toEqual({ texto: `${soles(5000)} más que septiembre`, tono: "bien" });
    expect(p.find((x) => x.clave === "retiros")!.chip).toEqual({ texto: `${soles(2000)} más que septiembre`, tono: "mal" });
  });
});

it("el libro suma: saldo inicial + lo que lo movió = saldo final", () => {
  const l = libroDelPatrimonio(dato({ aportes: 500, otros: 40, fin: { ...dato().fin, total: 96540 } }));
  expect(l.map((x) => x.nombre)).toEqual(["Saldo inicial", "Resultado del período", "Aportes del dueño", "Retiros del dueño", "Otros ajustes", "Saldo final"]);
  expect(l.slice(0, -1).reduce((a, x) => a + x.valor, 0)).toBe(l.at(-1)!.valor);
  expect(libroDelPatrimonio(dato()).map((x) => x.nombre)).toEqual(["Saldo inicial", "Resultado del período", "Retiros del dueño", "Saldo final"]);
});
