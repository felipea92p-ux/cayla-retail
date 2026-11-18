import { describe, expect, it } from "vitest";
import {
  agruparMaquinas,
  avisoFechaAntesDelInicio,
  avisosDeMaquinas,
  salidasDelCajon,
  cuadra,
  cuentaParaConciliar,
  cuentasPara,
  cuentasVisibles,
  deudaConDueno,
  diaYNumero,
  ejemploMontoDeposito,
  ejemploReferenciaDeposito,
  saldoConCentimos,
  tituloDelMovimiento,
  explicacionCuenta,
  idsSoloTransferencia,
  insigniaCuenta,
  leerConciliacion,
  leerCuenta,
  leerEgresoParaMovimiento,
  leerLotePendiente,
  lotesPorDefecto,
  netoEsperado,
  revisarComision,
  mediosDeMaquina,
  resumenAbono,
  resumenConciliacion,
  textoLote,
  textoTarifa,
  validarAbonoPos,
  validarTarifa,
  type AlertaPos,
  type LotePendiente,
  textoDondeCobra,
  textoRecibe,
  textoSalida,
  tipoDeMovimiento,
  tiposParaMedio,
  validarMovimiento,
  validarPagoSunat,
  leerFilaCuadre,
  textoDespuesDelDeposito,
  textoResiduoCuadre,
  sePuedeCuadrar,
  validarPagoPlanilla,
  mesesDePlanilla,
  totalPagoSunat,
  mesesParaPagarSunat,
  OPCIONES_QUE_PASO,
  type BorradorMovimiento,
  type ConciliacionCuenta,
  type CuentaDinero,
  type EgresoParaMovimiento,
  type FilaMedio,
} from "./cuentas-dinero-reglas";

// Finanzas ▸ Cuentas y dinero (ADR-0195 F3): las reglas puras de la pantalla. Los saldos los suma la base
// (scripts/pruebas/cuentas_dinero.mjs); aquí se prueba cómo se agrupan, se explican y se valida el formulario.

describe("avisoFechaAntesDelInicio: la cuenta que no se moverá", () => {
  const banco = { id: "b", nombre: "BCP Operativa", saldoDesde: "2026-10-28" };
  const otro = { id: "i", nombre: "Interbank", saldoDesde: "2026-10-28T00:00:00" };
  const fondo = { id: "f", nombre: "Fondo Felipe", saldoDesde: null };

  it("nombra solo la cuenta que no se mueve: en una entrega a fondo, el banco", () => {
    expect(avisoFechaAntesDelInicio("2026-10-27", [banco, fondo])).toBe("BCP Operativa empieza el 28 oct: este movimiento no cambiará su saldo.");
  });
  it("si son dos, las nombra a las dos", () => {
    expect(avisoFechaAntesDelInicio("2026-10-27", [banco, otro])).toBe("BCP Operativa empieza el 28 oct: este movimiento no cambiará su saldo. Interbank empieza el 28 oct: este movimiento no cambiará su saldo.");
  });
  it("el mismo día del inicio o después sí mueve el saldo: calla", () => {
    expect(avisoFechaAntesDelInicio("2026-10-28", [banco])).toBeNull();
    expect(avisoFechaAntesDelInicio("2026-11-02", [banco])).toBeNull();
  });
  it("calla si la cuenta no tiene inicio, si no hay cuenta o si no hay fecha", () => {
    expect(avisoFechaAntesDelInicio("2026-10-27", [fondo, null, undefined])).toBeNull();
    expect(avisoFechaAntesDelInicio("", [banco])).toBeNull();
  });
  it("una cuenta repetida se dice una vez", () => {
    expect(avisoFechaAntesDelInicio("2026-10-27", [banco, banco])).toBe("BCP Operativa empieza el 28 oct: este movimiento no cambiará su saldo.");
  });
});

describe("salidasDelCajon: lo leído va con su cajón", () => {
  const e: EgresoParaMovimiento = { id: "e", cajaId: "c", monto: 50, motivo: "Depósito", nota: null, creadoEn: "2026-11-07T10:00:00Z", marca: null };
  it("sin respuesta todavía: leyendo, nunca «no hay»", () => {
    expect(salidasDelCajon(null, "tru")).toEqual({ estado: "leyendo", egresos: [] });
  });
  it("la lista de otro cajón no se muestra mientras llega la nueva", () => {
    expect(salidasDelCajon({ ubicacionId: "aqp", egresos: [e], falla: false }, "tru")).toEqual({ estado: "leyendo", egresos: [] });
  });
  it("si falló, lo dice y no entrega salidas", () => {
    expect(salidasDelCajon({ ubicacionId: "tru", egresos: [], falla: true }, "tru")).toEqual({ estado: "falla", egresos: [] });
  });
  it("leída: la lista, aunque venga vacía", () => {
    expect(salidasDelCajon({ ubicacionId: "tru", egresos: [e], falla: false }, "tru")).toEqual({ estado: "lista", egresos: [e] });
    expect(salidasDelCajon({ ubicacionId: "tru", egresos: [], falla: false }, "tru")).toEqual({ estado: "lista", egresos: [] });
  });
});

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
    expect(explicacionCuenta(pos, medios, false)).toBe("Tarjeta de las 2 tiendas, hasta que la máquina los deposita");
    expect(explicacionCuenta(cajonTru, medios, false)).toBe("Caja abierta hoy");
    expect(explicacionCuenta(cajonLim, medios, false)).toBe("Caja cerrada: lo que quedó para el próximo turno");
    expect(explicacionCuenta(cajonLim, medios, true)).toBe("Para gastos chicos del Taller");
    expect(explicacionCuenta(fuerteTru, medios, false)).toBe("Lo que los cierres guardan en la tienda");
    expect(explicacionCuenta(visa, medios, false)).toBe("Lo que debes a la tarjeta");
  });
  it("el QR tiene su fila y, como la tarjeta, puede esperar en la cuenta «por depositar» de su máquina (ADR-0429)", () => {
    const conQr: FilaMedio[] = [...medios, { ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "qr", cuentaId: "pos", cuentaNombre: "Niubiz", vigenteDesde: null }];
    expect(textoRecibe(pos, conQr)).toBe("Tarjeta de las 2 tiendas · QR de TRU");
    expect(tiposParaMedio("qr")).toEqual(["por_abonar", "banco"]);
    expect(tiposParaMedio("tarjeta")).toEqual(["por_abonar", "banco"]);
    expect(tiposParaMedio("yape")).toEqual(["banco"]);
  });
});

describe("el Taller solo guarda la cuenta de sus transferencias", () => {
  const TALLER = "taller-1";
  const fila = (ubicacionId: string, ubicacionNombre: string, medio: FilaMedio["medio"], cuentaId: string | null): FilaMedio => ({ ubicacionId, ubicacionNombre, medio, cuentaId, cuentaNombre: cuentaId, vigenteDesde: null });
  // Las 2 tiendas de siempre más el Taller, que la base lista solo con «transferencia».
  const conTaller: FilaMedio[] = [...medios, fila(TALLER, "Taller", "transferencia", "ibk")];
  const conQr: FilaMedio[] = [...conTaller, fila(TRU, "Tienda TRU", "qr", "pos"), fila(LIM, "Tienda LIM", "qr", "pos")];

  it("reconoce al Taller por lo que la base le lista, y a ninguna tienda", () => {
    expect([...idsSoloTransferencia(conTaller)]).toEqual([TALLER]);
    expect(idsSoloTransferencia(medios).size).toBe(0);
  });
  it("«Plin de las 2 tiendas» sigue diciendo 2: el Taller no cuenta como tienda", () => {
    expect(textoRecibe(ibk, conTaller)).toBe("Plin de las 2 tiendas · Yape de LIM · pagos de Taller");
    expect(textoRecibe(pos, conQr)).toBe("Tarjeta de las 2 tiendas · QR de las 2 tiendas");
  });
  it("si todas las sedes usan la misma cuenta, las transferencias de las tiendas no repiten sedes y lo del Taller se dice como pagos", () => {
    const todas = conTaller.map((m) => (m.medio === "transferencia" ? { ...m, cuentaId: "bcp" } : m));
    expect(textoRecibe(bcp, todas)).toBe("Yape de TRU · transferencias · pagos de Taller");
  });
  it("si el Taller usa otra cuenta, la de las tiendas no lo menciona y la del Taller dice que de ahí paga", () => {
    expect(textoRecibe(bcp, conTaller)).toBe("Yape de TRU · transferencias");
    expect(textoRecibe(cuenta({ id: "solo", tipo: "banco" }), [...medios, fila(TALLER, "Taller", "transferencia", "solo")])).toBe("Pagos de Taller");
  });
  it("sin la migración (la base no lista al Taller) todo se ve exactamente como antes", () => {
    expect(textoRecibe(bcp, medios)).toBe("Yape de TRU · transferencias");
    expect(textoRecibe(ibk, medios)).toBe("Plin de las 2 tiendas · Yape de LIM");
  });
});

describe("las máquinas de cobro (ADR-0429)", () => {
  const filas = [
    { maquina_id: "izi", nombre: "Izipay", cuenta_id: "pdi", cuenta_nombre: "Por depositar Izipay", archivada: false, ubicacion_id: TRU, ubicacion_nombre: "Tienda TRU", medio: "tarjeta", por_defecto: false },
    { maquina_id: "izi", nombre: "Izipay", cuenta_id: "pdi", cuenta_nombre: "Por depositar Izipay", archivada: false, ubicacion_id: TRU, ubicacion_nombre: "Tienda TRU", medio: "qr", por_defecto: true },
    { maquina_id: "izi", nombre: "Izipay", cuenta_id: "pdi", cuenta_nombre: "Por depositar Izipay", archivada: false, ubicacion_id: LIM, ubicacion_nombre: "Tienda LIM", medio: "tarjeta", por_defecto: true },
    { maquina_id: "izi", nombre: "Izipay", cuenta_id: "pdi", cuenta_nombre: "Por depositar Izipay", archivada: false, ubicacion_id: LIM, ubicacion_nombre: "Tienda LIM", medio: "qr", por_defecto: true },
    { maquina_id: "ven", nombre: "Vendemás", cuenta_id: "pdv", cuenta_nombre: "Por depositar Vendemás", archivada: false, ubicacion_id: TRU, ubicacion_nombre: "Tienda TRU", medio: "tarjeta", por_defecto: true },
    { maquina_id: "vieja", nombre: "Niubiz", cuenta_id: "pos", cuenta_nombre: "Niubiz", archivada: true, ubicacion_id: null, ubicacion_nombre: null, medio: null, por_defecto: null },
  ];
  it("una fila por máquina, tienda y medio se junta por máquina; una sin tiendas queda sin sedes", () => {
    const maquinas = agruparMaquinas(filas);
    expect(maquinas.map((m) => `${m.nombre}:${m.sedes.length}:${m.archivada}`)).toEqual(["Izipay:4:false", "Vendemás:1:false", "Niubiz:0:true"]);
    expect(maquinas[0]!.sedes.filter((s) => s.porDefecto).map((s) => `${s.ubicacionNombre} ${s.medio}`)).toEqual(["Tienda TRU qr", "Tienda LIM tarjeta", "Tienda LIM qr"]);
  });
  it("dónde cobra, en palabras: los mismos medios en todas, una sola frase; distintos, una parte por tienda; sin tiendas, lo dice", () => {
    const [izipay, vendemas, niubiz] = agruparMaquinas(filas);
    expect(textoDondeCobra(izipay!)).toBe("Tarjeta y QR en TRU y LIM");
    expect(textoDondeCobra(vendemas!)).toBe("Tarjeta en TRU");
    expect(textoDondeCobra(niubiz!)).toBe("En ninguna tienda todavía");
    expect(textoDondeCobra({ sedes: izipay!.sedes.filter((s) => !(s.ubicacionId === LIM && s.medio === "tarjeta")) })).toBe("TRU: tarjeta y QR · LIM: QR");
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

  it("una máquina se cuadra solo con su banco, su tarifa y algo que depositar (tarea 14)", () => {
    const f = leerFilaCuadre({ cuenta_id: "p", maquina: "Vendemás", banco: "Interbank", dias: 2, bruto: "133.33", comision: "3.62", neto: "129.71", claves: ["a", "b"], desde: "2026-10-29", hasta: "2026-10-30", falta: null });
    expect(f).toMatchObject({ cuentaId: "p", bruto: 133.33, neto: 129.71, claves: ["a", "b"], falta: null });
    expect(sePuedeCuadrar(f)).toBe(true);
    expect(sePuedeCuadrar({ ...f, falta: "banco" })).toBe(false);
    expect(sePuedeCuadrar({ ...f, falta: "tarifa" })).toBe(false);
    expect(sePuedeCuadrar({ ...f, neto: 0 })).toBe(false);
    expect(leerFilaCuadre({ falta: "otra", claves: null }).falta).toBeNull();
  });

  it("dice cuánto de lo propuesto se cobró después de un depósito ya registrado (ADR-0629)", () => {
    expect(leerFilaCuadre({ residuo: "33.33" }).residuo).toBe(33.33);
    expect(leerFilaCuadre({}).residuo).toBe(0);
    expect(textoResiduoCuadre({ residuo: 33.33 })).toContain("33.33");
    expect(textoResiduoCuadre({ residuo: 0 })).toBeNull();
  });

  it("pagar a SUNAT dice de qué mes es y separa IGV de renta (tarea 10)", () => {
    const b = { origen: "bcp", referencia: "", fecha: hoy };
    const c = { cuentas: TODAS, hoy };
    expect(validarPagoSunat(b, { mes: "2026-08", igv: "1,200", renta: "300.50" }, c)).toEqual({
      ok: true,
      valor: {
        p_cuenta_id: "bcp",
        p_fecha: hoy,
        p_lineas: [{ mes: "2026-08-01", concepto: "igv", monto: 1200 }, { mes: "2026-08-01", concepto: "renta", monto: 300.5 }],
        p_referencia: "IGV y Renta de agosto 2026",
      },
    });
    // Solo renta: el IGV a favor no se paga.
    expect(validarPagoSunat({ ...b, referencia: " OP-1 " }, { mes: "2026-08", igv: "", renta: "80" }, c)).toMatchObject({ ok: true, valor: { p_lineas: [{ concepto: "renta", monto: 80 }], p_referencia: "OP-1" } });
    expect(validarPagoSunat(b, { mes: "2026-08", igv: "", renta: "" }, c)).toEqual({ ok: false, error: "Escribe cuánto pagaste de IGV o de renta." });
    expect(validarPagoSunat(b, { mes: "2026-08", igv: "0", renta: "" }, c).ok).toBe(false);
    expect(validarPagoSunat(b, { mes: "2026-08", igv: "abc", renta: "" }, c).ok).toBe(false);
    expect(validarPagoSunat({ ...b, origen: "cTRU" }, { mes: "2026-08", igv: "10", renta: "" }, c)).toEqual({ ok: false, error: "Elige de qué banco salió el pago." });
    expect(validarPagoSunat(b, { mes: "", igv: "10", renta: "" }, c)).toEqual({ ok: false, error: "Elige de qué mes es el pago." });
    expect(validarPagoSunat({ ...b, fecha: "2026-09-25" }, { mes: "2026-08", igv: "10", renta: "" }, c)).toEqual({ ok: false, error: "La fecha no puede ser futura." });
    expect(validarPagoSunat({ ...b, fecha: "2026-07-20" }, { mes: "2026-08", igv: "10", renta: "" }, c).ok).toBe(false);
    expect(totalPagoSunat({ igv: "1,200", renta: "300.50" })).toBe(1500.5);
    expect(totalPagoSunat({ igv: "abc", renta: "" })).toBe(0);
    expect(mesesParaPagarSunat(hoy)[0]).toEqual({ valor: "2026-08", texto: "agosto 2026" });
    expect(mesesParaPagarSunat(hoy)).toHaveLength(12);
  });

  it("pagar una parte de la planilla dice qué parte y de qué mes (tarea 12)", () => {
    const b = { origen: "bcp", referencia: "", fecha: hoy, monto: "1,500" };
    const c = { cuentas: TODAS, hoy };
    expect(validarPagoPlanilla(b, { concepto: "aportes", mes: "2026-08" }, c)).toEqual({
      ok: true,
      valor: { p_cuenta_id: "bcp", p_fecha: hoy, p_monto: 1500, p_concepto: "aportes", p_mes: "2026-08-01", p_referencia: "AFP, EsSalud y retenciones de agosto 2026" },
    });
    expect(validarPagoPlanilla({ ...b, referencia: " OP-9 " }, { concepto: "cts", mes: "2026-09" }, c)).toMatchObject({ ok: true, valor: { p_concepto: "cts", p_referencia: "OP-9" } });
    expect(validarPagoPlanilla({ ...b, origen: "cTRU" }, { concepto: "cts", mes: "2026-09" }, c)).toEqual({ ok: false, error: "Elige de qué banco salió el pago." });
    expect(validarPagoPlanilla({ ...b, monto: "" }, { concepto: "cts", mes: "2026-09" }, c).ok).toBe(false);
    expect(validarPagoPlanilla(b, { concepto: "cts", mes: "" }, c)).toEqual({ ok: false, error: "Elige de qué mes es el pago." });
    expect(validarPagoPlanilla({ ...b, fecha: "2026-08-20" }, { concepto: "cts", mes: "2026-09" }, c).ok).toBe(false);
    expect(mesesDePlanilla(hoy)[0]).toEqual({ valor: "2026-09", texto: "septiembre 2026" });
  });

  it("pagar la planilla y pagar a SUNAT salen de un banco y no llegan a ninguna cuenta (ADR-0417, situaciones 15 y 16)", () => {
    const r = validarMovimiento({ ...base, que: "pago_planilla", origen: "bcp", destino: "", monto: "25,400", referencia: "Planilla de octubre" }, ctx);
    expect(r).toEqual({
      ok: true,
      valor: { p_tipo: "pago_planilla", p_monto: 25400, p_cuenta_origen_id: "bcp", p_cuenta_destino_id: null, p_fecha: hoy, p_referencia: "Planilla de octubre", p_comision: 0, p_caja_id: null, p_caja_movimiento_id: null },
    });
    expect(validarMovimiento({ ...base, que: "pago_sunat", origen: "bcp", destino: "", monto: "9,290" }, ctx)).toMatchObject({ ok: true, valor: { p_tipo: "pago_sunat", p_monto: 9290, p_cuenta_destino_id: null } });
    // El pago a CLAURE (ADR-0560) es de la misma familia: sale de un banco, sin destino, con su n.º de operación.
    expect(validarMovimiento({ ...base, que: "pago_claure", origen: "bcp", destino: "", monto: "234.34", referencia: "OP-12345" }, ctx)).toMatchObject({
      ok: true,
      valor: { p_tipo: "pago_claure", p_monto: 234.34, p_cuenta_origen_id: "bcp", p_cuenta_destino_id: null, p_referencia: "OP-12345" },
    });
    expect(validarMovimiento({ ...base, que: "pago_claure", origen: "cTRU", destino: "" }, ctx)).toEqual({ ok: false, error: "Esa cuenta no sirve de origen para este movimiento." });
    // Desde el cajón o la caja fuerte no: solo un banco.
    expect(validarMovimiento({ ...base, que: "pago_sunat", origen: "cTRU", destino: "" }, ctx)).toEqual({ ok: false, error: "Esa cuenta no sirve de origen para este movimiento." });
    // Y son solo del líder.
    expect(OPCIONES_QUE_PASO.filter((o) => o.valor === "pago_planilla" || o.valor === "pago_sunat" || o.valor === "pago_claure").every((o) => o.soloLider && o.destino === null)).toBe(true);
  });

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
    expect(validarMovimiento({ ...base, que: "dueno_saca", clase: "devolucion_prestamo", origen: "bcp", destino: "", monto: "7000" }, ctx)).toEqual({ ok: false, error: "CAYLA te debe S/\u00a06,000.00: una devolución no puede ser mayor." });
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

describe("«¿Cuál salida?»: cada salida de la tienda con su día de Lima", () => {
  // Como la manda `fn_egresos_para_movimiento` (`caja_movimientos.created_at`, timestamptz en UTC, con microsegundos):
  // 2026-10-14 01:00 UTC = 2026-10-13 20:00 en Lima.
  const salida = leerEgresoParaMovimiento({ id: "e1", caja_id: "caja-tru", monto: 300, motivo: "Depósito bancario", nota: "Voucher 7788", creado_en: "2026-10-14T01:00:00.123456+00:00", marca: null });
  const conInstante = (creadoEn: string): EgresoParaMovimiento => ({ ...salida, creadoEn });

  it("lo registrado a las 20:00 del 13 de octubre es del 13, aunque en UTC ya sea el 14", () => {
    expect(textoSalida(salida)).toBe("13 oct · S/\u00a0300.00 · Depósito bancario — Voucher 7788");
  });
  it("el día cambia a la medianoche de Lima, no a la de UTC; el mes también", () => {
    expect(textoSalida(conInstante("2026-10-14T04:59:00+00:00"))).toBe("13 oct · S/\u00a0300.00 · Depósito bancario — Voucher 7788"); // 23:59 en Lima
    expect(textoSalida(conInstante("2026-10-14T05:00:00+00:00"))).toBe("14 oct · S/\u00a0300.00 · Depósito bancario — Voucher 7788"); // 00:00 en Lima
    expect(textoSalida(conInstante("2026-11-01T02:30:00+00:00"))).toBe("31 oct · S/\u00a0300.00 · Depósito bancario — Voucher 7788"); // 21:30 del 31 en Lima
  });
  it("sin instante, o con uno que no se lee, empieza por el monto: no inventa un día", () => {
    expect(textoSalida(conInstante(""))).toBe("S/\u00a0300.00 · Depósito bancario — Voucher 7788");
    expect(textoSalida(conInstante("ayer"))).toBe("S/\u00a0300.00 · Depósito bancario — Voucher 7788");
    // Lo que deja `leerEgresoParaMovimiento` si la fila llegara sin `creado_en`.
    expect(textoSalida(leerEgresoParaMovimiento({ id: "e2", caja_id: "caja-tru", monto: 300, motivo: "Depósito bancario", nota: null, marca: null }))).toBe("S/\u00a0300.00 · Depósito bancario");
  });
  it("la nota y la marca «no es gasto» se leen igual que antes", () => {
    expect(textoSalida({ ...salida, nota: null, marca: "deposito" })).toBe("13 oct · S/\u00a0300.00 · Depósito bancario (marcado «no es gasto»)");
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
    // ADR-0652: una conciliación sin `despues` (anotada un día pasado, o de antes del corte) lo lee nulo; con él, el monto.
    expect(c?.conciliacion?.despues).toBeNull();
    const conCorte = leerConciliacion({ cuenta: {}, desde: "", hasta: "", saldo_sistema: 0, conciliacion: { id: "k2", saldo_banco: 1480.39, saldo_sistema: 1480.39, diferencia: 0, despues: "-280.39" }, lineas: [], historial: [] });
    expect(conCorte?.conciliacion?.despues).toBe(-280.39);
    const r = resumenConciliacion(c!.lineas);
    expect([r.total, r.revisadas, r.porRevisar.map((l) => l.clave)]).toEqual([2, 1, ["mov:2"]]);
    expect(leerConciliacion(null)).toBeNull();
  });
});

describe("efectivo por tienda y fechas", () => {
  it("el día de un cierre en hora de Lima", () => {
    // 02:00 UTC del 23 = 21:00 del martes 22 en Lima.
    expect(diaYNumero("2026-09-23T02:00:00Z")).toBe("martes 22");
  });
  it("lee una cuenta de la base (saldo nulo = no le toca verlo)", () => {
    const c = leerCuenta({ id: "x", nombre: "BCP", tipo: "banco", cuenta_contable: "104", saldo: null, archivada: false, solo_destino: true, orden: 10 });
    expect([c.saldo, c.soloDestino, c.orden]).toEqual([null, true, 10]);
  });
});

// /chaos de Finanzas 2026-10-14 (ADR-0412): un movimiento de dinero llega hasta S/ 1 000 000 (`movimientos_dinero_monto_con_tope`).
describe("el monto de un movimiento tiene tope", () => {
  const hoy = "2026-09-24";
  const base: BorradorMovimiento = { que: "deposito", clase: "aporte", origen: "cTRU", destino: "bcp", monto: "1,500", referencia: "", comision: "", fecha: hoy, fuente: "caja", egresoId: "" };
  const ctx = { cuentas: TODAS, egresos: [], deuda: 6000, hoy };
  it("un millón entra; un sol más, no", () => {
    expect(validarMovimiento({ ...base, monto: "1000000" }, ctx).ok).toBe(true);
    expect(validarMovimiento({ ...base, monto: "1000001" }, ctx)).toEqual({ ok: false, error: "El monto pasa de S/\u00a01 000 000: revisa que no sobre un cero." });
  });
});

describe("el depósito de la máquina se cruza contra los días pendientes (ADR-0429)", () => {
  const izipay = cuenta({ id: "pdi", nombre: "Por depositar Izipay", tipo: "por_abonar" });
  const sinTarifa = { nPagos: 1, esperado: null, diasHabiles: 1, atrasado: false, yaDepositado: 0 };
  const lotes: LotePendiente[] = [
    { clave: "cobros:2026-10-14:u-tru:tarjeta", fecha: "2026-10-14", ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "tarjeta", bruto: 1200, dias: 2, ...sinTarifa },
    { clave: "cobros:2026-10-14:u-tru:qr", fecha: "2026-10-14", ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "qr", bruto: 300, dias: 2, ...sinTarifa },
    { clave: "cobros:2026-10-15:u-lim:tarjeta", fecha: "2026-10-15", ubicacionId: LIM, ubicacionNombre: "Tienda LIM", medio: "tarjeta", bruto: 500.5, dias: 1, ...sinTarifa },
    { clave: "cobros:2026-10-16:u-tru:tarjeta", fecha: "2026-10-16", ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "tarjeta", bruto: 80, dias: 0, ...sinTarifa },
  ];
  const ctx = { cuentas: [...TODAS, izipay], hoy: "2026-10-16" };
  const base = { origen: "pdi", destino: "ibk", monto: "", referencia: " Liq. 15-oct ", fecha: "2026-10-15" };

  // Los tres días que cubre el depósito del 16-oct en los casos de abajo (la tarjeta del 15 ya se cerró).
  const hasta15 = ["cobros:2026-10-14:u-tru:tarjeta", "cobros:2026-10-14:u-tru:qr", "cobros:2026-10-15:u-lim:tarjeta"];

  it("de entrada vienen marcados los días hasta la fecha del depósito, no los de después", () => {
    expect(lotesPorDefecto(lotes, "2026-10-16")).toEqual(hasta15);
    expect(lotesPorDefecto(lotes, "2026-10-13")).toEqual([]);
  });

  it("la tarjeta del mismo día del depósito no viene marcada (el lote llega después); el QR sí", () => {
    // Control: un día antes, la tarjeta del 15 sí entra.
    expect(lotesPorDefecto(lotes, "2026-10-16")).toContain("cobros:2026-10-15:u-lim:tarjeta");
    expect(lotesPorDefecto(lotes, "2026-10-15")).toEqual(["cobros:2026-10-14:u-tru:tarjeta", "cobros:2026-10-14:u-tru:qr"]);
    const qrDeHoy: LotePendiente = { ...lotes[1]!, clave: "cobros:2026-10-15:u-tru:qr", fecha: "2026-10-15" };
    expect(lotesPorDefecto([...lotes, qrDeHoy], "2026-10-15")).toContain("cobros:2026-10-15:u-tru:qr");
  });

  it("el caso real de Vendemás del 10-nov-2026: lo del 9 cuadra con lo que llegó y lo de hoy queda para mañana", () => {
    const v = (clave: string, fecha: string, bruto: number): LotePendiente => ({ clave, fecha, ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "tarjeta", bruto, dias: 1, ...sinTarifa });
    const pend = [v("9-a", "2026-11-09", 580.3), v("9-b", "2026-11-09", 215.6), v("10-a", "2026-11-10", 230.7)];
    const marcados = lotesPorDefecto(pend, "2026-11-10");
    expect(marcados).toEqual(["9-a", "9-b"]);
    expect(resumenAbono(pend, marcados, "774.30").comision).toBe(21.6);
  });

  it("un día que ya tuvo depósito y siguió vendiendo dice que lo que queda se cobró después (ADR-0629)", () => {
    expect(leerLotePendiente({ clave: "x", fecha: "2026-11-06", ubicacion_id: TRU, medio: "qr", bruto: "33.33", ya_depositado: "100" }).yaDepositado).toBe(100);
    expect(leerLotePendiente({ clave: "x", fecha: "2026-11-06", ubicacion_id: TRU, medio: "qr", bruto: "33.33" }).yaDepositado).toBe(0);
    expect(textoDespuesDelDeposito({ yaDepositado: 100 })).toContain("100.00");
    expect(textoDespuesDelDeposito({ yaDepositado: 0 })).toBeNull();
  });

  it("cada día se lee en palabras de tienda", () => {
    expect(textoLote(lotes[1]!)).toBe("14 oct · TRU · QR");
    expect(textoLote(lotes[2]!)).toBe("15 oct · LIM · tarjeta");
  });

  it("la cuenta que se ve mientras se marca: lo cobrado, lo que llegó y la comisión como diferencia", () => {
    const marcados = hasta15;
    expect(resumenAbono(lotes, marcados, "")).toEqual({ dias: 3, bruto: 2000.5, neto: null, comision: null, esperado: null });
    expect(resumenAbono(lotes, marcados, "1,950.50")).toEqual({ dias: 3, bruto: 2000.5, neto: 1950.5, comision: 50, esperado: null });
    expect(resumenAbono(lotes, marcados, "2,100").comision).toBe(-99.5);
  });

  it("lo que viaja a registrar_abono_pos: la máquina, el banco, la fecha, el neto y las claves marcadas", () => {
    const v = validarAbonoPos({ ...base, monto: "1,950.50" }, lotes, hasta15, ctx);
    expect(v).toEqual({
      ok: true,
      valor: { p_cuenta_id: "pdi", p_banco_id: "ibk", p_fecha: "2026-10-15", p_neto: 1950.5, p_claves: ["cobros:2026-10-14:u-tru:tarjeta", "cobros:2026-10-14:u-tru:qr", "cobros:2026-10-15:u-lim:tarjeta"], p_referencia: "Liq. 15-oct" },
    });
  });

  it("lo que la base rechazaría se dice antes: sin máquina o banco, sin días, neto mayor que lo cobrado, fecha anterior al último día o futura", () => {
    const marcados = hasta15;
    expect(validarAbonoPos({ ...base, origen: "ibk", monto: "10" }, lotes, marcados, ctx)).toMatchObject({ ok: false, error: "Elige la máquina que depositó." });
    expect(validarAbonoPos({ ...base, destino: "pos", monto: "10" }, lotes, marcados, ctx)).toMatchObject({ ok: false, error: "Elige a qué banco llegó." });
    expect(validarAbonoPos({ ...base, monto: "10" }, lotes, [], ctx)).toMatchObject({ ok: false, error: "Marca qué días cubre este depósito." });
    expect(validarAbonoPos({ ...base, monto: "2,100" }, lotes, marcados, ctx).ok).toBe(false);
    expect((validarAbonoPos({ ...base, monto: "2,100" }, lotes, marcados, ctx) as { error: string }).error).toMatch(/no puede ser mayor que lo cobrado/);
    expect(validarAbonoPos({ ...base, monto: "100", fecha: "2026-10-14" }, lotes, marcados, ctx)).toMatchObject({ ok: false, error: "El depósito no puede ser anterior al último día que cubre (15 oct)." });
    expect(validarAbonoPos({ ...base, monto: "100", fecha: "2026-10-17" }, lotes, marcados, ctx)).toMatchObject({ ok: false, error: "La fecha no puede ser futura." });
    expect(validarAbonoPos({ ...base, monto: "abc" }, lotes, marcados, ctx).ok).toBe(false);
  });
});

describe("la tarifa de cada máquina solo estima y avisa (ADR-0429, act. 4)", () => {
  it("se lee en palabras de tienda, y sin tarifa lo dice", () => {
    expect(textoTarifa({ tasaPct: 3.5, igvSobreTasa: true, cargoFijo: 0.2, diasAbono: 2, desde: "2026-10-16" }).replace(/\u00a0/g, " ")).toBe("3.5 % + IGV + S/ 0.20 por pago · deposita en 2 días hábiles");
    expect(textoTarifa({ tasaPct: 2.95, igvSobreTasa: false, cargoFijo: 0, diasAbono: 1, desde: null })).toBe("2.95 % · deposita al día hábil siguiente");
    expect(textoTarifa({ tasaPct: 0, igvSobreTasa: false, cargoFijo: 0, diasAbono: 0, desde: null })).toBe("Sin comisión · deposita el mismo día");
    expect(textoTarifa(null)).toBe("Sin tarifa: solo avisa pasados 3 días hábiles");
  });

  it("los medios de una máquina, sin repetir tiendas, con su tarifa", () => {
    const m = agruparMaquinas([
      { maquina_id: "izi", nombre: "Izipay", cuenta_id: "pdi", cuenta_nombre: "Por depositar Izipay", archivada: false, ubicacion_id: TRU, ubicacion_nombre: "Tienda TRU", medio: "tarjeta", por_defecto: false, tasa_pct: null },
      { maquina_id: "izi", nombre: "Izipay", cuenta_id: "pdi", cuenta_nombre: "Por depositar Izipay", archivada: false, ubicacion_id: TRU, ubicacion_nombre: "Tienda TRU", medio: "qr", por_defecto: true, tasa_pct: "0.00", igv_sobre_tasa: false, cargo_fijo: "0.00", dias_abono: 1, tarifa_desde: "1900-01-01" },
      { maquina_id: "izi", nombre: "Izipay", cuenta_id: "pdi", cuenta_nombre: "Por depositar Izipay", archivada: false, ubicacion_id: LIM, ubicacion_nombre: "Tienda LIM", medio: "qr", por_defecto: true, tasa_pct: "0.00", igv_sobre_tasa: false, cargo_fijo: "0.00", dias_abono: 1, tarifa_desde: "1900-01-01" },
    ])[0]!;
    expect(mediosDeMaquina(m).map((x) => `${x.medio}:${textoTarifa(x.tarifa)}`)).toEqual(["tarjeta:Sin tarifa: solo avisa pasados 3 días hábiles", "qr:Sin comisión · deposita al día hábil siguiente"]);
  });

  it("lo que exige la base, dicho antes: tasa 0–100, cargo 0–50, días 0–15; lo vacío cuenta como 0", () => {
    expect(validarTarifa({ medio: "tarjeta", tasa: "3.5", igvSobreTasa: true, cargoFijo: "0.20", diasAbono: "2" }, "ven")).toEqual({
      ok: true,
      valor: { p_maquina_id: "ven", p_medio: "tarjeta", p_tasa_pct: 3.5, p_igv_sobre_tasa: true, p_cargo_fijo: 0.2, p_dias_abono: 2 },
    });
    expect(validarTarifa({ medio: "qr", tasa: "", igvSobreTasa: false, cargoFijo: "", diasAbono: "1" }, "izi")).toMatchObject({ ok: true, valor: { p_tasa_pct: 0, p_cargo_fijo: 0, p_dias_abono: 1 } });
    expect(validarTarifa({ medio: "tarjeta", tasa: "101", igvSobreTasa: true, cargoFijo: "0", diasAbono: "2" }, "ven")).toEqual({ ok: false, error: "La tasa va de 0 a 100 %." });
    expect((validarTarifa({ medio: "tarjeta", tasa: "3", igvSobreTasa: true, cargoFijo: "51", diasAbono: "2" }, "ven") as { error: string }).error.replace(/\u00a0/g, " ")).toBe("El cargo fijo por pago va de S/ 0.00 a S/ 50.00.");
    expect(validarTarifa({ medio: "tarjeta", tasa: "3", igvSobreTasa: true, cargoFijo: "0", diasAbono: "16" }, "ven")).toEqual({ ok: false, error: "Los días de abono van de 0 a 15." });
    expect(validarTarifa({ medio: "tarjeta", tasa: "abc", igvSobreTasa: true, cargoFijo: "0", diasAbono: "2" }, "ven").ok).toBe(false);
  });

  it("la comisión esperada de los días marcados solo se suma si TODOS tienen tarifa", () => {
    const base = { ubicacionId: TRU, ubicacionNombre: "Tienda TRU", medio: "tarjeta" as const, dias: 1, nPagos: 2, diasHabiles: 1, atrasado: false, yaDepositado: 0 };
    const conTarifa: LotePendiente[] = [
      { ...base, clave: "a", fecha: "2026-10-15", bruto: 100, esperado: 4.53 },
      { ...base, clave: "b", fecha: "2026-10-15", bruto: 50, esperado: 2.27 },
    ];
    expect(resumenAbono(conTarifa, ["a", "b"], "143").esperado).toBe(6.8);
    expect(resumenAbono([...conTarifa, { ...base, clave: "c", fecha: "2026-10-15", bruto: 10, esperado: null }], ["a", "b", "c"], "150").esperado).toBeNull();
    expect(resumenAbono(conTarifa, [], "").esperado).toBeNull();
    expect(leerLotePendiente({ clave: "x", fecha: "2026-10-10", ubicacion_id: TRU, medio: "qr", bruto: "12.5", dias: "6", n_pagos: "3", esperado: null, dias_habiles: "5", atrasado: true })).toMatchObject({ bruto: 12.5, nPagos: 3, esperado: null, diasHabiles: 5, atrasado: true });
  });

  it("el aviso: solo las máquinas con algo atrasado, con cuánto, desde cuándo y qué hacer", () => {
    const al = (x: Partial<AlertaPos>): AlertaPos => ({ maquinaId: "ven", nombre: "Vendemás", cuentaId: "pdv", pendientes: 3, montoPendiente: 2500, esperado: 90, atrasados: 2, montoAtrasado: 1200, diasHabilesMasViejo: 5, diasAbono: 2, sinTarifa: false, ...x });
    const avisos = avisosDeMaquinas([al({}), al({ maquinaId: "izi", nombre: "Izipay", atrasados: 0, montoAtrasado: 0 })]);
    expect(avisos.map((a) => a.titulo.replace(/\u00a0/g, " "))).toEqual(["Vendemás no depositó 2 días (S/ 1,200.00)"]);
    expect(avisos[0]!.detalle).toBe("El más viejo lleva 5 días hábiles esperando y Vendemás deposita en 2. Si ya llegó al banco, regístralo; si no, reclámalo a Vendemás.");
    expect(avisosDeMaquinas([al({ atrasados: 1, montoAtrasado: 80, sinTarifa: true, diasHabilesMasViejo: 4 })])[0]!.detalle).toContain("sin tarifa cargada: se avisa a los 3");
  });
});

describe("el ejemplo del voucher de un depósito de máquina sigue a la máquina (ADR-0290)", () => {
  it("nombra la máquina de la cuenta puente elegida", () => {
    expect(ejemploReferenciaDeposito("Por depositar Vendemás")).toBe("Depósito Vendemás 15-oct");
    expect(ejemploReferenciaDeposito("Por depositar Izipay")).toBe("Depósito Izipay 15-oct");
  });
  it("sin máquina elegida no promete ninguna", () => {
    expect(ejemploReferenciaDeposito(null)).toBe("Depósito de la máquina 15-oct");
    expect(ejemploReferenciaDeposito(undefined)).toBe("Depósito de la máquina 15-oct");
    expect(ejemploReferenciaDeposito("")).toBe("Depósito de la máquina 15-oct");
  });
});

describe("el depósito de una máquina se explica solo (/formidable, ADR-0429)", () => {
  it("el título dice de qué máquina es cuando se abre desde el aviso, y si no, el de siempre", () => {
    expect(tituloDelMovimiento("Por depositar Vendemás")).toBe("Depósito de Vendemás");
    expect(tituloDelMovimiento(null)).toBe("Registrar movimiento");
    expect(tituloDelMovimiento(undefined)).toBe("Registrar movimiento");
  });
  it("el ejemplo del monto es lo cobrado menos la comisión esperada, y sin tarifa o sin días no inventa un número", () => {
    expect(ejemploMontoDeposito(149.9, 4.9, 1)).toBe("145.00");
    expect(ejemploMontoDeposito(1200.5, 41.25, 2)).toBe("1,159.25");
    expect(ejemploMontoDeposito(149.9, null, 1)).toBe("Lo que dice tu banco");
    expect(ejemploMontoDeposito(0, null, 0)).toBe("Lo que dice tu banco");
    expect(ejemploMontoDeposito(149.9, 4.9, 0)).toBe("Lo que dice tu banco");
    expect(ejemploMontoDeposito(10, 12, 1)).toBe("Lo que dice tu banco");
  });
  it("solo «Por depositar» se ve con céntimos", () => {
    expect(saldoConCentimos("por_abonar")).toBe(true);
    for (const t of ["cajon", "caja_fuerte", "por_rendir", "banco", "tarjeta_credito"] as const) expect(saldoConCentimos(t)).toBe(false);
  });
});

describe("revisarComision (tarea 3)", () => {
  const b = 17277;
  it("dentro de 1 punto de la tarifa no pregunta; a más de 1 punto, sí", () => {
    const esperado = (b * 2.7) / 100;
    expect(revisarComision({ bruto: b, comision: (b * 2.7) / 100, esperado })).toBeNull();
    expect(revisarComision({ bruto: b, comision: (b * 3.6) / 100, esperado })).toBeNull();
    expect(revisarComision({ bruto: b, comision: (b * 1.8) / 100, esperado })).toBeNull();
    expect(revisarComision({ bruto: b, comision: (b * 3.8) / 100, esperado })).toContain("3.8 %");
    expect(revisarComision({ bruto: b, comision: 5, esperado })).toContain("la tarifa espera 2.7 %");
  });
  it("los abonos del 31 de octubre: S/ 0 sin tarifa también pregunta; una comisión normal sin tarifa, no", () => {
    expect(revisarComision({ bruto: b, comision: 0, esperado: null })).toContain("no tiene tarifa");
    expect(revisarComision({ bruto: b, comision: (b * 2.6) / 100, esperado: null })).toBeNull();
  });
  it("sin lo que llegó, sin bruto o con comisión negativa (ya tiene su propio aviso), nada", () => {
    expect(revisarComision({ bruto: b, comision: null, esperado: 100 })).toBeNull();
    expect(revisarComision({ bruto: 0, comision: 0, esperado: 0 })).toBeNull();
    expect(revisarComision({ bruto: b, comision: -1, esperado: 100 })).toBeNull();
  });
  it("propone lo que debería llegar solo si tiene con qué", () => {
    expect(netoEsperado({ dias: 2, bruto: 1000, esperado: 27 })).toBe(973);
    expect(netoEsperado({ dias: 0, bruto: 0, esperado: 0 })).toBeNull();
    expect(netoEsperado({ dias: 1, bruto: 1000, esperado: null })).toBeNull();
  });
  it("lo anterior al arranque de la cuenta no viene marcado", () => {
    const l = (fecha: string) => ({ clave: fecha, fecha } as unknown as Parameters<typeof lotesPorDefecto>[0][number]);
    expect(lotesPorDefecto([l("2026-10-20"), l("2026-10-30")], "2026-10-31", "2026-10-28")).toEqual(["2026-10-30"]);
    expect(lotesPorDefecto([l("2026-10-20")], "2026-10-31")).toEqual(["2026-10-20"]);
  });
});
