import { describe, it, expect } from "vitest";
import { armarDetalleVenta, puedeImprimir, type FilasVenta } from "./venta-detalle-reglas";

// Reimprimir una venta vieja tiene que dar el MISMO papel que salió al cobrarla: mismos
// importes, IGV y vuelto. Lo único que puede faltar es lo que nunca se guardó (el vuelto
// de las ventas anteriores a `venta_pagos.recibido`).

const vestido = { sku: null, codigo: "VES-0001-NEG-M", talla: { valor: "M" }, color: { nombre: "Negro" }, producto: { referencia: "Vestido Sofía" } };
const pantalon = { sku: "SKU-9", codigo: null, talla: { valor: "30" }, color: { nombre: "Azul" }, producto: { referencia: "Pantalón Carla" } };

const filas: FilasVenta = {
  id: "v1",
  created_at: "2026-09-19T17:05:00Z",
  items: [
    { cantidad: 1, precio_unitario: 149.9, descuento_unitario: 0, variante: vestido },
    { cantidad: 2, precio_unitario: 50, descuento_unitario: 5, variante: pantalon },
  ],
  pagos: [
    { metodo: "efectivo", monto: 139.9, recibido: 150 },
    { metodo: "yape", monto: 100, recibido: null },
  ],
  comprobante: {
    tipo: "boleta",
    serie: "B002",
    numero: 9380,
    estado: "aceptado",
    created_at: "2026-09-19T17:05:01Z",
    cliente_tipo_doc: "dni",
    cliente_num_doc: "12345678",
    cliente_nombre: "Ana Pérez",
    motivo_rechazo: null,
    respuesta_sunat: { hash: "abc123=", pdfUrl: "https://x/y.pdf" },
  },
};
const ctx = { sede: "Tienda TRU", vendedor: "Rosa" };

describe("armarDetalleVenta", () => {
  const d = armarDetalleVenta(filas, ctx);

  it("el total es la suma de las líneas con su descuento", () => {
    expect(d.total).toBe(239.9); // 149.90 + 2 × (50 − 5)
    expect(d.prendas).toBe(3);
  });

  it("cada línea trae nombre, talla · color y el código de la prenda", () => {
    expect(d.lineas[0]).toMatchObject({ nombre: "Vestido Sofía", detalle: "M · Negro", codigo: "VES-0001-NEG-M", importe: 149.9 });
    expect(d.lineas[1]).toMatchObject({ nombre: "Pantalón Carla", codigo: "SKU-9", importe: 90 }); // sin código cae al SKU
  });

  it("con recibido guardado reconstruye el vuelto del efectivo", () => {
    expect(d.pagos[0]).toMatchObject({ metodo: "efectivo", monto: 139.9, recibido: 150, vuelto: 10.1 });
    expect(d.vueltoTotal).toBe(10.1);
  });

  it("los medios que no son efectivo no llevan recibido ni vuelto", () => {
    expect(d.pagos[1]).toMatchObject({ metodo: "yape", monto: 100, recibido: null, vuelto: 0 });
  });

  it("arma el recibo con el comprobante que la base asignó", () => {
    expect(d.recibo).not.toBeNull();
    expect(d.recibo).toMatchObject({ tipo: "boleta", serie: "B002", numero: 9380, sede: "Tienda TRU", total: 239.9 });
    expect(d.recibo?.cliente).toEqual({ tipoDoc: "dni", numDoc: "12345678", nombre: "Ana Pérez" });
    expect(d.recibo?.lineas[0]?.detalle).toBe("M · Negro");
  });

  it("expone el hash y el estado del comprobante", () => {
    expect(d.comprobante).toMatchObject({ estado: "aceptado", hash: "abc123=", motivoRechazo: null });
  });
});

describe("armarDetalleVenta — ventas viejas y casos raros", () => {
  it("sin recibido guardado (venta anterior a la columna) no inventa vuelto", () => {
    const d = armarDetalleVenta({ ...filas, pagos: [{ metodo: "efectivo", monto: 239.9, recibido: null }] }, ctx);
    expect(d.pagos[0]).toMatchObject({ recibido: null, vuelto: 0 });
    expect(d.vueltoTotal).toBe(0);
  });

  it("sin comprobante no hay recibo, pero el detalle se arma igual", () => {
    const d = armarDetalleVenta({ ...filas, comprobante: null }, ctx);
    expect(d.recibo).toBeNull();
    expect(d.comprobante).toBeNull();
    expect(d.total).toBe(239.9);
  });

  it("una nota de crédito no se reimprime como boleta: sin recibo", () => {
    const d = armarDetalleVenta({ ...filas, comprobante: { ...filas.comprobante!, tipo: "nota_credito" } }, ctx);
    expect(d.recibo).toBeNull();
  });

  it("una variante que ya no existe no rompe: código «sin código»", () => {
    const d = armarDetalleVenta(
      { ...filas, items: [{ cantidad: 1, precio_unitario: 10, descuento_unitario: 0, variante: null }], pagos: [{ metodo: "efectivo", monto: 10, recibido: null }] },
      ctx
    );
    expect(d.lineas[0]).toMatchObject({ nombre: "Prenda sin nombre", detalle: "", codigo: "sin código" });
  });

  it("un respuesta_sunat sin hash no lo inventa", () => {
    const d = armarDetalleVenta({ ...filas, comprobante: { ...filas.comprobante!, respuesta_sunat: null } }, ctx);
    expect(d.comprobante?.hash).toBeNull();
  });
});

describe("puedeImprimir — un papel que parece válido y no lo es, es peor que no imprimirlo", () => {
  it("aceptado imprime sin leyenda", () => {
    expect(puedeImprimir("aceptado")).toEqual({ ok: true, leyenda: null });
  });
  it("pendiente y enviado imprimen con la leyenda de validación", () => {
    for (const e of ["pendiente", "enviado"] as const) {
      expect(puedeImprimir(e)).toEqual({ ok: true, leyenda: "Comprobante pendiente de validación en SUNAT." });
    }
  });
  it("rechazado, anulado y no emitido no imprimen y dicen por qué", () => {
    for (const e of ["rechazado", "anulado", "no_emitido"] as const) {
      const r = puedeImprimir(e);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo.length).toBeGreaterThan(10);
    }
  });
});
