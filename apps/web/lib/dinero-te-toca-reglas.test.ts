import { describe, expect, it } from "vitest";
import { pendientesDeDinero } from "./dinero-te-toca-reglas";

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
