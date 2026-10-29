import { describe, expect, it } from "vitest";
import {
  cambiosPorRevisar,
  chipsClaure,
  chipsDisponible,
  disponibleReal,
  filasContadas,
  fraseClaure,
  leerFilaClaure,
  leerPagoClaure,
  montoSugeridoPago,
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
  it("cobrado − devuelto − comisión = lo que se le debe; el cambio no entra", () => {
    const r = resumenClaure(FILAS);
    expect(r.cobrado).toBe(267);
    expect(r.devuelto).toBe(168);
    expect(r.comision).toBe(1.4);
    expect(r.saldo).toBe(97.6);
    expect(r.cambios).toEqual({ n: 1, monto: 20 });
  });
  it("el IGV va incluido en lo cobrado menos lo devuelto", () => {
    expect(resumenClaure(FILAS).igv).toBe(15.1);
  });
  it("un cobro de tarjeta o QR sin tarifa no inventa comisión y se cuenta aparte", () => {
    expect(resumenClaure(FILAS).sinTarifa).toBe(1);
  });
  it("sin filas todo es cero", () => {
    expect(resumenClaure([])).toEqual({ cobrado: 0, devuelto: 0, comision: 0, sinTarifa: 0, pagado: 0, saldo: 0, igv: 0, cambios: { n: 0, monto: 0 } });
  });
  it("lo ya pagado baja el saldo (varios pagos, también parciales)", () => {
    const r = resumenClaure(FILAS, [pago(50), pago(20.5)]);
    expect(r.pagado).toBe(70.5);
    expect(r.saldo).toBe(27.1); // 97.60 − 70.50
    expect(r.cobrado).toBe(267); // lo cobrado no se toca: el pago no es una devolución
  });
  it("pagar de más deja el saldo negativo: queda a favor de CAYLA", () => {
    expect(resumenClaure(FILAS, [pago(100)]).saldo).toBe(-2.4);
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
  it("lo que se le debe de una fila resta su comisión; sin tarifa resta cero", () => {
    expect(seLeDebeDeFila(FILAS[3])).toBe(48.6);
    expect(seLeDebeDeFila(FILAS[2])).toBe(40);
    expect(seLeDebeDeFila(FILAS[1])).toBe(-168);
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
    expect(textos).toEqual(["Cobrado S/ 267.00", "Devuelto S/ 168.00", "Comisión del POS S/ 1.40", "1 cobro sin tarifa", "1 cambio por revisar"]);
  });
  it("lo pagado sale en verde, y pagar de más avisa en ámbar", () => {
    const aldia = chipsClaure(resumenClaure(FILAS, [pago(50)]), true);
    expect(aldia.find((c) => c.texto.startsWith("Ya pagado"))).toEqual({ texto: "Ya pagado S/\u00a050.00", tono: "verde" });
    const demas = chipsClaure(resumenClaure(FILAS, [pago(100)]), true).map((c) => c.texto);
    expect(demas).toContain("Se le pagó de más: queda a favor de CAYLA");
  });
  it("la pregunta dice lo que se le debe, o lo que CLAURE le debe a CAYLA si se le pagó de más (siempre en positivo)", () => {
    expect(respuestaClaure(97.6)).toEqual({ pregunta: "¿Cuánto le debes a CLAURE?", valor: 97.6 });
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
    expect(fraseClaure(null)).not.toContain("Se cuenta desde");
  });
});
