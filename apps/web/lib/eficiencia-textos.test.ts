import { describe, expect, it } from "vitest";
import { soles } from "./compras-reglas";
import { eficienciaDePeriodo, ventanasDePeriodos, type GastoTaller, type OrdenParaEficiencia, type PlanillaPeriodo, type VentanaPeriodo } from "./eficiencia-reglas";
import { costoDelPeriodo, deCada100, filasDelGasto, formaDelCosto, mesesDeEficiencia, nombresDePeriodos, paresDelPeriodo, textoDeLaPlanilla, variacionEnSoles } from "./eficiencia-textos";

const planilla = (ini: string, fin: string, costo: number): PlanillaPeriodo => ({ periodoId: `p-${ini}`, ini, fin, personas: 5, pagado: costo * 0.85, provisiones: costo * 0.15, costoTotal: costo });
const orden = (id: string, extra: Partial<OrdenParaEficiencia> = {}): OrdenParaEficiencia => ({
  id,
  referencia: `Blusa ${id}`,
  estado: "terminada",
  esMuestra: false,
  cerradaEn: "2026-11-10",
  fechaEntrega: "2026-11-12",
  cantidadPlan: 50,
  cantidadBuenas: 50,
  costoTela: 800,
  costoAvios: 100,
  costoMaquila: 100,
  ...extra,
});

// Dos períodos de planilla (29 al 28): noviembre y octubre, del más reciente al más viejo.
const VENTANAS = ventanasDePeriodos([planilla("2026-09-29", "2026-10-28", 4000), planilla("2026-10-29", "2026-11-28", 5000)], "2026-11-26");
const [NOV, OCT] = VENTANAS;
const NOMBRES = nombresDePeriodos(VENTANAS);
const nombre = (v: VentanaPeriodo) => NOMBRES.get(v.clave)!;
const GASTOS: GastoTaller[] = [{ categoria: "alquiler", total: 800, fecha: "2026-11-05" }, { categoria: "servicios", total: 200, fecha: "2026-11-20" }];
const ORDENES = [orden("a"), orden("b", { cantidadPlan: 52, cantidadBuenas: 50, cerradaEn: "2026-11-15", fechaEntrega: "2026-11-12" }), orden("o", { cerradaEn: "2026-10-10", fechaEntrega: "2026-10-12" })];
const noviembre = eficienciaDePeriodo(NOV, ORDENES, GASTOS);
const octubre = eficienciaDePeriodo(OCT, ORDENES, GASTOS);

describe("nombresDePeriodos — un período se llama por el mes en que cierra", () => {
  it("el de la planilla (29 al 28) lleva el mes de su cierre, en cada forma en que la pantalla lo dice", () => {
    expect(nombre(NOV)).toEqual({ pildora: "Noviembre", enFrase: "En noviembre", comparado: "en noviembre", corto: "Nov", fechas: "Del 29 de octubre al 28 de noviembre" });
    expect(nombre(OCT).pildora).toBe("Octubre");
  });
  it("un mes de calendario (sin planilla) se llama por su mes, y setiembre se escribe como en el Perú", () => {
    const meses = ventanasDePeriodos([], "2026-09-21");
    expect([...nombresDePeriodos(meses).values()].map((n) => n.pildora)).toEqual(["Setiembre", "Agosto", "Julio"]);
    expect(nombresDePeriodos(meses).get(meses[0].clave)?.corto).toBe("Set");
  });
  it("si dos períodos cierran en el mismo mes, el mes ya no los distingue: todos se dicen por sus fechas", () => {
    const dobles = ventanasDePeriodos([planilla("2026-11-01", "2026-11-14", 1), planilla("2026-11-15", "2026-11-28", 1)], "2026-11-26");
    const n = nombresDePeriodos(dobles).get(dobles[0].clave);
    expect(n).toEqual({ pildora: "15 nov – 28 nov", enFrase: "Del 15 de noviembre al 28 de noviembre", comparado: "el período anterior", corto: "15 nov – 28 nov", fechas: "Del 15 de noviembre al 28 de noviembre" });
  });
});

describe("variacionEnSoles — cuánto cambió, en soles", () => {
  it("bajar es bueno (verde), subir pide mirar (ámbar), y se dice contra qué período", () => {
    expect(variacionEnSoles(38.4, 40.5, "en octubre")).toEqual({ texto: `${soles(2.1)} menos que en octubre`, tono: "verde" });
    expect(variacionEnSoles(40.5, 38.4, "en octubre")).toEqual({ texto: `${soles(2.1)} más que en octubre`, tono: "ambar" });
  });
  it("igual, o sin con qué comparar, es neutra", () => {
    expect(variacionEnSoles(38.4, 38.401, "en octubre")).toEqual({ texto: "Igual que en octubre", tono: "neutro" });
    for (const [a, b, c] of [[38.4, null, "en octubre"], [null, 40, "en octubre"], [38.4, 40, null]] as const) expect(variacionEnSoles(a, b, c)).toEqual({ texto: "Sin período anterior para comparar", tono: "neutro" });
  });
});

describe("costoDelPeriodo — el bloque principal", () => {
  it("con planilla dice lo que costó hacer una prenda y lo compara con el período anterior", () => {
    // Noviembre: (1800 + 200 + 5000 + 1000) / 100 = 80. Octubre: (900 + 100 + 4000) / 50 = 100.
    expect(noviembre.costoPorPrenda).toBe(80);
    expect(octubre.costoPorPrenda).toBe(100);
    expect(costoDelPeriodo(noviembre, octubre, nombre(NOV), nombre(OCT))).toEqual({
      rotulo: "En noviembre, hacer una prenda costó",
      valor: 80,
      falta: null,
      insignia: { texto: `${soles(20)} menos que en octubre`, tono: "verde" },
    });
  });
  it("el período más viejo no tiene con qué compararse", () => {
    expect(costoDelPeriodo(octubre, null, nombre(OCT), null).insignia).toEqual({ texto: "Sin período anterior para comparar", tono: "neutro" });
  });
  it("sin planilla NO inventa el costo: muestra los materiales por prenda, los compara entre sí y dice qué falta", () => {
    const sinNov = eficienciaDePeriodo({ ...NOV, planilla: null }, ORDENES, GASTOS);
    const sinOct = eficienciaDePeriodo({ ...OCT, planilla: null }, ORDENES, GASTOS);
    expect(costoDelPeriodo(sinNov, sinOct, nombre(NOV), nombre(OCT))).toEqual({
      rotulo: "En noviembre, los materiales de una prenda costaron",
      valor: 20,
      falta: "Falta la planilla para el costo completo.",
      insignia: { texto: "Igual que en octubre", tono: "neutro" },
    });
  });
  it("sin prendas no hay cifra ni insignia: lo dice", () => {
    const vacio = eficienciaDePeriodo(NOV, [], GASTOS);
    expect(costoDelPeriodo(vacio, octubre, nombre(NOV), nombre(OCT))).toEqual({ rotulo: "En noviembre no se cerró ninguna orden", valor: null, falta: "Sin prendas buenas no hay costo por prenda.", insignia: null });
  });
});

describe("formaDelCosto — de qué se forma", () => {
  it("materiales y mano de obra por prenda, cada uno con su barra a escala del mayor", () => {
    expect(formaDelCosto(noviembre)).toEqual([
      { clave: "materiales", etiqueta: "Materiales", monto: 20, pct: (20 / 60) * 100 },
      { clave: "conversion", etiqueta: "Mano de obra y gastos", monto: 60, pct: 100 },
    ]);
  });
  it("sin planilla no hay fila de mano de obra (nunca un cero que parezca dato); sin prendas, ninguna", () => {
    expect(formaDelCosto(eficienciaDePeriodo({ ...NOV, planilla: null }, ORDENES, GASTOS)).map((p) => p.clave)).toEqual(["materiales"]);
    expect(formaDelCosto(eficienciaDePeriodo(NOV, [], GASTOS))).toEqual([]);
  });
});

describe("deCada100 y paresDelPeriodo — los datos del período, cada uno en su pieza", () => {
  it("«N de cada 100» redondea hacia abajo y solo dice «Todas» si fueron todas", () => {
    expect(deCada100(0.97)).toBe("97 de cada 100");
    expect(deCada100(0.996)).toBe("99 de cada 100");
    expect(deCada100(1)).toBe("Todas");
    expect(deCada100(1.04)).toBe("Todas");
    expect(deCada100(null)).toBeNull();
  });
  it("prendas, órdenes, calidad y entregas a tiempo (en ámbar si alguna se cerró tarde)", () => {
    // Noviembre: 100 buenas de 102 planeadas; «a» a tiempo y «b» tarde.
    expect(paresDelPeriodo(noviembre)).toEqual([
      { clave: "prendas", rotulo: "Prendas buenas", valor: "100", tono: "tinta" },
      { clave: "ordenes", rotulo: "Órdenes cerradas", valor: "2", tono: "tinta" },
      { clave: "calidad", rotulo: "Salieron buenas", valor: "98 de cada 100", tono: "tinta" },
      { clave: "entregas", rotulo: "Entregas a tiempo", valor: "1 de 2", tono: "ambar" },
    ]);
    expect(paresDelPeriodo(octubre).find((p) => p.clave === "entregas")).toEqual({ clave: "entregas", rotulo: "Entregas a tiempo", valor: "1 de 1", tono: "tinta" });
  });
  it("las órdenes sin fecha de entrega se dicen aparte, y sin ninguna con fecha no hay «a tiempo»", () => {
    const sinFecha = paresDelPeriodo(eficienciaDePeriodo(NOV, [orden("a", { fechaEntrega: null })], []));
    expect(sinFecha.map((p) => p.clave)).toEqual(["prendas", "ordenes", "calidad", "sin_fecha"]);
    expect(sinFecha.at(-1)).toMatchObject({ rotulo: "Sin fecha de entrega", valor: "1" });
  });
  it("sin órdenes cerradas no hay nada que decir", () => {
    expect(paresDelPeriodo(eficienciaDePeriodo(NOV, [], GASTOS))).toEqual([]);
  });
});

describe("filasDelGasto — en qué se fue la plata", () => {
  it("cada parte con su porcentaje del total y su barra a escala de la mayor; los gastos generales dicen de qué fueron", () => {
    const filas = filasDelGasto(noviembre);
    expect(filas.map((f) => [f.etiqueta, f.monto, f.porcentaje, Math.round(f.pct)])).toEqual([
      ["Planilla", 5000, "63 %", 100],
      ["Tela y avíos", 1800, "23 %", 36],
      ["Servicios de afuera", 200, "3 %", 4],
      ["Gastos generales", 1000, "13 %", 20],
    ]);
    expect(filas.find((f) => f.clave === "gastos")?.detalle).toEqual([{ categoria: "Alquiler", total: 800 }, { categoria: "Servicios", total: 200 }]);
    expect(filas.filter((f) => f.clave !== "gastos").every((f) => f.detalle.length === 0)).toBe(true);
  });
  it("sin gasto no hay filas", () => {
    expect(filasDelGasto(eficienciaDePeriodo({ ...NOV, planilla: null }, [], []))).toEqual([]);
  });
  it("la planilla se explica como costo total, con cuántas personas", () => {
    expect(textoDeLaPlanilla(5)).toContain("de 5 personas:");
    expect(textoDeLaPlanilla(1)).toContain("de 1 persona:");
  });
});

describe("mesesDeEficiencia — costo por prenda, mes a mes", () => {
  it("del período más viejo al más reciente, con la cifra de cada uno y lo que oye el lector", () => {
    const m = mesesDeEficiencia([noviembre, octubre], NOMBRES);
    expect(m.titulo).toBe("Costo por prenda, mes a mes");
    expect(m.barras).toEqual([
      { clave: OCT.clave, etiqueta: "Oct", valor: 100, cifra: "100.00", aria: `Octubre: ${soles(100)} por prenda` },
      { clave: NOV.clave, etiqueta: "Nov", valor: 80, cifra: "80.00", aria: `Noviembre: ${soles(80)} por prenda` },
    ]);
  });
  it("un período sin el dato no dibuja barra y lleva «—»", () => {
    const m = mesesDeEficiencia([eficienciaDePeriodo(NOV, [], GASTOS), octubre], NOMBRES);
    expect(m.barras[1]).toMatchObject({ valor: 0, cifra: "—", aria: "Noviembre: sin dato" });
  });
  it("sin planilla en ningún período grafica los materiales por prenda, y el título lo dice", () => {
    const sin = [NOV, OCT].map((v) => eficienciaDePeriodo({ ...v, planilla: null }, ORDENES, GASTOS));
    const m = mesesDeEficiencia(sin, NOMBRES);
    expect(m.titulo).toBe("Materiales por prenda, mes a mes");
    expect(m.barras.map((b) => b.cifra)).toEqual(["20.00", "20.00"]);
  });
});
