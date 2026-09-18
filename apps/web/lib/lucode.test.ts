import { describe, expect, it } from "vitest";
import { interpretarEstadoAnulacion } from "./lucode";

// El vocabulario de anulación de Lucode NO es el de emisión. Estos casos
// existen porque `traducirEstado` (el de emisión) manda a PENDIENTE todo lo
// que no reconoce: si se reusara acá, un "ANULADO" real se leería como
// "sigue en trámite" para siempre y el comprobante nunca cerraría.
describe("interpretarEstadoAnulacion", () => {
  it("ANULADO es la única confirmación", () => {
    expect(interpretarEstadoAnulacion("ANULADO")).toBe("confirmada");
  });

  it("ANULANDO es trámite en curso — visto en producción el 2026-09-09", () => {
    expect(interpretarEstadoAnulacion("ANULANDO")).toBe("en_tramite");
  });

  it("no confunde el ACEPTADO de la emisión con una baja", () => {
    expect(interpretarEstadoAnulacion("ACEPTADO")).toBe("no_anulado");
    expect(interpretarEstadoAnulacion("PENDIENTE")).toBe("no_anulado");
    expect(interpretarEstadoAnulacion("RECHAZADO")).toBe("no_anulado");
  });

  // Ante lo desconocido se responde "todavía no": una consulta de más cuesta
  // un clic, dar por anulado lo que no lo está deja un documento vivo ante
  // SUNAT marcado como dado de baja.
  it("cualquier cosa desconocida, vacía o nula NO cuenta como anulada", () => {
    expect(interpretarEstadoAnulacion("VOIDED")).toBe("no_anulado");
    expect(interpretarEstadoAnulacion("")).toBe("no_anulado");
    expect(interpretarEstadoAnulacion(null)).toBe("no_anulado");
    expect(interpretarEstadoAnulacion(undefined)).toBe("no_anulado");
  });

  it("tolera espacios y minúsculas, que es como llega la vida real", () => {
    expect(interpretarEstadoAnulacion("  anulado  ")).toBe("confirmada");
    expect(interpretarEstadoAnulacion("Anulando")).toBe("en_tramite");
  });
});
