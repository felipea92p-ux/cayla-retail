import { describe, expect, it } from "vitest";
import { accionPorBaja, accionPorEmision, queConsultar } from "./consulta-sunat-reglas";

const fila = (estado: string, baja: string | null = null, entorno: string | null = "produccion") => ({
  estado,
  anulacion_solicitada_at: baja,
  entorno_transmision: entorno,
});

describe("queConsultar", () => {
  it("un enviado se consulta por su emisión (el caso de B001-113…192)", () => {
    expect(queConsultar(fila("enviado"), "produccion")).toBe("emision");
  });

  it("un aceptado con baja pedida se consulta por su baja (el caso de B001-1)", () => {
    expect(queConsultar(fila("aceptado", "2026-09-29T21:02:44Z"), "produccion")).toBe("baja");
  });

  it("un aceptado sin baja, un anulado, un rechazado o un pendiente no se consultan", () => {
    for (const estado of ["aceptado", "anulado", "rechazado", "pendiente", "pendiente_reintento", "no_emitido", "interna"]) {
      expect(queConsultar(fila(estado), "produccion")).toBeNull();
    }
  });

  it("nunca cruza de ambiente ni consulta lo que no se transmitió", () => {
    expect(queConsultar(fila("enviado", null, "sandbox"), "produccion")).toBeNull();
    expect(queConsultar(fila("enviado", null, "produccion"), "sandbox")).toBeNull();
    expect(queConsultar(fila("enviado", null, null), "produccion")).toBeNull();
  });
});

describe("accionPorEmision", () => {
  it("ACEPTADO pasa a aceptado", () => {
    expect(accionPorEmision("ACEPTADO", null)).toEqual({ tipo: "actualizar", estado: "aceptado", motivoRechazo: null });
  });

  it("RECHAZADO pasa a rechazado con el motivo de SUNAT, o uno que dice de dónde salió", () => {
    expect(accionPorEmision("RECHAZADO", "El comprobante ya fue informado")).toEqual({
      tipo: "actualizar",
      estado: "rechazado",
      motivoRechazo: "El comprobante ya fue informado",
    });
    const sinMensaje = accionPorEmision("RECHAZADO", "  ");
    expect(sinMensaje.tipo === "actualizar" && sinMensaje.motivoRechazo).toMatch(/consultar su estado/);
  });

  it("PENDIENTE no escribe nada: se vuelve a preguntar", () => {
    expect(accionPorEmision("PENDIENTE", "Espere unos minutos")).toEqual({ tipo: "nada" });
  });
});

describe("accionPorBaja", () => {
  it("solo la baja confirmada escribe", () => {
    expect(accionPorBaja("confirmada")).toEqual({ tipo: "confirmar_baja" });
    expect(accionPorBaja("en_tramite")).toEqual({ tipo: "nada" });
    expect(accionPorBaja("no_anulado")).toEqual({ tipo: "nada" });
  });
});
