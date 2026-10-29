import { describe, expect, it } from "vitest";
import { MAX_MOTIVO_BAJA, laBajaAnulaLaVenta, mensajeBajaSinAnularLaVenta, motivoDeAnulacionDeVenta, motivoDeBajaInvalido, motivoParaNoAnularLaVenta, motivoParaNoPedirBaja, type DatosParaPedirBaja, type VentaDelComprobante } from "./anular-comprobante-reglas";

const listo: DatosParaPedirBaja = { veFacturacion: true, estado: "aceptado", anulacion_solicitada_at: null, notasVigentes: 0 };

describe("motivoParaNoPedirBaja — lo que se revisa antes de llamar a Lucode", () => {
  it("quien ve Facturación (ya no solo un líder, ADR-0534) con un comprobante aceptado, sin baja pedida ni notas: se puede pedir", () => {
    expect(motivoParaNoPedirBaja(listo)).toBeNull();
  });

  it("quien no ve Facturación recibe 403, aunque todo lo demás esté bien", () => {
    const r = motivoParaNoPedirBaja({ ...listo, veFacturacion: false });
    expect(r?.status).toBe(403);
    expect(r?.error).toMatch(/Facturación/);
    expect(r?.error).not.toMatch(/líder/i);
  });

  it("el permiso se mira primero: quien no ve Facturación no se entera del estado del comprobante", () => {
    expect(motivoParaNoPedirBaja({ ...listo, veFacturacion: false, estado: "rechazado", notasVigentes: 2 })?.status).toBe(403);
  });

  it.each(["pendiente", "pendiente_reintento", "enviado", "rechazado", "anulado", "no_emitido"] as const)(
    "un comprobante %s no se anula (409)",
    (estado) => {
      const r = motivoParaNoPedirBaja({ ...listo, estado });
      expect(r?.status).toBe(409);
      expect(r?.error).toContain(estado);
    },
  );

  it("una baja ya pedida y sin confirmar no se pide otra vez: se consulta", () => {
    const r = motivoParaNoPedirBaja({ ...listo, anulacion_solicitada_at: "2026-10-12T15:00:00Z" });
    expect(r?.status).toBe(409);
    expect(r?.error).toMatch(/en trámite/);
  });

  it("con una nota de crédito o débito vigente no se pide la baja", () => {
    const r = motivoParaNoPedirBaja({ ...listo, notasVigentes: 1 });
    expect(r?.status).toBe(409);
    expect(r?.error).toMatch(/nota/);
  });
});

describe("la baja anula la venta en el mismo acto (ADR-0016, act. 2026-10-14)", () => {
  const venta: VentaDelComprobante = { estado: "completada", cajaEstado: "abierta", diaVenta: "2026-10-14", hoy: "2026-10-14", tieneCambioODevolucion: false, veDevoluciones: true };

  it("solo una boleta o una factura con venta la anulan; una nota, una nota de venta o un comprobante a mano, no", () => {
    expect(laBajaAnulaLaVenta("boleta", "v1")).toBe(true);
    expect(laBajaAnulaLaVenta("factura", "v1")).toBe(true);
    expect(laBajaAnulaLaVenta("boleta", null)).toBe(false);
    expect(laBajaAnulaLaVenta("boleta", undefined)).toBe(false);
    expect(laBajaAnulaLaVenta("nota_credito", "v1")).toBe(false);
    expect(laBajaAnulaLaVenta("nota_debito", "v1")).toBe(false);
    expect(laBajaAnulaLaVenta("nota_venta", "v1")).toBe(false);
  });

  it("caja abierta, mismo día, sin cambio ni devolución y con Devoluciones: la venta se anula junto con la baja", () => {
    expect(motivoParaNoAnularLaVenta(venta)).toBeNull();
  });

  it("una venta ya anulada no frena nada: la baja va sola", () => {
    expect(motivoParaNoAnularLaVenta({ ...venta, estado: "anulada", cajaEstado: "cerrada", diaVenta: "2026-10-01" })).toBeNull();
  });

  it("sin el módulo Devoluciones, 403 y la baja no se pide", () => {
    expect(motivoParaNoAnularLaVenta({ ...venta, veDevoluciones: false })?.status).toBe(403);
  });

  it.each([null, "cerrada", "cuadrando"])("con la caja de la venta %s, 409 y manda a Devolución", (cajaEstado) => {
    const r = motivoParaNoAnularLaVenta({ ...venta, cajaEstado });
    expect(r?.status).toBe(409);
    expect(r?.error).toMatch(/caja .* cerró/);
    expect(r?.error).toMatch(/Devolución/);
  });

  it("una venta de otro día (Lima), 409 y manda a Devolución", () => {
    const r = motivoParaNoAnularLaVenta({ ...venta, diaVenta: "2026-10-13" });
    expect(r?.status).toBe(409);
    expect(r?.error).toMatch(/otro día/);
    expect(r?.error).toMatch(/Devolución/);
  });

  it("con un cambio o una devolución ya registrados, 409", () => {
    const r = motivoParaNoAnularLaVenta({ ...venta, tieneCambioODevolucion: true });
    expect(r?.status).toBe(409);
    expect(r?.error).toMatch(/cambio o una devolución/);
  });

  it("el motivo de la venta anulada nombra el comprobante con su número completo y el motivo de la baja", () => {
    expect(motivoDeAnulacionDeVenta("B005", 202, "  era factura, no boleta ")).toBe("Comprobante B005-000202 dado de baja: era factura, no boleta");
  });
});

// Chaos del PR #1094 (2026-10-27): un motivo de 5000 letras se guardaba completo en el comprobante y en la venta, y el aviso de «la venta no se pudo anular»
// mandaba a Historial, que con la caja cerrada también la rechaza.
describe("motivoDeBajaInvalido — el motivo tiene piso y tope antes de llamar a Lucode", () => {
  it("un motivo normal pasa", () => {
    expect(motivoDeBajaInvalido("era factura, no boleta")).toBeNull();
  });

  it("menos de 3 letras, 400 con el aviso de siempre", () => {
    expect(motivoDeBajaInvalido("ab")).toMatch(/necesita un motivo/);
    expect(motivoDeBajaInvalido("")).toMatch(/necesita un motivo/);
  });

  it("justo en el tope pasa; una letra más, no", () => {
    expect(motivoDeBajaInvalido("ñ".repeat(MAX_MOTIVO_BAJA))).toBeNull();
    expect(motivoDeBajaInvalido("ñ".repeat(MAX_MOTIVO_BAJA + 1))).toMatch(new RegExp(`${MAX_MOTIVO_BAJA}`));
  });

  it("el motivo con el que queda la venta (con el prefijo del comprobante) sigue cabiendo en el tope de la baja más su encabezado", () => {
    const venta = motivoDeAnulacionDeVenta("B005", 202, "ñ".repeat(MAX_MOTIVO_BAJA));
    expect(venta.length).toBeLessThan(MAX_MOTIVO_BAJA + 60);
  });
});

describe("mensajeBajaSinAnularLaVenta — cuando la baja ya quedó guardada y la venta no se anuló", () => {
  it("con la caja cerrada manda a Devolución, no a Historial (que también la rechaza)", () => {
    const m = mensajeBajaSinAnularLaVenta("PENDIENTE", "La caja de esta venta ya cerró — a partir de ahí, usa Cambio o Devolución");
    expect(m).toMatch(/Devolución/);
    expect(m).not.toMatch(/Historial/);
    expect(m).toMatch(/no vuelvas a pedir la baja/i);
    expect(m).toMatch(/PENDIENTE/);
  });

  it("si la venta ya estaba anulada (otra petición llegó antes) no suena a alarma: dice que ya quedó anulada", () => {
    const m = mensajeBajaSinAnularLaVenta("PENDIENTE", "Esta venta ya está anulada");
    expect(m).toMatch(/ya estaba anulada/);
    expect(m).not.toMatch(/no se pudo anular/);
    expect(m).toMatch(/no vuelvas a pedir la baja/i);
  });

  it("con cualquier otra causa dice la causa tal cual y no promete nada que no sabe", () => {
    const m = mensajeBajaSinAnularLaVenta("ACEPTADO", "Stock insuficiente");
    expect(m).toMatch(/Stock insuficiente/);
    expect(m).toMatch(/Devoluciones/);
  });
});
