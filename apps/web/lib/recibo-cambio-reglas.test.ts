import { describe, expect, it } from "vitest";
import { reciboDeCambio, textoReferenciaCambio, type BoletaDelCambio } from "./recibo-cambio-reglas";

const boleta = (items: unknown): BoletaDelCambio => ({
  tipo: "boleta",
  serie: "B001",
  numero: 45,
  created_at: "2026-11-16T15:00:00Z",
  cliente_tipo_doc: "dni",
  cliente_num_doc: "45879632",
  cliente_nombre: "Ana Pérez",
  items,
});
const nombres = new Map([
  ["v-blusa", { referencia: "Blusa Emma", codigo: "BLU-0001-NEG-S" }],
  ["v-vestido", { referencia: "Vestido Sofi", codigo: "VES-0002-NEG-M" }],
]);

describe("reciboDeCambio", () => {
  it("la boleta del cambio sale con sus prendas, el mismo cliente y sin forma de pago (el papel dice CANCELADO)", () => {
    const r = reciboDeCambio(
      boleta([
        { variante_id: "v-blusa", cantidad: 1, precio_unitario: 79.9, descuento_unitario: 10 },
        { variante_id: "v-vestido", cantidad: 1, precio_unitario: 149.9, descuento_unitario: 0 },
      ]),
      nombres,
      "Tienda Lima",
      "Micaela",
    );
    expect(r).not.toBeNull();
    expect(r!.total).toBe(219.8);
    expect(r!.lineas.map((l) => [l.descripcion, l.importe])).toEqual([["Blusa Emma", 69.9], ["Vestido Sofi", 149.9]]);
    expect(r!.pagos).toEqual([]);
    expect(r!.cliente).toEqual({ tipoDoc: "dni", numDoc: "45879632", nombre: "Ana Pérez" });
    expect(r!.subtotal + r!.igv).toBeCloseTo(219.8, 2);
    expect(r!.atendio).toBe("Micaela");
  });

  it("si una prenda no se puede nombrar, no arma el papel (se ve en Comprobantes)", () => {
    expect(reciboDeCambio(boleta([{ variante_id: "otra", cantidad: 1, precio_unitario: 50 }]), nombres, "Tienda Lima", null)).toBeNull();
    expect(reciboDeCambio(boleta([]), nombres, "Tienda Lima", null)).toBeNull();
    expect(reciboDeCambio(boleta(null), nombres, "Tienda Lima", null)).toBeNull();
    expect(reciboDeCambio(boleta([{ variante_id: "v-blusa", cantidad: "1", precio_unitario: 79.9 }]), nombres, "Tienda Lima", null)).toBeNull();
  });
});

describe("textoReferenciaCambio", () => {
  it("nombra la compra y la nota de crédito", () => {
    expect(textoReferenciaCambio("Boleta B001-000012", { serie: "BC01", numero: 3 })).toBe("Cambio de la Boleta B001-000012 · Nota de crédito BC01-000003");
  });
  it("sin la nota, solo la compra; sin nada, «Cambio de prenda»", () => {
    expect(textoReferenciaCambio("Boleta B001-000012", null)).toBe("Cambio de la Boleta B001-000012");
    expect(textoReferenciaCambio(null, null)).toBe("Cambio de prenda");
  });
});
