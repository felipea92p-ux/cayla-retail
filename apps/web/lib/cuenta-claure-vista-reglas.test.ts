import { describe, expect, it } from "vitest";
import { resumenClaure, type FilaClaure, type GastoClaure, type PagoClaure } from "./cuenta-claure-reglas";
import {
  agruparPorDia,
  avisosClaure,
  contarLibro,
  delPeriodo,
  etiquetaPeriodo,
  filtrarLibro,
  hayPeriodoSiguiente,
  libroClaure,
  lunesDe,
  moverPeriodo,
  paginarClaure,
  porRevisar,
  rangoDelPeriodo,
  repartoPorCuenta,
  repartoPorMedio,
  semanasClaure,
  terminosClaure,
} from "./cuenta-claure-vista-reglas";

const fila = (c: Partial<FilaClaure>): FilaClaure => ({ fecha: "2026-10-27", origen: "venta", medio: "yape", cuentaId: "c1", cuentaNombre: "BCP Empresa", ubicacionId: "u1", nPagos: 1, monto: 118, igv: 18, comision: 0, contado: true, ...c });
const pago = (c: Partial<PagoClaure>): PagoClaure => ({ id: "p1", fecha: "2026-10-28", cuentaId: "c1", cuentaNombre: "BCP Empresa", monto: 50, referencia: "7731", registradoPor: "Felipe", ...c });
const gasto = (c: Partial<GastoClaure>): GastoClaure => ({ gastoId: "g1", fecha: "2026-10-29", ubicacionId: "u1", categoria: "luz", categoriaNombre: "Luz", descripcion: "Luz de octubre", montoTotal: 200, pct: 50, parte: 100, ...c });

const FILAS = [
  fila({ fecha: "2026-10-26", monto: 236, igv: 36, nPagos: 2 }),
  fila({ fecha: "2026-10-27", medio: "tarjeta", cuentaNombre: "Por depositar Izipay", monto: 590, igv: 90, comision: 17.7 }),
  fila({ fecha: "2026-10-27", origen: "devolucion", medio: "tarjeta", cuentaNombre: "Por depositar Izipay", monto: -118, igv: -18, comision: 0 }),
  fila({ fecha: "2026-10-28", medio: "qr", cuentaId: null, cuentaNombre: null, monto: 100, igv: 15.25, comision: null }),
  fila({ fecha: "2026-10-23", origen: "cambio", medio: "cambio", cuentaNombre: null, cuentaId: null, monto: 45, igv: null, comision: null, contado: false }),
];
const PAGOS = [pago({ id: "p1", fecha: "2026-10-28", monto: 150 }), pago({ id: "p2", fecha: "2026-10-20", monto: 40 })];
const GASTOS = [gasto({})];

describe("libroClaure", () => {
  const libro = libroClaure(FILAS, PAGOS, GASTOS);
  it("termina en el mismo saldo que resumenClaure (el libro no inventa plata)", () => {
    expect(libro[0].saldo).toBe(resumenClaure(FILAS, PAGOS, GASTOS).saldo);
  });
  it("va del más nuevo al más viejo y el saldo corre desde cero", () => {
    expect(libro.map((m) => m.fecha)).toEqual([...libro.map((m) => m.fecha)].sort().reverse());
    const ultimo = libro[libro.length - 1];
    expect(ultimo.saldo).toBe(ultimo.efecto);
  });
  it("no lista el cambio por revisar (no entra al saldo)", () => {
    expect(libro.some((m) => m.fecha === "2026-10-23")).toBe(false);
  });
  it("una devolución baja lo que se le debe y se cuenta como devolución", () => {
    const d = libro.find((m) => m.tipo === "dev")!;
    expect(d.efecto).toBeLessThan(0);
    expect(d.titulo).toBe("Devolución · Tarjeta");
  });
  it("filtra y cuenta por tipo", () => {
    expect(filtrarLibro(libro, "pago")).toHaveLength(2);
    expect(contarLibro(libro, "todo")).toBe(libro.length);
    expect(contarLibro(libro, "gasto")).toBe(1);
  });
  it("en un mismo día, el cobro va antes que lo que se descuenta", () => {
    const l = libroClaure([fila({ fecha: "2026-10-28" })], [pago({ fecha: "2026-10-28", monto: 10 })], []);
    expect(l.map((m) => m.tipo)).toEqual(["pago", "cobro"]);
  });
  it("sin nada, está vacío", () => {
    expect(libroClaure([], [], [])).toEqual([]);
  });
});

describe("períodos del historial", () => {
  it("la semana va de lunes a domingo", () => {
    expect(lunesDe("2026-10-30")).toBe("2026-10-26");
    expect(rangoDelPeriodo("semana", "2026-10-30")).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" });
  });
  it("el mes va del 1 al último día", () => {
    expect(rangoDelPeriodo("mes", "2026-02-10")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });
  it("las etiquetas se leen en español", () => {
    expect(etiquetaPeriodo("mes", "2026-10-30")).toBe("octubre 2026");
    expect(etiquetaPeriodo("dia", "2026-10-30")).toBe("viernes 30 de octubre de 2026");
    expect(etiquetaPeriodo("todo", "2026-10-30")).toBe("Todo el historial");
  });
  it("nunca pasa de hoy y retrocede de mes en mes", () => {
    expect(moverPeriodo("mes", "2026-10-30", 1, "2026-10-30")).toBe("2026-10-30");
    expect(moverPeriodo("mes", "2026-10-30", -1, "2026-10-30")).toBe("2026-09-01");
    expect(moverPeriodo("dia", "2026-10-30", -1, "2026-10-30")).toBe("2026-10-29");
    expect(moverPeriodo("semana", "2026-10-30", -1, "2026-10-30")).toBe("2026-10-23");
  });
  it("el período que contiene a hoy es el último", () => {
    expect(hayPeriodoSiguiente("mes", "2026-10-30", "2026-10-30")).toBe(false);
    expect(hayPeriodoSiguiente("mes", "2026-09-10", "2026-10-30")).toBe(true);
    expect(hayPeriodoSiguiente("todo", "2026-09-10", "2026-10-30")).toBe(false);
  });
  it("agrupa por día con su neto del día completo, aunque la página traiga solo parte", () => {
    const libro = libroClaure(FILAS, PAGOS, GASTOS);
    const delMes = delPeriodo(libro, "mes", "2026-10-30");
    const dias = agruparPorDia(delMes.slice(0, 2), delMes);
    expect(dias.length).toBeGreaterThan(0);
    for (const d of dias) expect(d.neto).toBe(Math.round(delMes.filter((m) => m.fecha === d.fecha).reduce((a, m) => a + m.efecto, 0) * 100) / 100);
  });
});

describe("paginarClaure", () => {
  const lista = Array.from({ length: 73 }, (_, i) => i);
  it("parte en páginas de 30", () => {
    const p = paginarClaure(lista, 3, 30);
    expect([p.desde, p.hasta, p.total, p.totalPaginas, p.visibles.length]).toEqual([61, 73, 73, 3, 13]);
  });
  it("acomoda una página que se pasó y una lista vacía", () => {
    expect(paginarClaure(lista, 99, 40).pagina).toBe(2);
    expect(paginarClaure([], 1, 30)).toMatchObject({ desde: 0, hasta: 0, totalPaginas: 1 });
  });
});

describe("por dónde entra", () => {
  it("reparte por medio sin contar devoluciones ni cambios, de mayor a menor", () => {
    const r = repartoPorMedio(FILAS);
    expect(r.map((m) => m.medio)).toEqual(["tarjeta", "yape", "qr"]);
    expect(r.reduce((a, m) => a + m.pct, 0)).toBeCloseTo(100);
    expect(r[0].paraClaudia).toBe(Math.round((590 - 17.7 - 90) * 100) / 100);
    expect(r[0].color).toBe("var(--color-metodo-tarjeta)");
  });
  it("un medio sin color propio cae al taupe, no se rompe", () => {
    expect(repartoPorMedio([fila({ medio: "otro" })])[0].color).toBe("var(--color-taupe)");
  });
  it("reparte por cuenta y marca la que falta asignar", () => {
    const r = repartoPorCuenta(FILAS);
    expect(r[0]).toMatchObject({ nombre: "Por depositar Izipay", pct: 100 });
    expect(r.find((c) => c.sinCuenta)).toMatchObject({ nombre: "Sin cuenta asignada", monto: 100 });
  });
  it("agrupa por semana (lunes) lo cobrado y lo pagado, y se queda con las últimas", () => {
    const s = semanasClaure(FILAS, PAGOS);
    expect(s.map((x) => x.lunes)).toEqual(["2026-10-19", "2026-10-26"]);
    expect(s[1]).toMatchObject({ cobrado: 926, pagado: 150 });
    const lunes = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
    const muchas = lunes.map((fecha) => fila({ fecha }));
    expect(semanasClaure(muchas, [], 6)).toHaveLength(6);
  });
});

describe("avisosClaure", () => {
  const r = resumenClaure(FILAS, PAGOS, GASTOS);
  it("dice lo que hay que revisar, con a dónde ir", () => {
    const a = avisosClaure(FILAS, PAGOS, r, "2026-10-30", true);
    expect(a.map((x) => x.clave)).toEqual(["cambios", "sin-tarifa", "sin-cuenta"]);
    expect(a[0].accion).toEqual({ texto: "Ver el cambio", href: "/cambios" });
    expect(porRevisar(a)).toBe(3);
  });
  it("avisa que hace días no se le paga solo a quien puede pagar y si se le debe algo", () => {
    const tarde = avisosClaure(FILAS, PAGOS, r, "2026-11-10", true).find((x) => x.clave === "sin-pago");
    expect(tarde?.titulo).toBe("Hace 13 días que no se le paga");
    expect(avisosClaure(FILAS, PAGOS, r, "2026-11-10", false).some((x) => x.clave === "sin-pago")).toBe(false);
    expect(avisosClaure(FILAS, [], r, "2026-11-10", true).some((x) => x.clave === "sin-pago")).toBe(false);
    expect(porRevisar(avisosClaure(FILAS, PAGOS, r, "2026-11-10", true))).toBe(3);
  });
  it("sin nada raro no avisa nada", () => {
    const ok = [fila({})];
    expect(avisosClaure(ok, [], resumenClaure(ok), "2026-10-30", true)).toEqual([]);
  });
  it("singular y plural", () => {
    const a = avisosClaure([fila({ comision: null }), fila({ comision: null, medio: "qr" })], [], resumenClaure([fila({ comision: null }), fila({ comision: null })]), "2026-10-30", true);
    expect(a[0].titulo).toBe("2 cobros con tarjeta sin tarifa");
  });
});

describe("terminosClaure", () => {
  it("cada término abre su filtro del historial", () => {
    const t = terminosClaure(resumenClaure(FILAS, PAGOS, GASTOS), 3, 1, 2);
    expect(t.map((x) => [x.clave, x.filtro])).toEqual([
      ["cobrado", "cobro"],
      ["devuelto", "dev"],
      ["igv", "cobro"],
      ["comision", "cobro"],
      ["gastos", "gasto"],
      ["pagado", "pago"],
    ]);
    expect(t[4].detalle).toBe("1 gasto");
  });
});
