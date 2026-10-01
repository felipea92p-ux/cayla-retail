import { describe, expect, it } from "vitest";
import { AVISO_CAMBIO_CELULAR, avisoCambioDeCelular, cambiaDeCelular, cumpleLegible, faltaParaSerSocia } from "./club-clientas-reglas";

describe("cumpleaños con año opcional (CL-3)", () => {
  it("se lee con o sin año", () => {
    expect(cumpleLegible(12, 3, null)).toBe("12/3");
    expect(cumpleLegible(12, 3, 1990)).toBe("12/3/1990");
    expect(cumpleLegible(null, 3, 1990)).toBe("—");
  });

});

describe("avisoCambioDeCelular — antes de guardar, lo que pierde una socia con novedades", () => {
  const conNovedades = { publicidadDesde: "2026-10-01T10:00:00Z", telefonoWhatsapp: "987654321" };

  it("con publicidad y otro número: el aviso", () => {
    expect(avisoCambioDeCelular(conNovedades, "911222333")).toBe(AVISO_CAMBIO_CELULAR);
    expect(AVISO_CAMBIO_CELULAR).toBe("Si cambias su celular, deja de recibir novedades hasta que las vuelva a pedir desde el número nuevo.");
    // A medio escribir también: es otro número hasta que vuelva a ser el de antes.
    expect(avisoCambioDeCelular(conNovedades, "98765")).toBe(AVISO_CAMBIO_CELULAR);
  });

  it("el mismo número (escrito con espacios o +51), vacío o sin publicidad: nada", () => {
    expect(avisoCambioDeCelular(conNovedades, "+51 987 654 321")).toBeNull();
    expect(avisoCambioDeCelular(conNovedades, "")).toBeNull();
    expect(avisoCambioDeCelular({ ...conNovedades, publicidadDesde: null }, "911222333")).toBeNull();
  });
});

describe("cambiaDeCelular — si el celular nuevo es otro", () => {
  it("compara los 9 dígitos, sin fijarse en espacios ni +51", () => {
    expect(cambiaDeCelular("987 654 321", "+51 987654321")).toBe(false);
    expect(cambiaDeCelular("987654321", "912345678")).toBe(true);
    expect(cambiaDeCelular(null, "912345678")).toBe(true);
  });
});

describe("faltaParaSerSocia — tanda 1g: se une desde el cartel con SU documento", () => {
  it("con documento no falta nada (el nombre lo trae el padrón o lo escribe ella)", () => {
    expect(faltaParaSerSocia({ documentoNumero: "71234482" })).toBeNull();
  });

  it("sin documento, lo dice: al unirse se crearía otra ficha", () => {
    expect(faltaParaSerSocia({ documentoNumero: null })).toContain("necesita su documento");
    expect(faltaParaSerSocia({ documentoNumero: "  " })).toContain("«Editar»");
  });
});
