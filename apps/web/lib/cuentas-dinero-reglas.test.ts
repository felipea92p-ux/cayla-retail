import { describe, expect, it } from "vitest";
import {
  agruparCuentas,
  cuadra,
  cuentaParaConciliar,
  cuentasPara,
  cuentasVisibles,
  deudaConDueno,
  diaYNumero,
  explicacionCuenta,
  hoyEnPalabras,
  insigniaCuenta,
  leerConciliacion,
  leerCuenta,
  otrosDelCajon,
  resumenConciliacion,
  textoRecibe,
  tipoDeMovimiento,
  validarMovimiento,
  type BorradorMovimiento,
  type ConciliacionCuenta,
  type CuentaDinero,
  type EgresoParaMovimiento,
  type FilaMedio,
} from "./cuentas-dinero-reglas";

// Finanzas ▸ Cuentas y dinero (ADR-0195 F3): las reglas puras de la pantalla. Los saldos los suma la base
// (scripts/pruebas/cuentas_dinero.mjs); aquí se prueba cómo se agrupan, se explican y se valida el formulario.

const TRU = "u-tru";
const LIM = "u-lim";
const cuenta = (c: Partial<CuentaDinero> & Pick<CuentaDinero, "id" | "tipo">): CuentaDinero => ({
  nombre: c.id,
  cuentaContable: "104",
  ubicacionId: null,
  ubicacionNombre: null,
  numero: null,
  saldo: 0,
  archivada: false,
  soloDestino: false,
  cajaId: null,
  cajaAbierta: false,
  saldoDesde: null,
  ultimaConciliacion: null,
  ultimoAbono: null,
  orden: 0,
  ...c,
});

const bcp = cuenta({ id: "bcp", nombre: "BCP", tipo: "banco", saldo: 38420 });
const ibk = cuenta({ id: "ibk", nombre: "Interbank", tipo: "banco", saldo: 12880 });
const pos = cuenta({ id: "pos", nombre: "Niubiz", tipo: "por_abonar", saldo: 2310 });
const visa = cuenta({ id: "visa", nombre: "Visa", tipo: "tarjeta_credito", saldo: -1850 });
const cajonTru = cuenta({ id: "cTRU", nombre: "Cajón · Tienda TRU", tipo: "cajon", ubicacionId: TRU, cajaId: "caja-tru", cajaAbierta: true, saldo: 1030 });
const cajonLim = cuenta({ id: "cLIM", nombre: "Cajón · Tienda LIM", tipo: "cajon", ubicacionId: LIM, saldo: 495 });
const fuerteTru = cuenta({ id: "fTRU", nombre: "Caja fuerte · Tienda TRU", tipo: "caja_fuerte", ubicacionId: TRU, saldo: 1800 });
const rendir = cuenta({ id: "rend", nombre: "Efectivo entregado al líder", tipo: "por_rendir" });
const archivada = cuenta({ id: "vieja", nombre: "BBVA", tipo: "banco", archivada: true });
const TODAS = [bcp, ibk, pos, visa, cajonTru, cajonLim, fuerteTru, rendir, archivada];

const medios: FilaMedio[] = [
  { ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "yape", cuentaId: "bcp", cuentaNombre: "BCP", vigenteDesde: null },
  { ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "plin", cuentaId: "ibk", cuentaNombre: "Interbank", vigenteDesde: null },
  { ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "tarjeta", cuentaId: "pos", cuentaNombre: "Niubiz", vigenteDesde: null },
  { ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "transferencia", cuentaId: "bcp", cuentaNombre: "BCP", vigenteDesde: null },
  { ubicacionId: LIM, ubicacionNombre: "Tienda LIM", medio: "yape", cuentaId: "ibk", cuentaNombre: "Interbank", vigenteDesde: null },
  { ubicacionId: LIM, ubicacionNombre: "Tienda LIM", medio: "plin", cuentaId: "ibk", cuentaNombre: "Interbank", vigenteDesde: null },
  { ubicacionId: LIM, ubicacionNombre: "Tienda LIM", medio: "tarjeta", cuentaId: "pos", cuentaNombre: "Niubiz", vigenteDesde: null },
  { ubicacionId: LIM, ubicacionNombre: "Tienda LIM", medio: "transferencia", cuentaId: "bcp", cuentaNombre: "BCP", vigenteDesde: null },
];

describe("qué cuentas se ven y cómo se agrupan (spike `vistaCuentas`)", () => {
  it("con una tienda en «Ver»: las de CAYLA entera y SOLO el cajón y la caja fuerte de esa tienda; nunca las archivadas", () => {
    expect(cuentasVisibles(TODAS, TRU).map((c) => c.id)).toEqual(["bcp", "ibk", "pos", "visa", "cTRU", "fTRU", "rend"]);
  });
  it("con «Todas», todos los cajones", () => {
    expect(cuentasVisibles(TODAS, null).map((c) => c.id)).toContain("cLIM");
  });
  it("una cuenta que solo es destino (el banco para quien solo deposita) no se dibuja como tarjeta", () => {
    expect(cuentasVisibles([{ ...bcp, soloDestino: true, saldo: null }, cajonTru], TRU).map((c) => c.id)).toEqual(["cTRU"]);
  });
  it("los grupos del spike, en su orden, con su cuenta contable; los vacíos no salen", () => {
    expect(agruparCuentas(cuentasVisibles(TODAS, TRU)).map((g) => `${g.titulo} ${g.cuenta}: ${g.cuentas.map((c) => c.id).join(",")}`)).toEqual([
      "Bancos 104: bcp,ibk",
      "Por abonar 105: pos",
      "Cajones y fondo fijo 101: cTRU",
      "Cajas fuertes y efectivo por rendir 101: fTRU,rend",
      "Tarjetas de crédito de CAYLA · lo que se debe 451: visa",
    ]);
    expect(agruparCuentas([bcp]).map((g) => g.clave)).toEqual(["bancos"]);
  });
});

describe("de dónde le llega la plata a cada cuenta, en palabras", () => {
  it("«Yape de TRU · transferencias»: las transferencias de todas las tiendas no repiten tiendas", () => {
    expect(textoRecibe(bcp, medios)).toBe("Yape de TRU · transferencias");
  });
  it("«Plin de las 2 tiendas · Yape de LIM»", () => {
    expect(textoRecibe(ibk, medios)).toBe("Plin de las 2 tiendas · Yape de LIM");
  });
  it("una cuenta sin cobros asignados no dice nada", () => {
    expect(textoRecibe(cuenta({ id: "x", tipo: "banco" }), medios)).toBeNull();
    expect(explicacionCuenta(cuenta({ id: "x", tipo: "banco" }), medios, false)).toBe("Sin cobros asignados todavía");
  });
  it("cada tipo tiene su explicación (el cajón del Taller es un fondo para gastos chicos)", () => {
    expect(explicacionCuenta(pos, medios, false)).toBe("Tarjeta de las 2 tiendas, hasta que el banco los abona");
    expect(explicacionCuenta(cajonTru, medios, false)).toBe("Caja abierta hoy");
    expect(explicacionCuenta(cajonLim, medios, false)).toBe("Caja cerrada: lo que quedó para el próximo turno");
    expect(explicacionCuenta(cajonLim, medios, true)).toBe("Para gastos chicos del Taller");
    expect(explicacionCuenta(fuerteTru, medios, false)).toBe("Lo que los cierres guardan en la tienda");
    expect(explicacionCuenta(visa, medios, false)).toBe("Lo que debes a la tarjeta");
  });
});

describe("la insignia de cada tarjeta", () => {
  const hoy = "2026-09-24";
  it("un banco conciliado hace menos de una semana, en verde; más, en ámbar; nunca, «sin conciliar»", () => {
    expect(insigniaCuenta({ ...bcp, ultimaConciliacion: "2026-09-19" }, hoy)).toEqual({ texto: "conciliada 19 sep", tono: "verde" });
    expect(insigniaCuenta({ ...bcp, ultimaConciliacion: "2026-08-29" }, hoy)).toEqual({ texto: "conciliada 29 ago", tono: "ambar" });
    expect(insigniaCuenta(bcp, hoy)).toEqual({ texto: "sin conciliar", tono: "ambar" });
  });
  it("el POS dice cuántos días lleva sin abonar", () => {
    expect(insigniaCuenta({ ...pos, ultimoAbono: "2026-09-19" }, hoy)).toEqual({ texto: "5 días sin abonar", tono: "pizarra" });
    expect(insigniaCuenta({ ...pos, ultimoAbono: "2026-09-23" }, hoy)?.texto).toBe("1 día sin abonar");
    expect(insigniaCuenta({ ...pos, ultimoAbono: hoy }, hoy)?.texto).toBe("abonada hoy");
    expect(insigniaCuenta({ ...pos, saldo: 0 }, hoy)).toBeNull();
  });
  it("cajones y tarjetas no llevan insignia", () => {
    expect(insigniaCuenta(cajonTru, hoy)).toBeNull();
    expect(insigniaCuenta(visa, hoy)).toBeNull();
  });
});

describe("la plata del dueño", () => {
  it("lo devuelto paga primero el préstamo más antiguo; la deuda es lo que falta", () => {
    const r = deudaConDueno([
      { id: "p1", tipo: "prestamo", fecha: "2026-07-14", monto: 10000, referencia: "invierno", cuentaNombre: "BCP" },
      { id: "a1", tipo: "aporte", fecha: "2026-07-20", monto: 5000, referencia: null, cuentaNombre: "BCP" },
      { id: "p2", tipo: "prestamo", fecha: "2026-08-01", monto: 3000, referencia: null, cuentaNombre: "BCP" },
      { id: "d1", tipo: "devolucion_prestamo", fecha: "2026-08-10", monto: 11000, referencia: null, cuentaNombre: "BCP" },
      { id: "r1", tipo: "retiro", fecha: "2026-09-15", monto: 2500, referencia: null, cuentaNombre: "BCP" },
    ]);
    expect(r.deuda).toBe(2000);
    expect(r.prestamos.map((p) => [p.id, p.devuelto])).toEqual([
      ["p1", 10000],
      ["p2", 1000],
    ]);
  });
  it("sin préstamos, no debe nada", () => {
    expect(deudaConDueno([]).deuda).toBe(0);
  });
});

describe("el formulario «Registrar movimiento»", () => {
  const hoy = "2026-09-24";
  const egresos: EgresoParaMovimiento[] = [{ id: "e1", cajaId: "caja-tru", monto: 300, motivo: "Depósito bancario", nota: "Voucher 7788", creadoEn: "2026-09-23T15:00:00Z", marca: null }];
  const base: BorradorMovimiento = { que: "deposito", clase: "aporte", origen: "cTRU", destino: "bcp", monto: "1,500", referencia: " Voucher 1 ", comision: "", fecha: hoy, fuente: "caja", egresoId: "" };
  const ctx = { cuentas: TODAS, egresos, deuda: 6000, hoy };

  it("depósito del cajón con la caja abierta: sale de esa caja (su egreso lo crea la base), sin fecha (es hoy)", () => {
    expect(validarMovimiento(base, ctx)).toEqual({
      ok: true,
      valor: { p_tipo: "deposito", p_monto: 1500, p_cuenta_origen_id: "cTRU", p_cuenta_destino_id: "bcp", p_fecha: null, p_referencia: "Voucher 1", p_comision: 0, p_caja_id: "caja-tru", p_caja_movimiento_id: null },
    });
  });
  it("tomando la salida que la tienda ya registró: el monto es el de la salida", () => {
    const r = validarMovimiento({ ...base, fuente: "egreso", egresoId: "e1", monto: "" }, ctx);
    expect(r.ok && [r.valor.p_monto, r.valor.p_caja_movimiento_id, r.valor.p_caja_id]).toEqual([300, "e1", null]);
    expect(validarMovimiento({ ...base, fuente: "egreso", egresoId: "" }, ctx)).toEqual({ ok: false, error: "Elige el egreso que ya registró la tienda." });
  });
  it("con la caja cerrada, hay que tomar una salida ya registrada", () => {
    expect(validarMovimiento({ ...base, origen: "cLIM" }, ctx)).toEqual({ ok: false, error: "La caja de esa tienda está cerrada: elige un egreso ya registrado." });
  });
  it("de la caja fuerte al banco: lleva fecha y no toca la caja", () => {
    const r = validarMovimiento({ ...base, origen: "fTRU", fecha: "2026-09-20" }, ctx);
    expect(r.ok && [r.valor.p_fecha, r.valor.p_caja_id]).toEqual(["2026-09-20", null]);
    expect(validarMovimiento({ ...base, origen: "fTRU", fecha: "2026-09-25" }, ctx)).toEqual({ ok: false, error: "La fecha no puede ser futura." });
  });
  it("abono de tarjeta con su comisión", () => {
    const r = validarMovimiento({ ...base, que: "abono_tarjeta", origen: "pos", destino: "ibk", monto: "4180", comision: "118.50" }, ctx);
    expect(r.ok && [r.valor.p_tipo, r.valor.p_monto, r.valor.p_comision]).toEqual(["abono_tarjeta", 4180, 118.5]);
    expect(validarMovimiento({ ...base, que: "abono_tarjeta", origen: "pos", destino: "ibk", comision: "abc" }, ctx).ok).toBe(false);
  });
  it("la misma cuenta en las dos puntas no mueve plata; una cuenta del tipo equivocado no sirve", () => {
    expect(validarMovimiento({ ...base, que: "entre_cuentas", origen: "bcp", destino: "bcp" }, ctx)).toEqual({ ok: false, error: "La plata no cambia de lugar si sale y llega a la misma cuenta." });
    expect(validarMovimiento({ ...base, que: "entre_cuentas", origen: "bcp", destino: "fTRU" }, ctx)).toEqual({ ok: false, error: "Esa cuenta no sirve de destino para este movimiento." });
    expect(validarMovimiento({ ...base, que: "pago_tarjeta", origen: "pos", destino: "visa" }, ctx)).toEqual({ ok: false, error: "Esa cuenta no sirve de origen para este movimiento." });
  });
  it("poner plata: aporte o préstamo, sin cuenta de origen", () => {
    const r = validarMovimiento({ ...base, que: "dueno_pone", clase: "prestamo", origen: "cTRU", destino: "bcp", monto: "2000" }, ctx);
    expect(r.ok && [r.valor.p_tipo, r.valor.p_cuenta_origen_id, r.valor.p_cuenta_destino_id]).toEqual(["prestamo", null, "bcp"]);
    expect(tipoDeMovimiento({ que: "dueno_pone", clase: "aporte" })).toBe("aporte");
  });
  it("sacar plata: una devolución no pasa lo que CAYLA debe; un retiro, sí se puede", () => {
    expect(validarMovimiento({ ...base, que: "dueno_saca", clase: "devolucion_prestamo", origen: "bcp", destino: "", monto: "7000" }, ctx)).toEqual({ ok: false, error: "CAYLA te debe S/ 6,000.00: una devolución no puede ser mayor." });
    const r = validarMovimiento({ ...base, que: "dueno_saca", clase: "retiro", origen: "bcp", destino: "", monto: "7000" }, ctx);
    expect(r.ok && [r.valor.p_tipo, r.valor.p_cuenta_destino_id]).toEqual(["retiro", null]);
  });
  it("sin monto no se registra", () => {
    expect(validarMovimiento({ ...base, monto: "" }, ctx)).toEqual({ ok: false, error: "Escribe el monto." });
  });
  it("las cuentas que se ofrecen: activas y del tipo; en «De», nunca una que solo es destino", () => {
    expect(cuentasPara(TODAS, ["banco"], "destino").map((c) => c.id)).toEqual(["bcp", "ibk"]);
    expect(cuentasPara([{ ...bcp, soloDestino: true }, ibk], ["banco"], "origen").map((c) => c.id)).toEqual(["ibk"]);
    expect(cuentasPara(TODAS, null, "origen")).toEqual([]);
  });
});

describe("conciliación", () => {
  const cuentas: ConciliacionCuenta[] = [
    { id: "bcp", nombre: "BCP", tipo: "banco", saldoHoy: 1, ultimaFecha: "2026-09-19", ultimoSaldoBanco: 1, ultimaDiferencia: 0, pendientes: 2 },
    { id: "ibk", nombre: "Interbank", tipo: "banco", saldoHoy: 1, ultimaFecha: "2026-08-29", ultimoSaldoBanco: 1, ultimaDiferencia: -25, pendientes: 6 },
    { id: "pos", nombre: "Niubiz", tipo: "por_abonar", saldoHoy: 1, ultimaFecha: null, ultimoSaldoBanco: null, ultimaDiferencia: null, pendientes: 1 },
  ];
  it("sin elegir, se concilia primero el banco que lleva más tiempo sin conciliarse", () => {
    expect(cuentaParaConciliar(cuentas, undefined)?.id).toBe("ibk");
    expect(cuentaParaConciliar(cuentas, "pos")?.id).toBe("pos");
    expect(cuentaParaConciliar([], undefined)).toBeNull();
  });
  it("cuadra al céntimo", () => {
    expect(cuadra(0)).toBe(true);
    expect(cuadra(0.004)).toBe(true);
    expect(cuadra(-0.01)).toBe(false);
    expect(cuadra(null)).toBe(false);
  });
  it("lee lo que devuelve la base y cuenta las revisadas", () => {
    const c = leerConciliacion({
      cuenta: { id: "bcp", nombre: "BCP", tipo: "banco", saldo_desde: "2026-09-01" },
      desde: "2026-09-20",
      hasta: "2026-09-24",
      saldo_sistema: "1200.00",
      conciliacion: { id: "k1", saldo_banco: 1150, saldo_sistema: 1200, diferencia: -50, nota: null, registrado_por: "Felipe" },
      lineas: [
        { clave: "mov:1", fecha: "2026-09-23", detalle: "Depósito", monto: 300, revisado: true, monto_revisado: null, revisado_por: "Felipe" },
        { clave: "mov:2", fecha: "2026-09-22", detalle: "Entre cuentas", monto: -100, revisado: false, monto_revisado: 99, revisado_por: null },
      ],
      historial: [],
    });
    expect(c?.saldoSistema).toBe(1200);
    expect(c?.conciliacion?.diferencia).toBe(-50);
    expect(c?.lineas[1]?.montoRevisado).toBe(99);
    const r = resumenConciliacion(c!.lineas);
    expect([r.total, r.revisadas, r.porRevisar.map((l) => l.clave)]).toEqual([2, 1, ["mov:2"]]);
    expect(leerConciliacion(null)).toBeNull();
  });
});

describe("efectivo por tienda y fechas", () => {
  it("«± Otros» junta ingresos, devoluciones y cambios en efectivo", () => {
    expect(otrosDelCajon({ ingresos: 50, reembolsos: 80, cambios: 10.5 })).toBe(-19.5);
  });
  it("«Hoy, jueves 24» y el día de un cierre en hora de Lima", () => {
    expect(hoyEnPalabras("2026-09-24")).toBe("Hoy, jueves 24");
    // 02:00 UTC del 23 = 21:00 del martes 22 en Lima.
    expect(diaYNumero("2026-09-23T02:00:00Z")).toBe("martes 22");
  });
  it("lee una cuenta de la base (saldo nulo = no le toca verlo)", () => {
    const c = leerCuenta({ id: "x", nombre: "BCP", tipo: "banco", cuenta_contable: "104", saldo: null, archivada: false, solo_destino: true, orden: 10 });
    expect([c.saldo, c.soloDestino, c.orden]).toEqual([null, true, 10]);
  });
});
