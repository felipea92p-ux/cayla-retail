import { describe, expect, it } from "vitest";
import { compraParaPagarMiParte, detalleMiParteDeJson, parteDeFila, parteDelDetalle, partesPorPagar, type FilaParteDeCompra } from "./compras-mi-parte-reglas";

const FILA: FilaParteDeCompra = {
  compra_id: "c1",
  documento: "F001-123",
  tipo: "factura",
  proveedor_id: "p1",
  proveedor_nombre: "Textiles Andina SAC",
  fecha_emision: "2026-09-20",
  fecha_vencimiento: "2026-10-20",
  estado: "vigente",
  gestora_id: "lima",
  gestora_nombre: "Tienda Lima",
  ubicacion_id: "tru",
  ubicacion_nombre: "Tienda Trujillo",
  unidades: 12,
  total: "708.00",
  pagado: "100.00",
  saldo: "608.00",
  registrada_en: "2026-09-20T10:00:00Z",
  parte_nueva: false,
};

describe("mi parte en un comprobante de otra tienda (ADR-0179, F3-b)", () => {
  it("convierte la fila de la base: los montos (que llegan como texto) a número y la gestora con nombre", () => {
    const p = parteDeFila(FILA);
    expect(p).toMatchObject({ total: 708, pagado: 100, saldo: 608, gestoraNombre: "Tienda Lima", ubicacionId: "tru", vigente: true, tipo: "factura" });
  });

  it("sin gestora ni documento no se rompe", () => {
    const p = parteDeFila({ ...FILA, gestora_nombre: null, documento: null, tipo: "rara" });
    expect(p.gestoraNombre).toBe("otra tienda");
    expect(p.documento).toBe("—");
    expect(p.tipo).toBe("factura");
  });

  it("por pagar: solo las vigentes con saldo", () => {
    const partes = [parteDeFila(FILA), parteDeFila({ ...FILA, compra_id: "c2", saldo: "0" }), parteDeFila({ ...FILA, compra_id: "c3", estado: "anulada" })];
    expect(partesPorPagar(partes).map((p) => p.compraId)).toEqual(["c1"]);
  });

  it("para pagar, el «comprobante» lleva MI saldo y MI total (el modal no deja pasar de ahí) y dice de qué tienda es la parte", () => {
    const c = compraParaPagarMiParte(parteDeFila(FILA));
    expect(c.saldo).toBe(608);
    expect(c.total).toBe(708);
    expect(c.estadoPago).toBe("parcial");
    expect(c.documento).toBe("F001-123 · parte de Tienda Trujillo");
    expect(c.id).toBe("c1");
  });

  it("el detalle se lee del JSON de la base y cada parte se puede pagar", () => {
    const d = detalleMiParteDeJson({
      compra: { id: "c1", documento: "F001-123", tipo: "factura", fecha_emision: "2026-09-20", fecha_vencimiento: null, estado: "vigente", proveedor_id: "p1", proveedor_nombre: "Textiles", gestora_nombre: "Tienda Lima" },
      partes: [{ ubicacion_id: "tru", ubicacion_nombre: "Tienda Trujillo", unidades: 12, subtotal: 600, igv: 108, total: 708, pagado: 0, saldo: 708 }],
      lineas: [{ ubicacion_id: "tru", referencia: "EMMA", talla: "M", color: "Negro", descripcion: null, costo_unitario: 50, cantidad: 12, subtotal: 600 }],
      pagos: [],
    });
    expect(d.lineas[0]).toMatchObject({ cantidad: 12, costoUnitario: 50, talla: "M" });
    const p = parteDelDetalle(d, 0);
    expect(p).toMatchObject({ compraId: "c1", ubicacionId: "tru", saldo: 708, gestoraNombre: "Tienda Lima" });
    expect(compraParaPagarMiParte(p).estadoPago).toBe("pendiente");
  });
});
