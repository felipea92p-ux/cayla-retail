import { describe, expect, it } from "vitest";
import type { Comprobante } from "./comprobantes-reglas";
import { chipDelComprobante, textoDelNumero } from "./facturacion-actividad";

function comprobante(extra: Partial<Comprobante> = {}): Comprobante {
  return {
    id: "c1",
    tipo: "boleta",
    serie: "B004",
    numero: 11,
    cliente_tipo_doc: "sin_documento",
    cliente_num_doc: null,
    cliente_nombre: null,
    total: 537,
    estado: "pendiente",
    entorno_transmision: null,
    motivo_rechazo: null,
    motivo_anulacion: null,
    motivo_no_emitido: null,
    anulacion_solicitada_at: null,
    created_at: "2026-09-18T13:19:00Z",
    ubicacion_id: "u1",
    pdfUrl: null,
    xmlUrl: null,
    cdrUrl: null,
    ...extra,
  } as Comprobante;
}

describe("textoDelNumero", () => {
  it("serie, guion y correlativo de 6 dígitos: la misma fórmula de fn_ventas_del_dia", () => {
    expect(textoDelNumero({ serie: "B004", numero: 11 })).toBe("B004-000011");
    expect(textoDelNumero({ serie: "F001", numero: 123456 })).toBe("F001-123456");
  });
});

describe("chipDelComprobante (el mismo chip en el Resumen y en la vista Comprobantes)", () => {
  it("cualquier comprobante transmitido al sandbox lleva «prueba» y borde punteado, no solo el aceptado", () => {
    expect(chipDelComprobante(comprobante({ estado: "enviado", entorno_transmision: "sandbox" }))).toEqual({ tono: "neutro", texto: "Enviado a SUNAT · prueba", punteado: true });
    expect(chipDelComprobante(comprobante({ estado: "rechazado", entorno_transmision: "sandbox" }))).toEqual({ tono: "neutro", texto: "Rechazado · prueba", punteado: true });
  });

  it("una baja en trámite de un comprobante de prueba también lo dice", () => {
    expect(chipDelComprobante(comprobante({ estado: "aceptado", entorno_transmision: "sandbox", anulacion_solicitada_at: "2026-09-18T18:00:00Z" }))).toEqual({ tono: "neutro", texto: "Anulación en trámite · prueba", punteado: true });
  });

  it("uno pendiente (nunca se transmitió) no es de prueba", () => {
    expect(chipDelComprobante(comprobante({ estado: "pendiente", entorno_transmision: null }))).toEqual({ tono: "ambar", texto: "Pendiente de enviar", punteado: false });
  });

  it("cada estado con su etiqueta y su tono", () => {
    expect(chipDelComprobante(comprobante({ estado: "pendiente" }))).toEqual({ tono: "ambar", texto: "Pendiente de enviar", punteado: false });
    expect(chipDelComprobante(comprobante({ estado: "enviado" }))).toEqual({ tono: "ambar", texto: "Enviado a SUNAT", punteado: false });
    expect(chipDelComprobante(comprobante({ estado: "aceptado", entorno_transmision: "produccion" }))).toEqual({ tono: "verde", texto: "Aceptado", punteado: false });
    expect(chipDelComprobante(comprobante({ estado: "rechazado" }))).toEqual({ tono: "rojo", texto: "Rechazado", punteado: false });
    expect(chipDelComprobante(comprobante({ estado: "anulado" }))).toEqual({ tono: "apagado", texto: "Anulado", punteado: false });
    expect(chipDelComprobante(comprobante({ estado: "no_emitido" }))).toEqual({ tono: "apagado", texto: "No emitido", punteado: false });
  });

  it("aceptado con la baja pedida pero sin confirmar: «Anulación en trámite» en ámbar", () => {
    expect(chipDelComprobante(comprobante({ estado: "aceptado", entorno_transmision: "produccion", anulacion_solicitada_at: "2026-09-18T18:00:00Z" }))).toEqual({ tono: "ambar", texto: "Anulación en trámite", punteado: false });
  });
});
