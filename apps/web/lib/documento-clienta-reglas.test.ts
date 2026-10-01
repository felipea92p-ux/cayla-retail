import { describe, expect, it } from "vitest";
import {
  ajustarNumeroAlTipo,
  documentoLegible,
  documentoParaComprobante,
  esTipoDocumentoClienta,
  largoMaximoDocumento,
  normalizarNumeroDocumento,
  problemaDocumento,
  tipoDocumentoDe,
} from "./documento-clienta-reglas";

describe("documento de la clienta (ADR-0288 D-2): las mismas reglas que la base", () => {
  it("normaliza como la base: sin espacios y en mayúsculas", () => {
    expect(normalizarNumeroDocumento(" ab 12 34 56 ")).toBe("AB123456");
    expect(normalizarNumeroDocumento("71234482")).toBe("71234482");
  });

  it("el DNI tiene 8 dígitos", () => {
    expect(problemaDocumento("dni", "71234482")).toBeNull();
    expect(problemaDocumento("dni", "7123448")).toBe("El DNI tiene 8 dígitos.");
    expect(problemaDocumento("dni", "7123448A")).toBe("El DNI tiene 8 dígitos.");
    expect(problemaDocumento("dni", "712344821")).toBe("El DNI tiene 8 dígitos.");
  });

  it("carné y pasaporte: de 6 a 12 letras o números, sin guiones", () => {
    expect(problemaDocumento("carne_extranjeria", "001234567")).toBeNull();
    expect(problemaDocumento("pasaporte", "ab123456")).toBeNull();
    expect(problemaDocumento("pasaporte", "AB-12345")).toMatch(/pasaporte tiene de 6 a 12/);
    expect(problemaDocumento("carne_extranjeria", "12345")).toMatch(/carné de extranjería tiene de 6 a 12/);
    expect(problemaDocumento("pasaporte", "A".repeat(13))).not.toBeNull();
  });

  it("vacío es válido: registrar a una clienta no exige documento", () => {
    expect(problemaDocumento("dni", "")).toBeNull();
    expect(problemaDocumento("pasaporte", "   ")).toBeNull();
  });

  it("el largo del campo sigue al tipo", () => {
    expect(largoMaximoDocumento("dni")).toBe(8);
    expect(largoMaximoDocumento("pasaporte")).toBe(12);
  });

  it("la caja del número solo deja lo que el tipo admite, hasta su largo", () => {
    expect(ajustarNumeroAlTipo("dni", "71 234-482 9")).toBe("71234482");
    expect(ajustarNumeroAlTipo("pasaporte", " ab-12 3456 ")).toBe("AB123456");
    expect(ajustarNumeroAlTipo("carne_extranjeria", "0012345678901234")).toBe("001234567890");
  });

  it("cambiar de tipo no borra el número: ida y vuelta por error deja el DNI como estaba", () => {
    const dni = "71234482";
    const pasaporte = ajustarNumeroAlTipo("pasaporte", dni);
    expect(pasaporte).toBe(dni);
    expect(ajustarNumeroAlTipo("dni", pasaporte)).toBe(dni);
    // Un carné con letras pasa a DNI con solo sus dígitos: la caja avisa lo que falta.
    expect(ajustarNumeroAlTipo("dni", "AB1234")).toBe("1234");
  });

  it("un tipo desconocido se lee como DNI (el valor por defecto de la columna)", () => {
    expect(tipoDocumentoDe("carne_extranjeria")).toBe("carne_extranjeria");
    expect(tipoDocumentoDe("ruc")).toBe("dni");
    expect(tipoDocumentoDe(null)).toBe("dni");
    expect(esTipoDocumentoClienta("pasaporte")).toBe(true);
    expect(esTipoDocumentoClienta("ruc")).toBe(false);
  });

  it("en pantalla, el número a medias y con su tipo", () => {
    expect(documentoLegible("dni", "71234482")).toBe("DNI 71•••482");
    expect(documentoLegible("carne_extranjeria", "001234567")).toBe("CE 00•••567");
    expect(documentoLegible("pasaporte", "AB123456", false)).toBe("Pasaporte AB123456");
    expect(documentoLegible("dni", null)).toBeNull();
  });

  it("desde la tanda 1e, al comprobante pasan los tres tipos, con su tipo (ADR-0288 D-3)", () => {
    expect(documentoParaComprobante("dni", "71234482")).toEqual({ tipo: "dni", numero: "71234482" });
    expect(documentoParaComprobante("carne_extranjeria", "001234567")).toEqual({ tipo: "carne_extranjeria", numero: "001234567" });
    expect(documentoParaComprobante("pasaporte", "AB123456")).toEqual({ tipo: "pasaporte", numero: "AB123456" });
    expect(documentoParaComprobante("dni", null)).toBeNull();
  });

  it("al comprobante va limpio (sin espacios, en mayúsculas), y uno fuera de formato no pasa: la boleta sale sin documento en vez de frenar la venta", () => {
    expect(documentoParaComprobante("pasaporte", "ab 123 456")).toEqual({ tipo: "pasaporte", numero: "AB123456" });
    expect(documentoParaComprobante("carne_extranjeria", "CE-12")).toBeNull();
    expect(documentoParaComprobante("dni", "7123448")).toBeNull();
    expect(documentoParaComprobante("pasaporte", "   ")).toBeNull();
  });
});
