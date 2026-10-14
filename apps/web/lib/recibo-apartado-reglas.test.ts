import { describe, expect, it } from "vitest";
import { reciboDeApartado, type ComprobanteDeApartado } from "./recibo-apartado-reglas";
import type { Apartado } from "./separaciones-reglas";

const apartado = {
  id: "s1", codigo: "APT-LIM-0002", estado: "entregada", nombres: "Beatriz", apellidos: "Prueba", celular: "", dni: "70124598", asesora: "Felipe Alvarez",
  total: 79.9, adelanto: 24, saldo: 55.9, venceEl: "2026-10-21", extensiones: 0, creadaEn: "2026-10-14T15:00:00Z", devolucionMedio: "yape",
  devolucionNumero: null, devolucionCciFinal: null, liberadaSola: false, comprobanteAnticipo: null, comprobanteFinal: "B005-000301", notaCredito: null,
  prendas: [{ itemId: "i1", varianteId: "v1", sku: "CMS-0001-NEG-M", referencia: "Blusa Emma", cantidad: 1, precioUnitario: 79.9, descuentoUnitario: 0 }],
  pagos: [{ metodo: "yape", monto: 24, fecha: null, abono: false }], estante: null,
} as unknown as Apartado;

const comp: ComprobanteDeApartado = {
  tipo: "boleta", serie: "B005", numero: 301, created_at: "2026-10-21T21:05:00Z",
  cliente_tipo_doc: "dni", cliente_num_doc: "70124598", cliente_nombre: "Beatriz Prueba Quispe",
};

describe("reciboDeApartado (ADR-0399: la boleta de la entrega sale por el total y no nombra el adelanto)", () => {
  it("el total, el IGV y el subtotal son los de la boleta de S/ 79.90 (no el saldo)", () => {
    const r = reciboDeApartado(apartado, comp, "Tienda Lima");
    expect(r).toMatchObject({ tipo: "boleta", serie: "B005", numero: 301, total: 79.9, subtotal: 67.71, igv: 12.19, sede: "Tienda Lima" });
    expect(r.lineas).toHaveLength(1);
  });
  it("no trae pagos: el papel no dice cómo se pagó ni cuánto fue el adelanto", () => {
    const r = reciboDeApartado(apartado, comp, "Tienda Lima");
    expect(r.pagos).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/anticipo|adelanto/i);
  });
  it("el cliente sale del comprobante (una factura lleva RUC y razón social)", () => {
    const r = reciboDeApartado(apartado, { ...comp, tipo: "factura", cliente_tipo_doc: "ruc", cliente_num_doc: "20123456789", cliente_nombre: "Moda Norte SAC" }, "Tienda Lima");
    expect(r.cliente).toEqual({ tipoDoc: "ruc", numDoc: "20123456789", nombre: "Moda Norte SAC" });
    expect(r.tipo).toBe("factura");
  });
  it("el redondeo del efectivo, si lo hubo, se conserva y no toca el total", () => {
    expect(reciboDeApartado(apartado, comp, "Tienda Lima", 0.08)).toMatchObject({ redondeo: 0.08, total: 79.9 });
  });
});
