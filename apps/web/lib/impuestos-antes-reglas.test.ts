import { describe, expect, it } from "vitest";
import type { MesIgv, PanelImpuestos } from "./impuestos-reglas";
import { antesDeDeclarar } from "./impuestos-antes-reglas";

const mes = (p: Partial<MesIgv> = {}): MesIgv => ({
  mes: "2026-09", comprobantes: 629, baseVentas: 89000, igvVentas: 16020, igvNotasCredito: 0, debito: 16020,
  creditoMercaderia: 6000, creditoGastos: 1620, creditoActivos: 0, creditoTaller: 0, creditoNotas: 0, credito: 7620,
  saldoAnterior: 0, aPagar: 8400, saldoAFavor: 0, ...p,
});
const SIN_NADA: PanelImpuestos["revisar"] = {
  boletas: { n: 0, total: 0, gastos: 0, proveedores: [] },
  sinAceptar: { n: 0, total: 0 },
  rechazados: { n: 0, total: 0 },
  sinComprobante: { n: 0, total: 0, alegra: 0 },
  honorarios: { n: 0, total: 0, mayores: 0 },
  igvPerdido: { n: 0, igv: 0 },
};
const PANEL: PanelImpuestos = {
  hoy: "2026-10-15", mes: "2026-09", mesActual: "2026-10", foco: mes(), historial: [],
  parametros: { igv: { valor: 0.18, provisional: false }, uit: { valor: 5500, provisional: false, anio: 2026 }, umbralUit: { valor: 300, provisional: false }, regimen: { texto: "rmt", provisional: false }, renta: { valor: 0.01, provisional: false }, avisoUmbralUit: { valor: 250, provisional: false } },
  umbral: { anio: 2026, ventasAnio: 900000, ventasAnioErp: 900000, ajuste: 0, umbralSoles: 1650000, avance: 0.5455, cruzado: false, primerMes: "2025-10", ventasMeses: [], avisoSoles: 1375000, avisoAlcanzado: false },
  renta: { base: 89000, tasa: 0.01, monto: 890 },
  revisar: SIN_NADA,
};
const con = (revisar: Partial<PanelImpuestos["revisar"]>, extra: Partial<PanelImpuestos> = {}) => antesDeDeclarar({ ...PANEL, ...extra, revisar: { ...SIN_NADA, ...revisar } });
const ids = (l: ReturnType<typeof antesDeDeclarar>) => l.map((x) => x.id);

describe("antesDeDeclarar: una sola lista", () => {
  it("sin nada pendiente, la lista está vacía (ya no sale «honorarios» de relleno)", () => {
    expect(antesDeDeclarar(PANEL)).toEqual([]);
  });

  it("todo junto: primero lo que frena (SUNAT lo rechazó), después lo que puede hacer pagar de más", () => {
    const l = con({
      boletas: { n: 2, total: 1200, gastos: 2, proveedores: ["Ferretería Lima", "Bazar Sol", "Otro"] },
      sinAceptar: { n: 1, total: 80 },
      rechazados: { n: 1, total: 118 },
      sinComprobante: { n: 2, total: 460, alegra: 1 },
      honorarios: { n: 1, total: 1800, mayores: 1 },
      igvPerdido: { n: 1, igv: 360 },
    });
    expect(ids(l)).toEqual(["rechazados", "sin_aceptar", "sin_comprobante", "boletas", "igv_perdido", "honorarios"]);
    expect(l.map((x) => x.estado)).toEqual(["frena", "avisa", "avisa", "avisa", "avisa", "avisa"]);
    expect(l.every((x) => x.modulo === "impuestos")).toBe(true);
  });

  it("los comprobantes llevan a Comprobantes de Vender (la ruta que existe), nunca a /ventas/…", () => {
    const l = con({ sinAceptar: { n: 1, total: 80 }, rechazados: { n: 1, total: 118 }, sinComprobante: { n: 2, total: 460, alegra: 0 } });
    expect(l.map((x) => x.href)).toEqual(["/vender/comprobantes", "/vender/comprobantes", "/vender/comprobantes"]);
    expect(l.map((x) => x.verbo)).toEqual(["Ver en Comprobantes", "Ver en Comprobantes", "Ver en Comprobantes"]);
  });

  it("las compras con boleta nombran a dos proveedores y llevan a los gastos del mes que se mira", () => {
    const [b] = con({ boletas: { n: 2, total: 1200, gastos: 2, proveedores: ["Ferretería Lima", "Bazar Sol", "Otro"] } });
    expect(b!.detalle).toBe("Una boleta no deja descontar IGV. Si el proveedor emite factura, pídela: Ferretería Lima y Bazar Sol.");
    expect(b!.href).toBe("/finanzas/gastos?mes=2026-09&ver=todas");
  });

  it("boletas que no son gastos (mercadería): se avisa, sin botón a Gastos", () => {
    const [b] = con({ boletas: { n: 1, total: 300, gastos: 0, proveedores: [] } });
    expect(b).toMatchObject({ titulo: "1 compra con boleta (S/ 300)", verbo: null, href: null });
    expect(b!.detalle).toBe("Una boleta no deja descontar IGV. Si el proveedor emite factura, pídela.");
  });

  it("el IGV perdido por pagar en efectivo dice cuánto y que ya está restado", () => {
    const [x] = con({ igvPerdido: { n: 2, igv: 720 } });
    expect(x!.titulo).toBe("S/ 720 de IGV que no se descuenta");
    expect(x!.detalle).toContain("2 facturas de S/ 2,000 o más pagadas en efectivo");
  });

  describe("el aviso anticipado del límite", () => {
    const aviso = { ...PANEL.umbral, ventasAnioErp: 1_400_000, ventasAnio: 1_400_000, avisoAlcanzado: true, avance: 0.8485 };

    it("lejos del aviso no dice nada", () => {
      expect(ids(antesDeDeclarar(PANEL))).not.toContain("aviso_umbral");
    });

    it("entre el aviso y el límite: «habla con tu contador», con lo que falta y qué cuenta", () => {
      const l = con({}, { umbral: aviso });
      const x = l.find((p) => p.id === "aviso_umbral")!;
      expect(x.titulo).toBe("Llevas S/ 1,400,000 vendidos este año, a S/ 250,000 de las 300 UIT: habla con tu contador.");
      expect(x.detalle).toBe("Pasadas las 300 UIT, el pago a cuenta de renta deja de ser el 1 % de lo vendido. Mejor verlo antes de que pase. El aviso cuenta lo registrado en el sistema: puede quedar por debajo de la cifra real.");
      expect(x.href).toBeNull();
    });

    it("pasado el límite lo dice distinto", () => {
      const l = con({}, { umbral: { ...aviso, ventasAnio: 1_700_000, avisoAlcanzado: false, cruzado: true, avance: 1.03 } });
      expect(l.find((p) => p.id === "aviso_umbral")!.titulo).toContain("Pasaste las 300 UIT este año");
    });

    it("empiece cuando empiece el sistema, no agrega un pendiente extra", () => {
      for (const primerMes of [null, "2026-09", "2026-01", "2025-03"]) expect(ids(con({}, { umbral: { ...aviso, primerMes } }))).toEqual(["aviso_umbral"]);
    });
  });
});
