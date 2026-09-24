import { describe, expect, it, vi } from "vitest";
import { emitirDocumentoLucode, interpretarEstadoAnulacion } from "./lucode";

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

// Cada nota manda SUS campos (PL-117, sandbox real 2026-09-23): con los de crédito, una nota de débito vuelve
// `Undefined array key "nota_debito_codigo_tipo"`. Se mira el cuerpo que sale, sin red.
describe("emitirDocumentoLucode: campos de cada nota", () => {
  async function cuerpoDe(tipo: "nota_credito" | "nota_debito", motivoCodigo: string) {
    let cuerpo: Record<string, unknown> = {};
    vi.stubEnv("LUCODE_TOKEN", "t");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      cuerpo = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ payload: { estado: "ACEPTADO" } }), { status: 200 });
    });
    await emitirDocumentoLucode({
      tipo, serie: "BX01", numero: 1, moneda: "PEN", clienteTipoDoc: "sin_documento", clienteNumDoc: null, clienteNombre: null,
      total: 11.8, items: [{ descripcion: "x", cantidad: 1, precio_unitario: 10 }],
      original: { tipo: "boleta", serie: "B001", numero: 1 }, motivoCodigo,
    });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    return cuerpo;
  }

  it("la nota de crédito manda nota_credito_* (lo probado el 2026-09-21)", async () => {
    const c = await cuerpoDe("nota_credito", "06");
    expect(c).toMatchObject({ documento: "nota_credito", nota_credito_codigo_tipo: "06", nota_credito_motivo: "Devolución total" });
    expect(c).not.toHaveProperty("nota_debito_codigo_tipo");
  });
  it("la nota de débito manda nota_debito_* (aceptada por SUNAT en el sandbox: BD01-1)", async () => {
    const c = await cuerpoDe("nota_debito", "02");
    expect(c).toMatchObject({ documento: "nota_debito", nota_debito_codigo_tipo: "02", nota_debito_motivo: "Aumento en el valor" });
    expect(c).not.toHaveProperty("nota_credito_codigo_tipo");
  });
});
