import { describe, expect, it } from "vitest";
import { motivoParaNoTransmitir, type ComprobanteParaTransmitir } from "./transmision-reglas";

function comprobante(extra: Partial<ComprobanteParaTransmitir> = {}): ComprobanteParaTransmitir {
  return { estado: "pendiente", venta_id: "v1", venta: { estado: "completada" }, ...extra };
}

describe("motivoParaNoTransmitir", () => {
  it("un pendiente de una venta completada se transmite", () => {
    expect(motivoParaNoTransmitir(comprobante())).toBeNull();
  });

  it("un rechazado de una venta completada se puede reintentar (ADR-0093)", () => {
    expect(motivoParaNoTransmitir(comprobante({ estado: "rechazado" }))).toBeNull();
  });

  it("enviado, aceptado, anulado y no emitido no se vuelven a transmitir, y lo dicen con su estado", () => {
    for (const estado of ["enviado", "aceptado", "anulado", "no_emitido"]) {
      expect(motivoParaNoTransmitir(comprobante({ estado }))).toEqual({ error: `Este comprobante ya está en estado "${estado}" — no se vuelve a transmitir.`, status: 409 });
    }
  });

  it("nunca el comprobante de una venta ANULADA: sea pendiente o rechazado", () => {
    for (const estado of ["pendiente", "rechazado"]) {
      const r = motivoParaNoTransmitir(comprobante({ estado, venta: { estado: "anulada" } }));
      expect(r?.status).toBe(409);
      expect(r?.error).toMatch(/venta de este comprobante está anulada/);
    }
  });

  it("si la venta existe pero no se pudo leer, se niega y pide reintentar: ante la duda no se declara nada", () => {
    expect(motivoParaNoTransmitir(comprobante({ venta: null }))).toEqual({ error: "No se pudo comprobar si la venta de este comprobante sigue vigente. Reintenta.", status: 503 });
  });

  it("si la venta llega en otra forma (sin el embebido, un arreglo, sin estado) se niega igual: el fallo es cerrado, no abierto", () => {
    for (const venta of [undefined, [], [{ estado: "completada" }], {}]) {
      expect(motivoParaNoTransmitir(comprobante({ venta: venta as never }))?.status).toBe(503);
    }
  });

  it("un comprobante que no nació de una venta (manual) se transmite sin mirar ninguna venta", () => {
    expect(motivoParaNoTransmitir(comprobante({ venta_id: null, venta: null }))).toBeNull();
  });

  it("el estado del comprobante manda sobre la venta: uno ya aceptado dice eso, no que la venta está anulada", () => {
    expect(motivoParaNoTransmitir(comprobante({ estado: "aceptado", venta: { estado: "anulada" } }))?.error).toMatch(/ya está en estado "aceptado"/);
  });
});
