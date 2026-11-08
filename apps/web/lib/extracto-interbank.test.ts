import { describe, expect, it } from "vitest";
import { centimosDe, leerExtracto, resumenExtracto, solesDeCentimos, tipoDeLinea } from "./extracto-interbank";

// Un renglón del .txt de Interbank armado con las mismas columnas que el archivo real (montos inventados: el repo es público).
function renglonTxt(o: { descripcion: string; cargo?: string; abono?: string; saldo: string; fecha: string; proceso?: string; correlativo?: string }): string {
  const fila = Array.from({ length: 183 }, () => " ");
  const poner = (desde: number, texto: string) => [...texto].forEach((c, i) => (fila[desde + i] = c));
  const alDerecha = (fin: number, texto: string) => poner(fin - texto.length, texto);
  poner(12, "01020160000003004839999");
  poner(35, o.descripcion.padEnd(28).slice(0, 28));
  poner(63, "1402");
  poner(68, "-");
  poner(84, "0987");
  if (o.cargo) alDerecha(105, o.cargo);
  if (o.abono) alDerecha(122, o.abono);
  alDerecha(139, o.saldo);
  poner(156, `${o.fecha}${o.proceso ?? o.fecha}${o.correlativo ?? "00263060001"}`);
  return fila.join("");
}

// De la más nueva a la más vieja, como lo baja el banco.
const TXT = [
  renglonTxt({ descripcion: "ITF OPERACION: 1234567", cargo: "0.10", saldo: "1100.00", fecha: "20261107" }),
  renglonTxt({ descripcion: "CARGO TRANSFERENCIA PROPIA", cargo: "2000.00", saldo: "1100.10", fecha: "20261107" }),
  renglonTxt({ descripcion: "PAGO ESTABLECIMENTOS VISA", abono: "963.10", saldo: "3100.10", fecha: "20261107" }),
  renglonTxt({ descripcion: "PAGO IZIPAY 005800001", abono: "44.61", saldo: "2137.00", fecha: "20261106" }),
  renglonTxt({ descripcion: ". Abono QR IBK", abono: "139.80", saldo: "2092.39", fecha: "20261106" }),
  renglonTxt({ descripcion: ". Abono QR IBK", abono: "45.90", saldo: "1952.59", fecha: "20261106" }),
].join("\n");

describe("centimosDe", () => {
  it("lee montos con miles, signo y el prefijo de soles, siempre en céntimos enteros", () => {
    expect(centimosDe("1,803.60")).toBe(180360);
    expect(centimosDe("S/ 2,793.69")).toBe(279369);
    expect(centimosDe("S/-0.05")).toBe(-5);
    expect(centimosDe("0.30")).toBe(30);
  });
  it("no adivina un monto mal copiado", () => {
    expect(centimosDe("45.9")).toBeNull();
    expect(centimosDe("1.803,60")).toBeNull();
    expect(centimosDe("")).toBeNull();
    expect(centimosDe("12,34.00")).toBeNull();
    expect(centimosDe("1 803.60")).toBeNull(); // un blanco adentro no se borra: es un monto mal copiado
  });
  it("una suma de cientos de pagos en céntimos no se corre (en coma flotante sí)", () => {
    const pagos = Array.from({ length: 300 }, () => "0.10");
    expect(pagos.reduce((s, p) => s + (centimosDe(p) ?? 0), 0)).toBe(3000);
    expect(pagos.reduce((s) => s + 0.1, 0)).not.toBe(30);
  });
});

describe("tipoDeLinea", () => {
  it("reconoce cada máquina como la escribe el banco, en el .txt y en la web", () => {
    expect(tipoDeLinea(". Abono QR IBK").tipo).toBe("qr_izipay");
    expect(tipoDeLinea("Abono QR IBK").tipo).toBe("qr_izipay");
    expect(tipoDeLinea("PAGO IZIPAY 005800001")).toEqual({ tipo: "lote_izipay", codigoComercio: "005800001" });
    expect(tipoDeLinea("PAGO ESTABLECIMENTOS VISA").tipo).toBe("lote_vendemas");
    expect(tipoDeLinea("PAGO ESTABLECIMIENTOS VISA WEB").tipo).toBe("lote_vendemas");
  });
  it("lo demás no se toma por una máquina", () => {
    expect(tipoDeLinea("CARGO TRANSFERENCIA ALGUIEN").tipo).toBe("otro");
    expect(tipoDeLinea("ITF OPERACION: 1234567").tipo).toBe("otro");
    expect(tipoDeLinea("ABONO TRANSFERENCIA").tipo).toBe("otro");
  });
});

describe("leerExtracto — el .txt de la banca", () => {
  const e = leerExtracto(TXT);
  it("vuelve de la más vieja a la más nueva, con fecha, signo y tipo", () => {
    expect(e.lineas.map((l) => l.centimos)).toEqual([4590, 13980, 4461, 96310, -200000, -10]);
    expect(e.lineas.map((l) => l.orden)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(e.lineas.map((l) => l.tipo)).toEqual(["qr_izipay", "qr_izipay", "lote_izipay", "lote_vendemas", "otro", "otro"]);
    expect(e.lineas[2].codigoComercio).toBe("005800001");
    expect(e.desde).toBe("2026-11-06");
    expect(e.hasta).toBe("2026-11-07");
    expect(e.ignoradas).toBe(0);
  });
  it("con la cadena de saldos completa no hay huecos", () => {
    expect(e.huecos).toEqual([]);
  });
  it("si falta una línea, la cadena de saldos lo dice y cuánto falta", () => {
    const sinUna = TXT.split("\n").filter((_, i) => i !== 4).join("\n"); // se quita el QR de 139.80
    const h = leerExtracto(sinUna).huecos;
    expect(h).toHaveLength(1);
    expect(h[0].faltan).toBe(13980);
    expect(h[0].enElBorde).toBe(true); // el 6-nov es el primer día de este extracto
  });
  it("el orden real es el del banco (proceso y correlativo), no el del archivo", () => {
    // Un sábado procesado el lunes sale en el archivo mezclado: aquí, el pago más viejo viene al medio.
    const mezclado = [
      renglonTxt({ descripcion: ". Abono QR IBK", abono: "20.00", saldo: "130.00", fecha: "20261031", proceso: "20261102", correlativo: "00000000003" }),
      renglonTxt({ descripcion: ". Abono QR IBK", abono: "100.00", saldo: "100.00", fecha: "20261031", proceso: "20261102", correlativo: "00000000001" }),
      renglonTxt({ descripcion: ". Abono QR IBK", abono: "10.00", saldo: "110.00", fecha: "20261031", proceso: "20261102", correlativo: "00000000002" }),
    ].join("\n");
    const e = leerExtracto(mezclado);
    expect(e.lineas.map((l) => l.centimos)).toEqual([10000, 1000, 2000]);
    expect(e.huecos).toEqual([]);
  });
  it("un renglón que no es de la tabla se cuenta, no se adivina", () => {
    expect(leerExtracto(`Movimientos de la cuenta\n${TXT}`).ignoradas).toBe(1);
  });
});

describe("leerExtracto — la tabla copiada de la web", () => {
  const WEB = [
    "Fecha de operación\tFecha de proceso\tNro. de operación\tMovimiento\tDescripción\tCanal\tImporte\tSaldo contable",
    "07/11/2026\t09/11/2026\t8009341\tPAGO ESTABLECIMIENTOS\tVISA\tWEB\tS/ 963.10\tS/ 1,549.29",
    "07/11/2026\t09/11/2026\t0749596\tCARGO TRANSFERENCIA\tALGUIEN\tWEB\tS/ -630.00\tS/ 586.19",
    "06/11/2026\t06/11/2026\t-\t.\tAbono QR IBK\t\tS/ 49.90\tS/ 1,216.19",
  ].join("\n");
  const e = leerExtracto(WEB);
  it("lee fecha, monto con signo, saldo y tipo; la cabecera no cuenta como línea", () => {
    expect(e.ignoradas).toBe(1);
    expect(e.lineas.map((l) => [l.fecha, l.centimos, l.saldoCentimos, l.tipo])).toEqual([
      ["2026-11-06", 4990, 121619, "qr_izipay"],
      ["2026-11-07", -63000, 58619, "otro"],
      ["2026-11-07", 96310, 154929, "lote_vendemas"],
    ]);
  });
  it("la cadena de saldos también se revisa en la tabla copiada", () => {
    expect(e.huecos.map((h) => h.faltan)).toEqual([]);
  });
});

describe("resumenExtracto y solesDeCentimos", () => {
  it("cuenta y suma por tipo, en el orden en que se emparejan", () => {
    const r = resumenExtracto(leerExtracto(TXT).lineas);
    expect(r.map((x) => [x.tipo, x.cuantas, x.centimos])).toEqual([
      ["qr_izipay", 2, 18570],
      ["lote_izipay", 1, 4461],
      ["lote_vendemas", 1, 96310],
      ["otro", 2, -200010],
    ]);
  });
  it("escribe soles sin pasar por la coma flotante", () => {
    expect(solesDeCentimos(180360)).toBe("S/\u00a01,803.60");
    expect(solesDeCentimos(-10)).toBe("−S/\u00a00.10");
    expect(solesDeCentimos(0)).toBe("S/\u00a00.00");
  });
});
