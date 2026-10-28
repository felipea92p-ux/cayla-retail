import { describe, expect, it } from "vitest";
import type { MesIgv, PanelImpuestos } from "./impuestos-reglas";
import { pulsoImpuestos } from "./impuestos-pulso-reglas";

const mes = (p: Partial<MesIgv>): MesIgv => ({
  mes: "2026-09", comprobantes: 629, baseVentas: 89000, igvVentas: 16020, igvNotasCredito: 0, debito: 16020,
  creditoMercaderia: 6000, creditoGastos: 1620, creditoActivos: 0, creditoTaller: 0, creditoNotas: 0, credito: 7620,
  saldoAnterior: 0, aPagar: 8400, saldoAFavor: 0, ...p,
});
const PANEL: PanelImpuestos = {
  hoy: "2026-10-15", mes: "2026-09", mesActual: "2026-10", foco: mes({}), historial: [],
  parametros: { igv: { valor: 0.18, provisional: false }, uit: { valor: 5500, provisional: false, anio: 2026 }, umbralUit: { valor: 300, provisional: false }, regimen: { texto: "rmt", provisional: false }, renta: { valor: 0.01, provisional: false }, avisoUmbralUit: { valor: 250, provisional: false } },
  umbral: {
    anio: 2026, ventasAnio: 900000, ventasAnioErp: 900000, ajuste: 0, umbralSoles: 1650000, avance: 0.5455, cruzado: false, primerMes: "2025-10", ventasMeses: [], avisoSoles: 1375000, avisoAlcanzado: false,
  },
  renta: { base: 89000, tasa: 0.01, monto: 890 },
  revisar: {
    boletas: { n: 2, total: 1200, gastos: 2, proveedores: ["Ferretería Lima", "Bazar Sol"] },
    sinAceptar: { n: 0, total: 0 },
    rechazados: { n: 1, total: 118 },
    sinComprobante: { n: 0, total: 0, alegra: 0 },
    honorarios: { n: 0, total: 0, mayores: 0 },
    igvPerdido: { n: 0, igv: 0 },
  },
};

describe("pulsoImpuestos", () => {
  it("a pagar: la cifra grande es IGV + renta, con la cuenta que la explica y lo que falta hacer", () => {
    const p = pulsoImpuestos(PANEL);
    expect(p.estado).toBe("a_pagar");
    if (p.estado !== "a_pagar") return;
    expect(p.total).toBe(9290);
    expect(p.verbo).toBe("le pagas");
    expect(p.frase).toBe("Por lo que vendiste en septiembre, en octubre le pagas a SUNAT S/ 9,290 (S/ 8,400 de IGV y S/ 890 de renta a cuenta). El día exacto depende del último dígito de tu RUC.");
    expect(p.deCada).toBe("De cada S/ 118 que cobras, S/ 18 son de SUNAT; te devuelven el IGV que pagaste en tus compras con factura.");
    expect(p.cuenta.map((t) => [t.clave, t.monto, t.tipo])).toEqual([
      ["cobrado", 16020, "entra"],
      ["descontado", 7620, "sale"],
      ["igv", 8400, "queda"],
      ["renta", 890, "suma"],
      ["total", 9290, "queda"],
    ]);
  });

  it("a favor: no se paga IGV, el saldo pasa al mes siguiente, y la renta sí", () => {
    const p = pulsoImpuestos({ ...PANEL, foco: mes({ aPagar: 0, saldoAFavor: 1500, credito: 17520 }) });
    expect(p.estado).toBe("a_favor");
    if (p.estado !== "a_favor") return;
    expect(p.verbo).toBe("te queda a favor");
    expect(p.aFavor).toBe(1500);
    expect(p.frase).toContain("te dejó S/ 1,500 de IGV a favor");
    expect(p.frase).toContain("La renta a cuenta sí se paga: S/ 890");
    expect(p.cuenta.find((t) => t.clave === "igv")).toMatchObject({ nombre: "Te queda a favor", monto: 1500 });
    // La cuenta cierra también a favor: lo único que sale es la renta.
    expect(p.cuenta.find((t) => t.clave === "total")).toMatchObject({ nombre: "Pagas a SUNAT (solo la renta)", monto: 890 });
  });

  it("un mes sin ventas ni compras no dice «a favor S/ 0»: dice que no hubo nada", () => {
    const p = pulsoImpuestos({ ...PANEL, foco: mes({ comprobantes: 0, baseVentas: 0, igvVentas: 0, debito: 0, creditoMercaderia: 0, creditoGastos: 0, credito: 0, aPagar: 0, saldoAFavor: 0 }) });
    expect(p).toEqual({ estado: "sin_mes", mes: "2026-09", frase: "En septiembre no hubo ventas ni compras con factura en el sistema: no hay IGV que pagar ni saldo a favor." });
  });

  it("un mes sin movimiento pero con saldo que arrastra sí queda a favor", () => {
    const p = pulsoImpuestos({ ...PANEL, foco: mes({ debito: 0, credito: 0, saldoAnterior: 814, aPagar: 0, saldoAFavor: 814 }) });
    expect(p.estado).toBe("a_favor");
  });

  it("sin renta conocida, la cifra es solo el IGV y no hay fila de total", () => {
    const p = pulsoImpuestos({ ...PANEL, renta: { base: 89000, tasa: null, monto: null } });
    if (p.estado === "sin_mes") throw new Error("hay mes");
    expect(p.total).toBe(8400);
    expect(p.cuenta.map((t) => t.clave)).toEqual(["cobrado", "descontado", "igv"]);
    expect(p.frase).not.toContain("renta a cuenta");
  });

  it("sin comprobantes del mes, lo dice", () => {
    expect(pulsoImpuestos({ ...PANEL, foco: null })).toEqual({ estado: "sin_mes", mes: "2026-09", frase: "Todavía no hay comprobantes de septiembre." });
  });
});
