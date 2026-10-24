import { describe, expect, it } from "vitest";
import type { MesIgv } from "./impuestos-reglas";
import { mesADeclarar, sobresIgv } from "./impuestos-sobres-reglas";

const m = (mes: string, p: Partial<MesIgv> = {}): MesIgv => ({
  mes, comprobantes: 10, baseVentas: 1000, igvVentas: 180, igvNotasCredito: 0, debito: 180,
  creditoMercaderia: 0, creditoGastos: 0, creditoActivos: 0, creditoTaller: 0, creditoNotas: 0, credito: 0,
  saldoAnterior: 0, aPagar: 180, saldoAFavor: 0, ...p,
});
const VACIO = { comprobantes: 0, baseVentas: 0, igvVentas: 0, debito: 0, aPagar: 0 };

// La base local de hoy: mayo a julio vacíos, agosto y septiembre a favor, octubre en curso.
const HISTORIAL = [
  m("2026-05", VACIO), m("2026-06", VACIO), m("2026-07", { aPagar: 8980 }),
  m("2026-08", { ...VACIO, credito: 814, saldoAFavor: 814 }),
  m("2026-09", { debito: 12, credito: 7242, saldoAnterior: 814, aPagar: 0, saldoAFavor: 8043 }),
  m("2026-10", { debito: 46, aPagar: 0, saldoAFavor: 7997 }),
];

describe("sobresIgv", () => {
  const s = sobresIgv(HISTORIAL, "2026-10", "2026-09");

  it("uno por mes, en el orden del historial, con su forma", () => {
    expect(s.map((x) => [x.mes, x.forma])).toEqual([
      ["2026-05", "vacio"], ["2026-06", "vacio"], ["2026-07", "abierto"], ["2026-08", "cerrado"], ["2026-09", "abierto"], ["2026-10", "curso"],
    ]);
  });

  it("abierto si falta algo: el que se declara ahora y el que no tiene pago registrado", () => {
    expect(s.find((x) => x.mes === "2026-09")).toMatchObject({ estado: "por_declarar", texto: "por declarar", aDeclarar: true, elegido: true });
    expect(s.find((x) => x.mes === "2026-07")).toMatchObject({ estado: "sin_pago", texto: "sin pago registrado", monto: 8980, aFavor: false });
  });

  it("a favor: el sobre muestra el saldo a favor, no un cero", () => {
    expect(s.find((x) => x.mes === "2026-08")).toMatchObject({ monto: 814, aFavor: true });
  });

  it("ningún sobre se sella: el sistema todavía no sabe qué mes pagó cada pago a SUNAT", () => {
    expect(s.some((x) => (x.forma as string) === "sellado")).toBe(false);
  });

  it("el nombre lleva el año solo si no es el del mes en curso", () => {
    const viejos = sobresIgv([m("2025-12"), m("2026-01")], "2026-02", "2026-01");
    expect(viejos.map((x) => x.nombre)).toEqual(["Diciembre 2025", "Enero"]);
  });

  it("el mes que se declara es el anterior al de hoy, también en enero", () => {
    expect(mesADeclarar("2026-10")).toBe("2026-09");
    expect(mesADeclarar("2027-01")).toBe("2026-12");
  });
});
