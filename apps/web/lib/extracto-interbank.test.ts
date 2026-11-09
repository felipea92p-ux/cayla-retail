import { describe, expect, it } from "vitest";
import { centimosDe, leerExtracto, resumenExtracto, solesDeCentimos, tipoDeLinea, type LineaExtracto } from "./extracto-interbank";

// Un renglón del .txt de Interbank armado con las mismas columnas que el archivo real (montos inventados: el repo es público).
// El código de movimiento va en 63–67 y el número de operación, pegado a la derecha, en 68–75 («-» si la línea no lo tiene).
function renglonTxt(o: {
  descripcion: string;
  cargo?: string;
  abono?: string;
  saldo: string;
  fecha: string;
  proceso?: string;
  correlativo?: string;
  codigo?: string;
  operacion?: string;
}): string {
  const fila = Array.from({ length: 183 }, () => " ");
  const poner = (desde: number, texto: string) => [...texto].forEach((c, i) => (fila[desde + i] = c));
  const alDerecha = (fin: number, texto: string) => poner(fin - texto.length, texto);
  poner(12, "01020160000003004839999");
  poner(35, o.descripcion.padEnd(28).slice(0, 28));
  poner(63, o.codigo ?? "1402");
  alDerecha(75, o.operacion ?? "-");
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
    // Un sábado procesado el lunes sale en el archivo mezclado: aquí, el pago más viejo viene al medio. Los correlativos son definitivos
    // (no empiezan con 0000) y no hay saldos: lo único que puede ordenarlas es (proceso, correlativo), no la cadena de saldos.
    const mezclado = [
      renglonTxt({ descripcion: ". Abono QR IBK", abono: "20.00", saldo: "", fecha: "20261031", proceso: "20261102", correlativo: "00263060003" }),
      renglonTxt({ descripcion: ". Abono QR IBK", abono: "100.00", saldo: "", fecha: "20261031", proceso: "20261102", correlativo: "00263060001" }),
      renglonTxt({ descripcion: ". Abono QR IBK", abono: "10.00", saldo: "", fecha: "20261031", proceso: "20261102", correlativo: "00263060002" }),
    ].join("\n");
    const e = leerExtracto(mezclado);
    expect(e.lineas.map((l) => l.centimos)).toEqual([10000, 1000, 2000]);
    expect(e.lineas.every((l) => l.firme && l.saldoCentimos === null)).toBe(true);
    expect(e.huecos).toEqual([]);
  });
  it("un renglón que no es de la tabla se cuenta, no se adivina", () => {
    expect(leerExtracto(`Movimientos de la cuenta\n${TXT}`).ignoradas).toBe(1);
  });
});

// ---- Lo que el banco todavía no procesó ------------------------------------------------------------------------------------------
// Un extracto sintético con la forma del caso real (montos inventados). `pasaron` va en el orden en que de verdad pasó cada movimiento y
// el saldo se va sumando, como lo hace el banco; `comoBaja` dice en qué orden los trae el archivo.
type Mov = { descripcion: string; centimos: number; fecha: string; proceso: string; correlativo: string; codigo?: string; operacion?: string };
const cifra = (c: number) => `${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
function archivoDe(saldoInicial: number, pasaron: Mov[], comoBaja: number[]) {
  let saldo = saldoInicial;
  const filas = pasaron.map((m) => ({ ...m, saldoCentimos: (saldo += m.centimos) }));
  const enArchivo = comoBaja.map((i) => filas[i]);
  const texto = enArchivo
    .map((f) => renglonTxt({ ...f, [f.centimos < 0 ? "cargo" : "abono"]: cifra(f.centimos), saldo: cifra(f.saldoCentimos) }))
    .join("\n");
  return { texto, enArchivo };
}
/** Cuánto falta en cada punto donde la cadena de saldos se rompe, para un orden dado. */
const huecosDe = (ls: readonly { centimos: number; saldoCentimos: number | null }[]) =>
  ls.slice(1).map((l, i) => (l.saldoCentimos ?? 0) - ((ls[i].saldoCentimos ?? 0) + l.centimos)).filter((f) => f !== 0);
/** EL ORDEN DE ANTES, tal como lo hacía el lector: (proceso + correlativo) a secas, sin distinguir firmes de provisionales. */
const ordenDeAntes = (ls: readonly LineaExtracto[]) =>
  [...ls].sort((a, b) => (`${a.fechaProceso}${a.correlativo}` < `${b.fechaProceso}${b.correlativo}` ? -1 : 1));

const QR = ". Abono QR IBK";
// Lunes 2-nov (día 306 del año): el banco procesa junto el sábado 31-oct y el domingo 1-nov. Martes 3-nov: día 307.
const FIRMES: Mov[] = [
  { descripcion: QR, centimos: 4000, fecha: "20261031", proceso: "20261102", correlativo: "00263060001" },
  { descripcion: QR, centimos: 2550, fecha: "20261101", proceso: "20261102", correlativo: "00263060002" },
  { descripcion: "PAGO ESTABLECIMENTOS VISA", centimos: 31020, fecha: "20261031", proceso: "20261102", correlativo: "00263060003", codigo: "4225", operacion: "7000011" },
  { descripcion: QR, centimos: 1800, fecha: "20261101", proceso: "20261102", correlativo: "00263060004" },
  { descripcion: "CARGO TRANSFERENCIA PROPIA", centimos: -20000, fecha: "20261103", proceso: "20261103", correlativo: "00263070001", codigo: "6362", operacion: "0123456" },
  { descripcion: "ITF OPERACION: 0123456", centimos: -5, fecha: "20261103", proceso: "20261103", correlativo: "00263070002", codigo: "0311" },
  { descripcion: "PAGO IZIPAY 005800001", centimos: 7730, fecha: "20261103", proceso: "20261103", correlativo: "00263070003", codigo: "4434", operacion: "7000015" },
];
// Fin de semana del 7 al 9-nov, bajado el lunes 9 antes de que el banco lo procese: proceso = el día de la descarga y correlativo
// provisional. El lote que por saldo va PRIMERO recibió un correlativo mayor (…0004) que los pagos que le siguen.
const PROVISIONALES: Mov[] = [
  { descripcion: "PAGO ESTABLECIMENTOS VISA", centimos: 52040, fecha: "20261107", proceso: "20261109", correlativo: "00000090004", codigo: "4225", operacion: "7000022" },
  { descripcion: QR, centimos: 3590, fecha: "20261107", proceso: "20261109", correlativo: "00000090000" },
  { descripcion: "CARGO TRANSFERENCIA PROPIA", centimos: -30000, fecha: "20261107", proceso: "20261109", correlativo: "00000090001", codigo: "6362", operacion: "0654321" },
  { descripcion: QR, centimos: 1200, fecha: "20261108", proceso: "20261109", correlativo: "00000090002" },
  { descripcion: QR, centimos: 6450, fecha: "20261108", proceso: "20261109", correlativo: "00000090003" },
  { descripcion: QR, centimos: 990, fecha: "20261109", proceso: "20261109", correlativo: "00000090005" },
];
const PASARON = [...FIRMES, ...PROVISIONALES];
// Como lo baja el banco: lo provisional arriba, de lo más nuevo a lo más viejo; debajo lo firme, con el sábado y el domingo mezclados.
const COMO_BAJA = [12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 3, 0, 1];

describe("leerExtracto — lo que el banco todavía no procesó (correlativo provisional)", () => {
  const { texto, enArchivo } = archivoDe(50000, PASARON, COMO_BAJA);
  const e = leerExtracto(texto);

  it("CONTROL: con el orden de antes (proceso y correlativo a secas) este mismo extracto deja huecos falsos", () => {
    const antes = ordenDeAntes(e.lineas);
    // El lote de 520.40 queda después de los pagos que le siguen: falta antes, sobra dos veces después. Los tres suman cero: no falta nada.
    expect(huecosDe(antes)).toEqual([52040, -33280, -18760]);
    expect(huecosDe(antes).reduce((s, f) => s + f, 0)).toBe(0);
    // Y el orden de antes NO es el del lector de hoy: si alguien devuelve el lector al orden viejo, esta prueba y la de abajo se ponen en rojo.
    expect(antes.map((l) => l.correlativo)).not.toEqual(e.lineas.map((l) => l.correlativo));
  });
  it("CONTROL: el archivo leído al revés tampoco sirve para lo firme (el sábado sale mezclado con el domingo)", () => {
    expect(huecosDe([...enArchivo].reverse()).length).toBeGreaterThan(0);
  });
  it("lo firme va por (proceso, correlativo) y lo provisional al final, al revés del archivo: la cadena cierra sin huecos", () => {
    expect(e.lineas.map((l) => l.centimos)).toEqual(PASARON.map((m) => m.centimos));
    expect(e.lineas.map((l) => l.orden)).toEqual(PASARON.map((_, i) => i));
    expect(huecosDe(e.lineas)).toEqual([]);
    expect(e.huecos).toEqual([]);
    expect(e.ignoradas).toBe(0);
    // El saldo del banco es el de la última línea de la cadena, provisionales incluidas.
    expect(e.lineas[e.lineas.length - 1].saldoCentimos).toBe(111365);
    expect([e.desde, e.hasta]).toEqual(["2026-10-31", "2026-11-09"]);
  });
  it("firme es solo la que el banco ya procesó: su correlativo no empieza con 0000", () => {
    expect(e.lineas.map((l) => l.firme)).toEqual([...FIRMES.map(() => true), ...PROVISIONALES.map(() => false)]);
    expect(e.lineas.filter((l) => !l.firme).every((l) => l.correlativo?.startsWith("0000") && l.fechaProceso === "2026-11-09")).toBe(true);
  });
  it("cada línea trae lo que el banco da para reconocerla: proceso, correlativo, código y operación", () => {
    const de = (l: LineaExtracto) => [l.fecha, l.fechaProceso, l.correlativo, l.codigo, l.operacion];
    expect(de(e.lineas[0])).toEqual(["2026-10-31", "2026-11-02", "00263060001", "1402", null]); // un QR no trae operación: el banco pone «-»
    expect(de(e.lineas[2])).toEqual(["2026-10-31", "2026-11-02", "00263060003", "4225", "7000011"]);
    expect(de(e.lineas[4])).toEqual(["2026-11-03", "2026-11-03", "00263070001", "6362", "0123456"]); // el cero de adelante se conserva
    expect(de(e.lineas[5])).toEqual(["2026-11-03", "2026-11-03", "00263070002", "0311", null]);
    expect(de(e.lineas[7])).toEqual(["2026-11-07", "2026-11-09", "00000090004", "4225", "7000022"]);
    // (proceso, correlativo) es único: con eso se reconoce la misma línea firme en otra descarga.
    expect(new Set(e.lineas.map((l) => `${l.fechaProceso}:${l.correlativo}`)).size).toBe(e.lineas.length);
  });
  it("si faltan el código, el proceso o el correlativo, van nulos y la línea no es firme", () => {
    const fila = [...renglonTxt({ descripcion: QR, abono: "10.00", saldo: "10.00", fecha: "20261107" })];
    for (let i = 63; i < 75; i++) fila[i] = " ";
    for (let i = 164; i < 183; i++) fila[i] = " ";
    const [l] = leerExtracto(fila.join("")).lineas;
    expect([l.fechaProceso, l.correlativo, l.codigo, l.operacion, l.firme]).toEqual([null, null, null, null, false]);
    expect(l.centimos).toBe(1000);
  });
});

describe("leerExtracto — reparar el bloque provisional siguiendo la cadena de saldos", () => {
  const ULTIMA_FIRME = FIRMES.length - 1;
  const provisional = (k: number) => FIRMES.length + k;

  it("si el archivo trae lo provisional desordenado, se rearma siguiendo la cadena desde la última firme", () => {
    // Lo firme en su orden; lo provisional revuelto (ni el archivo al revés ni el correlativo dan el orden real).
    const baja = [provisional(3), provisional(5), provisional(0), provisional(4), provisional(1), provisional(2), 6, 5, 4, 3, 2, 1, 0];
    const { texto, enArchivo } = archivoDe(50000, PASARON, baja);
    expect(huecosDe([...enArchivo].reverse()).length).toBeGreaterThan(0); // CONTROL: sin reparar, el archivo al revés deja huecos
    const e = leerExtracto(texto);
    expect(e.lineas.map((l) => l.centimos)).toEqual(PASARON.map((m) => m.centimos));
    expect(e.huecos).toEqual([]);
  });
  it("dos líneas que parten del mismo saldo: el rodeo se intercala y la cadena usa todas", () => {
    // +10.00, −10.00 y +20.00: la primera y la tercera parten del mismo saldo. Tomar primero la de +20.00 dejaría dos sin lugar.
    const ida: Mov[] = [
      { descripcion: QR, centimos: 5000, fecha: "20261106", proceso: "20261106", correlativo: "00263100001" },
      { descripcion: QR, centimos: 1000, fecha: "20261107", proceso: "20261109", correlativo: "00000090002" },
      { descripcion: "CARGO TRANSFERENCIA PROPIA", centimos: -1000, fecha: "20261107", proceso: "20261109", correlativo: "00000090000" },
      { descripcion: QR, centimos: 2000, fecha: "20261108", proceso: "20261109", correlativo: "00000090001" },
    ];
    const { texto, enArchivo } = archivoDe(0, ida, [1, 2, 3, 0]); // al revés del archivo, lo provisional queda +20, −10, +10
    expect(huecosDe([enArchivo[3], enArchivo[2], enArchivo[1], enArchivo[0]]).length).toBeGreaterThan(0); // CONTROL
    const e = leerExtracto(texto);
    expect(e.lineas.map((l) => l.centimos)).toEqual([5000, 1000, -1000, 2000]);
    expect(e.huecos).toEqual([]);
  });
  it("si falta una línea de verdad no se inventa un orden: queda el del archivo al revés y el hueco se dice", () => {
    // El extracto de arriba sin el cargo de 300.00 del bloque provisional: ninguna cadena alcanza a todas las líneas.
    const sinElCargo = COMO_BAJA.filter((i) => i !== provisional(2));
    const e = leerExtracto(archivoDe(50000, PASARON, sinElCargo).texto);
    expect(e.lineas.map((l) => l.centimos)).toEqual(PASARON.filter((_, i) => i !== provisional(2)).map((m) => m.centimos));
    expect(e.huecos.map((h) => h.faltan)).toEqual([-30000]);
  });
  it("si falta la línea que volvía a un saldo del que parten dos, no se toma por cadena un recorrido que las usa sueltas", () => {
    // +10.00, −10.00 y +20.00 otra vez, pero el archivo no trae el −10.00: las dos que quedan parten del mismo saldo y ninguna vuelve a él.
    // Recorrerlas «usa todas» y las deja al revés (+20.00, +10.00): el saldo final sería el de la línea vieja y el hueco, de −20.00.
    const ida: Mov[] = [
      { descripcion: QR, centimos: 5000, fecha: "20261106", proceso: "20261106", correlativo: "00263100001" },
      { descripcion: QR, centimos: 1000, fecha: "20261107", proceso: "20261109", correlativo: "00000090002" },
      { descripcion: "CARGO TRANSFERENCIA PROPIA", centimos: -1000, fecha: "20261107", proceso: "20261109", correlativo: "00000090000" },
      { descripcion: QR, centimos: 2000, fecha: "20261108", proceso: "20261109", correlativo: "00000090001" },
    ];
    const e = leerExtracto(archivoDe(0, ida, [3, 1, 0]).texto);
    expect(e.lineas.map((l) => l.centimos)).toEqual([5000, 1000, 2000]); // el orden inverso del archivo, que es el real
    expect(e.huecos.map((h) => h.faltan)).toEqual([-1000]); // falta justo el cargo que no vino
    expect(e.lineas[e.lineas.length - 1].saldoCentimos).toBe(7000); // el saldo del banco es el de la línea más nueva
  });
  it("si lo que falta está entre lo firme y lo provisional, el bloque se ordena por dentro y el hueco sale una sola vez", () => {
    // Falta el lote con que empieza el bloque, y lo que queda de provisional baja revuelto.
    const baja = [provisional(2), provisional(5), provisional(1), provisional(4), provisional(3), 6, 5, 4, 3, 2, 1, 0];
    const e = leerExtracto(archivoDe(50000, PASARON, baja).texto);
    expect(e.lineas.slice(ULTIMA_FIRME + 1).map((l) => l.centimos)).toEqual(PROVISIONALES.slice(1).map((m) => m.centimos));
    expect(e.huecos.map((h) => [h.despuesDe.firme, h.antesDe.firme, h.faltan])).toEqual([[true, false, 52040]]);
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
  it("no trae correlativo: ninguna de sus líneas es firme y lo que el banco da para reconocerlas va vacío", () => {
    expect(e.lineas.map((l) => [l.fechaProceso, l.correlativo, l.codigo, l.operacion, l.firme])).toEqual(e.lineas.map(() => [null, null, null, null, false]));
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
