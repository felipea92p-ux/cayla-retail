import { describe, expect, it } from "vitest";
import { informeDelPatrimonio, lecturaDelPatrimonio, partesDelPatrimonio } from "./estados-patrimonio";
import { periodoDe } from "./estados-periodo";
import { solesCentimos } from "./flujo-caja-reglas";
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
    expect(l).toMatchObject({ valor: 6000, mal: false, conSigno: true, frase: `Tu parte en CAYLA creció: pasó de ${solesCentimos(90000)} a ${solesCentimos(96000)}.` });
    expect(l.chip).toEqual({ texto: `Ganaste ${solesCentimos(9000)} y retiraste ${solesCentimos(3000)}`, tono: "bien" });
    expect(l.nota).toBe("El 67 % de lo ganado se quedó en CAYLA.");
  });
  it("bajó", () => {
    const l = lecturaDelPatrimonio(dato({ fin: { ...dato().fin, total: 85000 }, ganancia: -2000 }));
    expect(l).toMatchObject({ valor: -5000, mal: true, conSigno: false, frase: `Tu parte en CAYLA bajó: pasó de ${solesCentimos(90000)} a ${solesCentimos(85000)}.` });
    expect(l.chip).toEqual({ texto: `Perdiste ${solesCentimos(2000)} y retiraste ${solesCentimos(3000)}`, tono: "mal" });
    expect(l.nota).toBe(`Perdiste ${solesCentimos(2000)} y además retiraste ${solesCentimos(3000)}.`);
  });
  it("no se movió", () => {
    const l = lecturaDelPatrimonio(dato({ fin: dato().inicio, ganancia: 0, retiros: 0 }));
    expect(l).toMatchObject({ valor: 0, conSigno: false, frase: `Tu parte en CAYLA no se movió: sigue en ${solesCentimos(90000)}.`, chip: null, nota: null });
  });
  it("lo que puso también se dice", () => {
    expect(lecturaDelPatrimonio(dato({ aportes: 1000 })).chip!.texto).toBe(`Ganaste ${solesCentimos(9000)}, pusiste ${solesCentimos(1000)} y retiraste ${solesCentimos(3000)}`);
  });
  it("todo se quedó, más de lo ganado y sin ganancia", () => {
    expect(lecturaDelPatrimonio(dato({ retiros: 0 })).nota).toBe("Todo lo ganado se quedó en CAYLA.");
    expect(lecturaDelPatrimonio(dato({ retiros: 10000 })).nota).toBe(`Retiraste más de lo que ganaste: ${solesCentimos(1000)} salieron de lo que ya tenía CAYLA.`);
    expect(lecturaDelPatrimonio(dato({ ganancia: 0 })).nota).toBe(`No hubo ganancia y retiraste ${solesCentimos(3000)}.`);
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
  it("lo ganado avisa que no trae los sueldos estimados, porque Ganancias y pérdidas sí los resta", () => {
    expect(partesDelPatrimonio({ ...base, datos: dato() }).find((x) => x.clave === "ganancia")!.que).toContain("sueldos estimados");
  });
  it("perdiste en rojo y lo que no se explica aparte", () => {
    const p = partesDelPatrimonio({ ...base, datos: dato({ ganancia: -100, otros: 40 }) });
    expect(p.find((x) => x.clave === "ganancia")).toMatchObject({ nombre: "Perdiste", tono: "mal", color: "var(--color-rojo)" });
    expect(p.find((x) => x.clave === "otros")!.nombre).toBe("Sin explicar");
  });
  it("sin retiros, dice S/ 0 y no se pinta de rojo", () => {
    expect(partesDelPatrimonio({ ...base, datos: dato({ retiros: 0 }) }).find((x) => x.clave === "retiros")).toMatchObject({ texto: solesCentimos(0), tono: undefined, filas: [] });
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
    expect(g.chip).toEqual({ texto: `${solesCentimos(5000)} más que septiembre`, tono: "bien" });
    expect(p.find((x) => x.clave === "retiros")!.chip).toEqual({ texto: `${solesCentimos(2000)} más que septiembre`, tono: "mal" });
  });
});

it("el informe suma: saldo inicial + lo que lo movió = saldo final (camino A, 2026-11-06)", () => {
  const informe = (d: ReturnType<typeof dato>) =>
    informeDelPatrimonio({ datos: d, partes: partesDelPatrimonio({ datos: d, comparadas: [], etiquetaActual: "Oct", periodo: OCT, porSede: [] }), comparadas: [{ etiqueta: "Sep", datos: null }], etiquetaActual: "Oct" });
  const l = informe(dato({ aportes: 500, otros: 40, fin: { ...dato().fin, total: 96540 } }));
  expect(l.filas.map((x) => x.contable)).toEqual(["Saldo inicial", "Resultado del período", "Aportes del dueño", "Retiros del dueño", "Otros ajustes", "Saldo final"]);
  const ahora = l.filas.map((x) => x.valores.at(-1)!);
  expect(ahora.slice(0, -1).reduce((a, x) => a + x, 0)).toBe(ahora.at(-1));
  expect(l.filas[0]!.valores[0]).toBeNull();
  expect(informe(dato()).filas.map((x) => x.contable)).toEqual(["Saldo inicial", "Resultado del período", "Retiros del dueño", "Saldo final"]);
});

describe("con sueldos que Dynamic todavía no paga (tarea 23)", () => {
  it("la cifra y el chip no cambian: el puente cuadra con el Balance; la nota lo rotula", () => {
    const sin = lecturaDelPatrimonio(dato());
    const con = lecturaDelPatrimonio(dato(), 500);
    expect(con.valor).toBe(sin.valor);
    expect(con.chip).toEqual(sin.chip);
    expect(con.nota).toContain(`Sin sueldos provisionados: aún falta restar ${solesCentimos(500)}`);
  });
  it("lo retirado se mide contra lo ganado menos los sueldos", () => {
    const d = dato({ ganancia: 1000, retiros: 800, fin: { ...dato().fin, total: dato().inicio.total + 200 } });
    expect(lecturaDelPatrimonio(d).nota).toBe("El 20 % de lo ganado se quedó en CAYLA.");
    expect(lecturaDelPatrimonio(d, 500).nota).toContain(`Retiraste más de lo que ganaste: ${solesCentimos(300)}`);
  });
});
