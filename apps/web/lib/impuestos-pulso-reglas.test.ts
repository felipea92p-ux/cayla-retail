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
  parametros: { igv: { valor: 0.18, provisional: false }, uit: { valor: 5500, provisional: false, anio: 2026 }, umbralUit: { valor: 300, provisional: false }, regimen: { texto: "rmt", provisional: false }, renta: { valor: 0.01, provisional: false }, avisoUmbralUit: { valor: 250, provisional: false }, ventasPrevias: null },
  umbral: {
    ventas12m: 1120000, umbralSoles: 1650000, avance: 0.68, cruzado: false, primerMes: "2025-10", ventasMeses: [],
    anio: 2026, ventasAnioErp: 900000, ventasPrevias: 0, previasConfirmadas: false, ventasAnio: 900000, avisoSoles: 1375000, anioAvance: 0.5455, avisoAlcanzado: false, anioCruzado: false,
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
    expect(p.porHacer.map((h) => h.clave)).toEqual(["rechazados", "boletas"]);
    expect(p.porHacer[1]!.texto).toContain("Pide factura a Ferretería Lima y Bazar Sol");
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
    expect(p.cuenta.some((t) => t.clave === "total")).toBe(false);
  });

  it("el saldo a favor que se traía entra a la cuenta como un descuento más", () => {
    const p = pulsoImpuestos({ ...PANEL, foco: mes({ saldoAnterior: 400, aPagar: 8000 }) });
    if (p.estado === "sin_mes") throw new Error("hay mes");
    expect(p.cuenta.map((t) => t.clave)).toContain("anterior");
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

  describe("la alerta anticipada del límite", () => {
    const claves = (p: ReturnType<typeof pulsoImpuestos>) => (p.estado === "sin_mes" ? [] : p.porHacer.map((h) => h.clave));
    // Un sistema que lleva el año entero (desde el 2025-10): el año está completo y no hay nada que advertir.
    const aviso = { ...PANEL.umbral, ventasAnioErp: 1_400_000, ventasAnio: 1_400_000, avisoAlcanzado: true, anioAvance: 0.8485 };

    it("lejos del aviso no dice nada", () => {
      expect(claves(pulsoImpuestos(PANEL))).not.toContain("aviso_umbral");
    });

    it("entre el aviso y el límite: «habla con tu contador», con lo que falta y sin cifras tributarias escritas en el código", () => {
      const p = pulsoImpuestos({ ...PANEL, umbral: aviso });
      expect(claves(p)).toEqual(["rechazados", "boletas", "aviso_umbral"]);
      if (p.estado === "sin_mes") throw new Error("hay mes");
      expect(p.porHacer.find((h) => h.clave === "aviso_umbral")!.texto).toBe(
        "Llevas S/\u00a01,400,000 vendidos este año, a S/\u00a0250,000 de las 300 UIT: habla con tu contador. Pasadas las 300 UIT, el pago a cuenta de renta deja de ser el 1 % de lo vendido. Mejor verlo antes de que pase."
      );
    });

    it("pasado el límite lo dice distinto: confirmar desde qué mes cambia", () => {
      const p = pulsoImpuestos({ ...PANEL, umbral: { ...aviso, ventasAnio: 1_700_000, avisoAlcanzado: false, anioCruzado: true } });
      if (p.estado === "sin_mes") throw new Error("hay mes");
      expect(p.porHacer.find((h) => h.clave === "aviso_umbral")!.texto).toContain("Pasaste las 300 UIT este año");
    });

    it("si el sistema empezó a mitad de año y lo de antes no está cargado, avisa que puede quedarse corto, con el enlace a donde se carga", () => {
      const p = pulsoImpuestos({ ...PANEL, umbral: { ...PANEL.umbral, primerMes: "2026-09" } });
      if (p.estado === "sin_mes") throw new Error("hay mes");
      const h = p.porHacer.find((x) => x.clave === "ventas_previas")!;
      expect(h.texto).toContain("El sistema tiene ventas desde septiembre 2026");
      expect(h.texto).toContain("puede quedarse corto");
      expect(h.href).toBe("/configuracion?tab=impuestos");
    });

    it("lo de antes ya confirmado (aunque sea cero) apaga esa advertencia", () => {
      const p = pulsoImpuestos({ ...PANEL, umbral: { ...PANEL.umbral, primerMes: "2026-09", previasConfirmadas: true } });
      expect(claves(p)).not.toContain("ventas_previas");
    });
  });
});
