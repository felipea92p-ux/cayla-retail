import { describe, expect, it } from "vitest";
import {
  cambiosPorRevisar,
  chipsClaure,
  chipsDisponible,
  disponibleReal,
  filasContadas,
  fraseClaure,
  leerFilaClaure,
  leerGastoClaure,
  leerPagoClaure,
  leerVentasClaure,
  lineaImpuestosClaure,
  montoSugeridoPago,
  notaResultadosClaure,
  respuestaClaure,
  resumenClaure,
  seLeDebeDeFila,
  solesConSigno,
  textoMedioClaure,
  textoOrigenClaure,
  type FilaClaure,
  type PagoClaure,
} from "./cuenta-claure-reglas";

// Las mismas filas que arma `scripts/pruebas/claure_cuenta.mjs` contra Postgres: lo que la base devuelve, sumado aquí.
const fila = (r: Partial<FilaClaure>): FilaClaure => ({
  fecha: "2026-10-28",
  origen: "venta",
  medio: "yape",
  cuentaId: "c1",
  cuentaNombre: "Interbank",
  ubicacionId: "u1",
  nPagos: 1,
  monto: 0,
  igv: 0,
  comision: 0,
  contado: true,
  ...r,
});
const FILAS: FilaClaure[] = [
  fila({ origen: "cambio", monto: 20, igv: null, comision: null, contado: false }),
  fila({ origen: "devolucion", nPagos: 2, monto: -168, igv: -25.63 }),
  fila({ medio: "qr", cuentaNombre: null, monto: 40, igv: 6.1, comision: null }),
  fila({ medio: "tarjeta", cuentaNombre: "Por depositar Izipay", monto: 50, igv: 7.63, comision: 1.4 }),
  fila({ nPagos: 2, monto: 177, igv: 27 }),
];

const pago = (monto: number): PagoClaure => ({ id: `p${monto}`, fecha: "2026-10-29", cuentaId: "b1", cuentaNombre: "BCP Operativa", monto, referencia: "OP-12345", registradoPor: "Felipe Alvarez" });

describe("leerPagoClaure", () => {
  it("lee un pago con su banco, su n.º de operación y quién lo registró", () => {
    expect(leerPagoClaure({ id: "x", fecha: "2026-10-29", cuenta_id: "b1", cuenta_nombre: "BCP Operativa", monto: "100.00", referencia: "OP-12345", registrado_por: "Felipe Alvarez" })).toEqual({
      id: "x", fecha: "2026-10-29", cuentaId: "b1", cuentaNombre: "BCP Operativa", monto: 100, referencia: "OP-12345", registradoPor: "Felipe Alvarez",
    });
  });
  it("sin n.º de operación ni nombre, los deja nulos", () => {
    expect(leerPagoClaure({ id: "x", fecha: "2026-10-29", monto: 5 })).toMatchObject({ referencia: null, registradoPor: null, cuentaNombre: null });
  });
});

describe("leerFilaClaure", () => {
  it("lee los números que PostgREST manda como texto y respeta los nulos", () => {
    const f = leerFilaClaure({ fecha: "2026-10-28", origen: "venta", medio: "tarjeta", cuenta_id: "c", cuenta_nombre: "Por depositar Izipay", ubicacion_id: "u", n_pagos: 1, monto: "50.00", igv: "7.63", comision: null, contado: true });
    expect(f).toMatchObject({ monto: 50, igv: 7.63, comision: null, contado: true, cuentaNombre: "Por depositar Izipay" });
  });
  it("un origen raro se lee como venta y lo que no es verdadero no se cuenta", () => {
    expect(leerFilaClaure({ origen: "otro", contado: "t" }).origen).toBe("venta");
    expect(leerFilaClaure({ origen: "otro", contado: "t" }).contado).toBe(false);
  });
});

describe("resumenClaure", () => {
  it("cobrado − devuelto − IGV − comisión = lo que se le debe; el cambio no entra", () => {
    const r = resumenClaure(FILAS);
    expect(r.cobrado).toBe(267);
    expect(r.devuelto).toBe(168);
    expect(r.comision).toBe(1.4);
    // 267 − 168 − 15.10 (el IGV neto: lo declara y paga CAYLA) − 1.40 = 82.50
    expect(r.saldo).toBe(82.5);
    expect(r.cambios).toEqual({ n: 1, monto: 20 });
  });
  it("el IGV va incluido en lo cobrado menos lo devuelto, y se le descuenta", () => {
    expect(resumenClaure(FILAS).igv).toBe(15.1);
    const sinIgv = FILAS.map((f) => ({ ...f, igv: f.contado ? 0 : f.igv }));
    expect(resumenClaure(sinIgv).saldo).toBe(97.6);
    expect(resumenClaure(sinIgv).saldo - resumenClaure(FILAS).saldo).toBeCloseTo(15.1, 2);
  });
  it("una devolución resta su IGV: el IGV neto puede ser menor que el de las ventas", () => {
    const r = resumenClaure([fila({ monto: 118, igv: 18 }), fila({ origen: "devolucion", monto: -59, igv: -9 })]);
    expect(r.igv).toBe(9);
    expect(r.saldo).toBe(50);
  });
  it("un cobro de tarjeta o QR sin tarifa no inventa comisión y se cuenta aparte", () => {
    expect(resumenClaure(FILAS).sinTarifa).toBe(1);
  });
  it("sin filas todo es cero", () => {
    expect(resumenClaure([])).toEqual({ cobrado: 0, devuelto: 0, comision: 0, sinTarifa: 0, pagado: 0, gastos: 0, saldo: 0, igv: 0, cambios: { n: 0, monto: 0 } });
  });
  it("lo ya pagado baja el saldo (varios pagos, también parciales)", () => {
    const r = resumenClaure(FILAS, [pago(50), pago(20.5)]);
    expect(r.pagado).toBe(70.5);
    expect(r.saldo).toBe(12); // 82.50 − 70.50
    expect(r.cobrado).toBe(267); // lo cobrado no se toca: el pago no es una devolución
  });
  it("pagar de más deja el saldo negativo: queda a favor de CAYLA", () => {
    expect(resumenClaure(FILAS, [pago(100)]).saldo).toBe(-17.5);
  });
  it("los centavos no se arrastran como ruido de coma flotante", () => {
    const r = resumenClaure([fila({ monto: 0.1 }), fila({ monto: 0.2 })]);
    expect(r.cobrado).toBe(0.3);
  });
});

describe("el disponible real", () => {
  it("lo que hay se parte en lo de Claudia y lo disponible; sin deuda no hay nada que partir", () => {
    expect(disponibleReal(21500, 500)).toEqual({ deClaudia: 500, disponible: 21000 });
    expect(disponibleReal(21500, 0)).toBeNull();
    expect(disponibleReal(21500, -30)).toBeNull();
  });
  it("las chips lo dicen con sus palabras; el disponible va en rojo si se le debe más de lo que hay", () => {
    expect(chipsDisponible(1000, 291.69)).toEqual([
      { texto: "De eso, S/\u00a0291.69 es de Claudia", tono: "ambar" },
      { texto: "Disponible real S/\u00a0708.31", tono: "verde" },
    ]);
    expect(chipsDisponible(100, 291.69)[1]).toMatchObject({ tono: "rojo" });
    expect(chipsDisponible(1000, 0)).toEqual([]);
  });
});

describe("filas", () => {
  it("las contadas no traen el cambio; el cambio se lista aparte", () => {
    expect(filasContadas(FILAS)).toHaveLength(4);
    expect(cambiosPorRevisar(FILAS)).toHaveLength(1);
  });
  it("lo que se le debe de una fila resta su IGV y su comisión; sin tarifa resta cero de comisión; una devolución devuelve su IGV", () => {
    expect(seLeDebeDeFila(FILAS[3])).toBe(40.97);
    expect(seLeDebeDeFila(FILAS[2])).toBe(33.9);
    expect(seLeDebeDeFila(FILAS[1])).toBe(-142.37);
  });
});

describe("textos", () => {
  it("el medio y el origen se dicen en palabras de la tienda", () => {
    expect(textoMedioClaure("qr")).toBe("QR");
    expect(textoMedioClaure("raro")).toBe("raro");
    expect(textoOrigenClaure("devolucion")).toBe("Devolución");
  });
  it("un monto negativo lleva su signo y su S/ no se parte", () => {
    expect(solesConSigno(-168)).toBe("− S/ 168.00");
    expect(solesConSigno(50)).toBe("S/ 50.00");
  });
  it("las chips dicen de dónde sale la cifra y lo que pide atención", () => {
    const textos = chipsClaure(resumenClaure(FILAS), true).map((c) => c.texto);
    expect(textos).toEqual(["Cobrado S/ 267.00", "Devuelto S/ 168.00", "IGV S/ 15.10 (lo paga CAYLA)", "Comisión del POS S/ 1.40", "1 cobro sin tarifa", "1 cambio por revisar"]);
  });
  it("lo pagado sale en verde, y pagar de más avisa en ámbar", () => {
    const aldia = chipsClaure(resumenClaure(FILAS, [pago(50)]), true);
    expect(aldia.find((c) => c.texto.startsWith("Ya pagado"))).toEqual({ texto: "Ya pagado S/\u00a050.00", tono: "verde" });
    const demas = chipsClaure(resumenClaure(FILAS, [pago(100)]), true).map((c) => c.texto);
    expect(demas).toContain("Se le pagó de más: queda a favor de CAYLA");
  });
  it("la pregunta dice lo que se le debe, o lo que CLAURE le debe a CAYLA si se le pagó de más (siempre en positivo)", () => {
    expect(respuestaClaure(82.5)).toEqual({ pregunta: "¿Cuánto le debes a CLAURE?", valor: 82.5 });
    expect(respuestaClaure(0)).toEqual({ pregunta: "¿Cuánto le debes a CLAURE?", valor: 0 });
    expect(respuestaClaure(-2.4)).toEqual({ pregunta: "¿Cuánto te debe CLAURE?", valor: 2.4 });
  });
  it("«Pagar a CLAURE» arranca con todo lo que se le debe, y vacío si no se le debe nada", () => {
    expect(montoSugeridoPago(97.6)).toBe("97.60");
    expect(montoSugeridoPago(0)).toBe("");
    expect(montoSugeridoPago(-2.4)).toBe("");
  });
  it("sin filas, una sola chip que no asusta", () => {
    expect(chipsClaure(resumenClaure([]), false)).toEqual([{ texto: "Sin cobros todavía", tono: "pizarra" }]);
  });
  it("la frase dice desde cuándo se cuenta y que el efectivo no entra", () => {
    expect(fraseClaure("2026-10-23")).toContain("23/10/2026");
    expect(fraseClaure("2026-10-23")).toContain("El efectivo no entra");
    expect(fraseClaure("2026-10-23")).toContain("se le descuenta");
    expect(fraseClaure(null)).not.toContain("Se cuenta desde");
  });
});

// Lo que `scripts/pruebas/claure_fuera_de_las_cifras.mjs` comprueba en Postgres (118 con IGV, 18 de IGV, 100 sin IGV, 10 de costo): aquí, cómo se lee y se dice.
describe("lo vendido de CLAURE en un período (ADR-0560, actividad 5)", () => {
  const fila5 = { ventas: "118.00", igv: "18.00", base: "100.00", costo: "10.00" };

  it("la base devuelve una fila (o una lista de una fila): se lee con sus cuatro cifras", () => {
    expect(leerVentasClaure([fila5])).toEqual({ ventas: 118, igv: 18, base: 100, costo: 10 });
    expect(leerVentasClaure(fila5)).toEqual({ ventas: 118, igv: 18, base: 100, costo: 10 });
  });

  it("sin filas, sin ventas o con basura no hay nada que decir", () => {
    expect(leerVentasClaure(null)).toBeNull();
    expect(leerVentasClaure([])).toBeNull();
    expect(leerVentasClaure("x")).toBeNull();
    expect(leerVentasClaure([{ ventas: "0", igv: "0", base: "0", costo: "0" }])).toBeNull();
  });

  it("Impuestos: el IGV de SUNAT queda entero y se dice cuánto es de CLAURE", () => {
    const l = lineaImpuestosClaure(leerVentasClaure([fila5]));
    expect(l?.titulo).toBe("De ese IGV, S/\u00a018.00 es de ventas de CLAURE");
    expect(l?.texto).toContain("S/\u00a0118.00 con IGV, de sus ventas");
    expect(l?.texto).toContain("RUC de CAYLA");
  });

  it("Impuestos: sin IGV de CLAURE en el mes (o con un neto negativo) la línea no se dibuja", () => {
    expect(lineaImpuestosClaure(null)).toBeNull();
    expect(lineaImpuestosClaure({ ventas: 100, igv: 0, base: 100, costo: 0 })).toBeNull();
    expect(lineaImpuestosClaure({ ventas: -118, igv: -18, base: -100, costo: -10 })).toBeNull();
  });

  it("Estado de resultados: la nota dice cuánto NO se incluyó, sin IGV", () => {
    const n = notaResultadosClaure(leerVentasClaure([fila5]));
    expect(n).toContain("No incluye lo vendido de CLAURE (S/\u00a0100.00 sin IGV)");
    expect(n).toContain("Cuentas y dinero ▸ CLAURE");
    expect(notaResultadosClaure(null)).toBeNull();
    expect(notaResultadosClaure({ ventas: 0, igv: 0, base: 0, costo: 5 })).toBeNull();
  });
});

// Lo mismo que comprueba `scripts/pruebas/claure_gastos_por_empresa.mjs` contra Postgres: la parte de CLAURE de cada gasto baja lo que se le debe.
describe("los gastos de CLAURE que pagó CAYLA (ADR-0560, actividad 8)", () => {
  const crudo = [
    { gasto_id: "g1", fecha: "2026-10-28", ubicacion_id: "lim", categoria: "alquileres", categoria_nombre: "Alquileres", descripcion: "Alquiler de octubre", monto_total: "1180.00", pct: "50.00", parte: "590.00" },
    { gasto_id: "g2", fecha: "2026-10-28", ubicacion_id: "lim", categoria: "limpieza", categoria_nombre: "Limpieza", descripcion: "Lejía", monto_total: "118.00", pct: "100.00", parte: "118.00" },
  ].map(leerGastoClaure);

  it("lee lo que devuelve la base", () => {
    expect(crudo[0]).toEqual({
      gastoId: "g1",
      fecha: "2026-10-28",
      ubicacionId: "lim",
      categoria: "alquileres",
      categoriaNombre: "Alquileres",
      descripcion: "Alquiler de octubre",
      montoTotal: 1180,
      pct: 50,
      parte: 590,
    });
  });

  it("su parte baja el saldo, y se dice aparte (sin gastos, el saldo es el de siempre)", () => {
    const sin = resumenClaure(FILAS);
    const con = resumenClaure(FILAS, [], crudo);
    expect(con.gastos).toBe(708);
    expect(con.saldo).toBe(Math.round((sin.saldo - 708) * 100) / 100);
    expect(sin.gastos).toBe(0);
  });

  it("un chip dice cuánto es de gastos suyos; sin gastos no hay chip", () => {
    expect(chipsClaure(resumenClaure(FILAS, [], crudo), true).some((c) => c.texto.startsWith("Gastos suyos que pagó CAYLA"))).toBe(true);
    expect(chipsClaure(resumenClaure(FILAS), true).some((c) => c.texto.includes("Gastos suyos"))).toBe(false);
  });
});
