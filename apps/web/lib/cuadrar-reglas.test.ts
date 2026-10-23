import { describe, expect, it } from "vitest";
import type { ConciliacionCuenta, LineaConciliacion } from "./cuentas-dinero-reglas";
import { bancosParaCuadrar, camposDeAnotarSaldo, estadoPar, respuestaCuadre, textoLadoBanco } from "./cuadrar-reglas";
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
