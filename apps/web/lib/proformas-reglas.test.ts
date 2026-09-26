import { describe, it, expect } from "vitest";
import { lineasDeLaProforma, marcarPorVencer, numeroDeProforma, precioAlCobrarDeLaProforma, totalesDeLineas, type LineaProforma, type ProformaFila } from "./proformas-reglas";

const linea = (extra: Partial<LineaProforma> = {}): LineaProforma => ({
  variante_id: "v1",
  cantidad: 1,
  precio_unitario: 179.9,
  descuento_unitario: 0,
  motivo_descuento: null,
  motivo_descuento_detalle: null,
  descripcion: "Casaca Ximena · M · Negro",
  codigo: "CAS-0001-NEG-M",
  ...extra,
});

const AHORA = Date.parse("2026-09-19T15:00:00Z");
const HORA = 3600 * 1000;
const en = (horas: number) => new Date(AHORA + horas * HORA).toISOString();

function proforma(sobre: Partial<ProformaFila>): ProformaFila {
  return {
    id: "p1",
    ubicacion_id: "u1",
    cliente_nombre: null,
    cliente_num_doc: null,
    total: 100,
    estado: "vigente",
    comprobante_id: null,
    created_at: "2026-09-10T15:00:00Z",
    vence_at: null,
    numero: null,
    nota: null,
    venta_id: null,
    items: [],
    ...sobre,
  };
}

describe("marcarPorVencer — «vencida» y «por vencer» son dos mitades distintas de las vigentes", () => {
  it("una vigente cuyo vence_at ya pasó es vencida, y no está por vencer", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(-1) })], AHORA);
    expect(p.vencida).toBe(true);
    expect(p.porVencer).toBe(false);
  });

  it("en el mismo instante en que vence ya cuenta como vencida", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(0) })], AHORA);
    expect(p.vencida).toBe(true);
    expect(p.porVencer).toBe(false);
  });

  it("una vigente que vence dentro de las 48 h está por vencer, no vencida", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(24) })], AHORA);
    expect(p.porVencer).toBe(true);
    expect(p.vencida).toBe(false);
  });

  it("una vigente que vence más allá de las 48 h no es ninguna de las dos", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(24 * 10) })], AHORA);
    expect(p.porVencer).toBe(false);
    expect(p.vencida).toBe(false);
  });

  it("sin fecha de vencimiento nunca vence", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: null })], AHORA);
    expect(p.porVencer).toBe(false);
    expect(p.vencida).toBe(false);
  });

  it("una convertida o anulada con fecha pasada no es vencida: ya no espera a nadie", () => {
    const filas = [proforma({ id: "a", estado: "convertida", vence_at: en(-5) }), proforma({ id: "b", estado: "anulada", vence_at: en(-5) })];
    for (const p of marcarPorVencer(filas, AHORA)) {
      expect(p.vencida).toBe(false);
      expect(p.porVencer).toBe(false);
    }
  });

  it("conserva el resto de la fila tal como vino", () => {
    const [p] = marcarPorVencer([proforma({ id: "z", total: 250, vence_at: en(10) })], AHORA);
    expect(p).toMatchObject({ id: "z", total: 250 });
  });
});

describe("lineasDeLaProforma", () => {
  it("lee las líneas con prenda", () => {
    expect(lineasDeLaProforma([linea()])).toEqual([linea()]);
  });
  it("formato anterior (una línea «Venta» sin prenda) → null", () => {
    expect(lineasDeLaProforma([{ descripcion: "Venta", cantidad: 1, precio_unitario: 7000 }])).toBeNull();
    expect(lineasDeLaProforma(null)).toBeNull();
    expect(lineasDeLaProforma([])).toBeNull();
  });
});

describe("totalesDeLineas (la misma cuenta que hace crear_proforma)", () => {
  it("suma (precio − descuento) × cantidad y separa el IGV del total", () => {
    const t = totalesDeLineas([linea({ descuento_unitario: 18 }), linea({ precio_unitario: 79.9, cantidad: 2 }), linea({ precio_unitario: 109.9 })]);
    expect(t).toEqual({ total: 431.6, igv: 65.84, subtotal: 365.76, descuentos: 18, prendas: 4 });
  });
});

describe("numeroDeProforma", () => {
  it("rellena a seis dígitos", () => {
    expect(numeroDeProforma(123)).toBe("PRO-000123");
    expect(numeroDeProforma(null)).toBe("PRO-—");
  });
});

describe("precioAlCobrarDeLaProforma", () => {
  it("mismo precio: conserva el descuento y el motivo de la proforma", () => {
    const l = linea({ descuento_unitario: 18, motivo_descuento: "cerrar_venta" });
    expect(precioAlCobrarDeLaProforma(l, 179.9, "PRO-000123")).toEqual({ precioUnitario: 179.9, descuentoUnitario: 18, motivo: "cerrar_venta", motivoDetalle: "" });
  });
  it("subió de precio: cobra lo de la proforma, la diferencia es descuento «otro»", () => {
    const l = linea({ descuento_unitario: 18, motivo_descuento: "cerrar_venta" });
    expect(precioAlCobrarDeLaProforma(l, 199.9, "PRO-000123")).toEqual({ precioUnitario: 199.9, descuentoUnitario: 38, motivo: "otro", motivoDetalle: "Precio de la proforma PRO-000123" });
  });
  it("bajó de precio por debajo de lo cotizado: paga el precio nuevo, sin descuento", () => {
    const l = linea({ descuento_unitario: 18, motivo_descuento: "cerrar_venta" });
    expect(precioAlCobrarDeLaProforma(l, 150, "PRO-000123")).toEqual({ precioUnitario: 150, descuentoUnitario: 0, motivo: "", motivoDetalle: "" });
  });
  it("sin descuento y mismo precio: línea limpia", () => {
    expect(precioAlCobrarDeLaProforma(linea(), 179.9, "PRO-000001")).toEqual({ precioUnitario: 179.9, descuentoUnitario: 0, motivo: "", motivoDetalle: "" });
  });
});
