import { describe, expect, it } from "vitest";
import type { ConciliacionCuenta, LineaConciliacion } from "./cuentas-dinero-reglas";
import { bancosParaCuadrar, camposDeAnotarSaldo, estadoPar, hastaDeLaUrl, respuestaCuadre, textoLadoBanco, textoPeriodo } from "./cuadrar-reglas";
import { sePuedeConfirmar } from "./guia-campos";
import { leerMontoPlata } from "./monto-plata-reglas";

const linea = (p: Partial<LineaConciliacion>): LineaConciliacion => ({ clave: "k", fecha: "2026-10-13", detalle: "Depósito", monto: 100, revisado: false, montoRevisado: null, revisadoPor: null, ...p });
const plano = (t: string) => t.replace(/\s/g, " ");

describe("estadoPar y su lado del banco", () => {
  it("revisada, cambió desde que se revisó, o pendiente", () => {
    expect(estadoPar(linea({ revisado: true }))).toBe("revisada");
    expect(estadoPar(linea({ montoRevisado: 90 }))).toBe("cambio");
    expect(estadoPar(linea({}))).toBe("pendiente");
  });
  it("dice quién la revisó, cuánto era antes o la pregunta", () => {
    expect(textoLadoBanco(linea({ revisado: true, revisadoPor: "Felipe" }))).toBe("Está en el extracto · la revisó Felipe");
    expect(textoLadoBanco(linea({ revisado: true }))).toBe("Está en el extracto");
    expect(plano(textoLadoBanco(linea({ montoRevisado: 90 })))).toBe("Cambió desde que se revisó (era S/ 90.00): mírala otra vez");
    expect(textoLadoBanco(linea({}))).toBe("¿Está en el extracto del banco?");
  });
});

describe("bancosParaCuadrar", () => {
  const c = (id: string, nombre: string, tipo: ConciliacionCuenta["tipo"], pendientes = 0): ConciliacionCuenta => ({ id, nombre, tipo, saldoHoy: 0, ultimaFecha: null, ultimoSaldoBanco: null, ultimaDiferencia: null, pendientes });
  it("los bancos primero, por nombre, con sus pendientes y cuál está elegido", () => {
    expect(bancosParaCuadrar([c("pos", "Por depositar Izipay", "por_abonar", 2), c("ibk", "Interbank", "banco", 4), c("bcp", "BCP", "banco", 1)], "ibk")).toEqual([
      { id: "bcp", nombre: "BCP", pendientes: 1, elegida: false },
      { id: "ibk", nombre: "Interbank", pendientes: 4, elegida: true },
      { id: "pos", nombre: "Por depositar Izipay", pendientes: 2, elegida: false },
    ]);
  });
});

describe("respuestaCuadre", () => {
  const base = { cuenta: { id: "ibk", nombre: "Interbank", tipo: "banco" as const, saldoDesde: null }, hasta: "2026-10-14" };
  const k = (diferencia: number) => ({ id: "k", saldoBanco: 9650, saldoSistema: 9650 - diferencia, diferencia, nota: null, registradoPor: null });
  it("cuadra: el saldo coincide y todo está revisado", () => {
    expect(respuestaCuadre({ ...base, conciliacion: k(0), lineas: [linea({ revisado: true })] })).toEqual({ texto: "Interbank cuadra con el banco al 14 oct.", tono: "verde" });
  });
  it("el saldo coincide pero faltan líneas: ámbar", () => {
    expect(respuestaCuadre({ ...base, conciliacion: k(0), lineas: [linea({}), linea({ montoRevisado: 5 })] }).texto).toBe("El saldo coincide al 14 oct; faltan revisar 2 líneas.");
  });
  it("no cuadra: dice la diferencia", () => {
    const r = respuestaCuadre({ ...base, conciliacion: k(-180), lineas: [] });
    expect(plano(r.texto)).toBe("No cuadra al 14 oct: hay S/ 180.00 de diferencia con el banco.");
    expect(r.tono).toBe("ambar");
  });
  it("sin saldo anotado: qué falta", () => {
    expect(respuestaCuadre({ ...base, conciliacion: null, lineas: [linea({})] }).texto).toBe("Faltan revisar 1 línea y anotar el saldo del banco.");
    expect(respuestaCuadre({ ...base, conciliacion: null, lineas: [] }).texto).toBe("Todo revisado al 14 oct: anota el saldo del banco para saber si cuadra.");
  });
});

describe("camposDeAnotarSaldo (guía de foco)", () => {
  const HOY = "2026-10-23";
  const base = { responsableListo: true, saldo: "9,650.00", fecha: HOY, hoy: HOY };
  // Lo que bloquea `anotar()`: sin responsable, saldo vacío o ilegible, fecha futura. La guía dice lo mismo, ni más ni menos.
  const bloqueaAnotar = (d: typeof base) => !d.responsableListo || d.saldo.trim() === "" || leerMontoPlata(d.saldo) === null || d.fecha === "" || d.fecha > d.hoy;
  const ESCENARIOS: (typeof base)[] = [
    base,
    { ...base, responsableListo: false },
    { ...base, saldo: "" },
    { ...base, saldo: "   " },
    { ...base, saldo: "abc" },
    { ...base, saldo: "1.550,00" },
    { ...base, saldo: "-180" },
    { ...base, fecha: "2026-10-24" },
    { ...base, fecha: "" },
    { ...base, fecha: "2026-10-01" },
  ];
  it.each(ESCENARIOS.map((e, i) => [i, e] as const))("escenario %i: la guía deja confirmar si y solo si anotar() lo acepta", (_, e) => {
    expect(sePuedeConfirmar(camposDeAnotarSaldo(e))).toBe(!bloqueaAnotar(e));
  });
  it("en orden: quién, el saldo y la fecha; todos requeridos", () => {
    expect(camposDeAnotarSaldo(base).map((c) => [c.id, c.requerido])).toEqual([["responsable", true], ["saldo", true], ["fecha", true]]);
  });
});

// /chaos 2026-10-23 (semilla 1023, hallazgo #1, NAV-07): `?hasta=1900-01-01` dibujaba «movimientos del 16 oct al 1 ene», un período
// al revés. Una fecha antes de que empiece la cuenta se trata como sin fecha (el corte de hoy), igual que una futura o una que no lo es.
describe("hastaDeLaUrl", () => {
  const HOY = "2026-10-23";
  const DESDE = "2026-10-16";
  it("una fecha válida dentro del período de la cuenta se respeta", () => {
    expect(hastaDeLaUrl("2026-10-20", HOY, DESDE)).toBe("2026-10-20");
    expect(hastaDeLaUrl(DESDE, HOY, DESDE)).toBe(DESDE);
    expect(hastaDeLaUrl(HOY, HOY, DESDE)).toBe(HOY);
  });
  it("antes de que empiece la cuenta: sin fecha (el período nunca queda al revés)", () => {
    expect(hastaDeLaUrl("1900-01-01", HOY, DESDE)).toBeNull();
    expect(hastaDeLaUrl("2026-10-15", HOY, DESDE)).toBeNull();
  });
  it("futura, basura o vacía: sin fecha, como antes", () => {
    expect(hastaDeLaUrl("2099-01-01", HOY, DESDE)).toBeNull();
    expect(hastaDeLaUrl("basura", HOY, DESDE)).toBeNull();
    expect(hastaDeLaUrl(undefined, HOY, DESDE)).toBeNull();
  });
  it("sin inicio de la cuenta ni de Finanzas no hay piso", () => {
    expect(hastaDeLaUrl("1900-01-01", HOY, null)).toBe("1900-01-01");
  });
  it("el inicio de Finanzas sirve de piso cuando la cuenta no tiene el suyo (lo pasa la página)", () => {
    expect(hastaDeLaUrl("2026-09-30", HOY, "2026-10-01")).toBeNull();
  });
});

describe("textoPeriodo", () => {
  const HOY = "2026-10-23";
  it("del año de hoy, sin año; de otro año, con el año (nunca «del 2 dic al 1 ene» de 1899)", () => {
    expect(textoPeriodo("2026-10-16", "2026-10-23", HOY)).toBe("del 16 oct al 23 oct");
    expect(textoPeriodo("1899-12-02", "1900-01-01", HOY)).toBe("del 2 dic 1899 al 1 ene 1900");
    expect(textoPeriodo("2025-12-15", "2026-01-14", HOY)).toBe("del 15 dic 2025 al 14 ene 2026");
  });
});
