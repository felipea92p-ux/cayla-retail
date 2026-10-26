import { describe, expect, it } from "vitest";
import { cajasSinDepositar, pendientesDeDinero } from "./dinero-te-toca-reglas";
import type { CuentaDinero } from "./cuentas-dinero-reglas";

const HOY = "2026-10-15";
const plano = (t: string) => t.replace(/\s/g, " ");
const BASE = { porPagar: [], cajasSinDepositar: [], lineasSinRevisar: 0, esLider: true };

describe("pendientesDeDinero", () => {
  it("sin nada pendiente, nada", () => {
    expect(pendientesDeDinero(BASE, HOY, "")).toEqual([]);
  });
  it("lo vencido y lo de esta semana frenan y llevan a Qué debes con su tramo; lo de más adelante no es pendiente", () => {
    const p = pendientesDeDinero(
      { ...BASE, porPagar: [{ vence: "2026-10-10", saldo: 5133.6 }, { vence: "2026-10-19", saldo: 6800 }, { vence: "2026-10-22", saldo: 200 }, { vence: "2026-11-30", saldo: 3200 }] },
      HOY,
      "sede=tru",
    );
    expect(p.map((x) => [x.id, x.estado, x.href])).toEqual([
      ["dinero.vencidas", "frena", "/finanzas/dinero/por-pagar?sede=tru&tramo=vencidas"],
      ["dinero.esta-semana", "frena", "/finanzas/dinero/por-pagar?sede=tru&tramo=semana"],
    ]);
    expect(p[0].titulo).toBe("1 factura ya venció");
    expect(plano(p[1].detalle)).toBe("S/ 7,000 que vencen en los próximos 7 días");
    expect(p[1].titulo).toBe("Pagar 2 facturas de esta semana");
  });
  it("cada caja fuerte sin depositar avisa y lleva a Dónde está", () => {
    const p = pendientesDeDinero({ ...BASE, cajasSinDepositar: [{ nombre: "Caja fuerte · Arequipa", saldo: 3900, dias: 6 }] }, HOY, "");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ estado: "avisa", titulo: "Caja fuerte · Arequipa lleva 6 días sin depositar", href: "/finanzas/dinero" });
  });
  it("las líneas sin revisar solo le tocan al líder, que es quien cuadra", () => {
    expect(pendientesDeDinero({ ...BASE, lineasSinRevisar: 4 }, HOY, "")[0]).toMatchObject({ id: "dinero.cuadrar", titulo: "4 movimientos del banco sin revisar", href: "/finanzas/dinero/conciliacion" });
    expect(pendientesDeDinero({ ...BASE, lineasSinRevisar: 4, esLider: false }, HOY, "")).toEqual([]);
  });
});

describe("cajasSinDepositar", () => {
  const cuenta = (p: Partial<CuentaDinero> & Pick<CuentaDinero, "id" | "nombre">): CuentaDinero => ({
    tipo: "caja_fuerte", cuentaContable: "101", ubicacionId: null, ubicacionNombre: null, numero: null, saldo: 0, archivada: false, soloDestino: false,
    cajaId: null, cajaAbierta: false, saldoDesde: null, ultimaConciliacion: null, ultimoAbono: null, orden: 0, ...p,
  });
  const CUENTAS = [
    cuenta({ id: "fAQP", nombre: "Caja fuerte · Arequipa", ubicacionId: "aqp", saldo: 3900 }),
    cuenta({ id: "fTRU", nombre: "Caja fuerte · Trujillo", ubicacionId: "tru", saldo: 6200 }),
    cuenta({ id: "fLIM", nombre: "Caja fuerte · Lima", ubicacionId: "lim", saldo: 50 }),
    cuenta({ id: "cAQP", nombre: "Cajón · Arequipa", tipo: "cajon", ubicacionId: "aqp", saldo: 500 }),
  ];
  const MOVS = [
    { tipo: "deposito" as const, origenId: "fAQP", estado: "vigente" as const, fecha: "2026-10-09" },
    { tipo: "deposito" as const, origenId: "fTRU", estado: "vigente" as const, fecha: "2026-10-13" },
  ];
  it("solo las que avisan en ámbar (más de 3 días), con cuántos días llevan; sin depósitos registrados no se inventan días", () => {
    expect(cajasSinDepositar(CUENTAS, MOVS, HOY, null)).toEqual([{ nombre: "Caja fuerte · Arequipa", saldo: 3900, dias: 6 }]);
  });
  it("con una sede, solo la suya", () => {
    expect(cajasSinDepositar(CUENTAS, MOVS, HOY, "tru")).toEqual([]);
    expect(cajasSinDepositar(CUENTAS, MOVS, HOY, "aqp")).toHaveLength(1);
  });
});
