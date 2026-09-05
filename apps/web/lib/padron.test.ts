import { describe, it, expect, afterEach } from "vitest";
import { advertenciasDe, consultarPadron, normalizarRespuestaPadron } from "./padron";

// Estas pruebas cubren la pieza que se rompe cuando un proveedor del padrón
// cambia de formato — sin gastar consultas reales, que se pagan. Los objetos de
// abajo son las formas documentadas por cada proveedor (ver comentarios en
// lib/padron.ts): si mañana se agrega un cuarto proveedor, se agrega su caso
// aquí y se ve de inmediato si el resto sigue funcionando.

describe("normalizarRespuestaPadron — RUC", () => {
  it("lee el formato de Decolecta / apis.net.pe", () => {
    expect(
      normalizarRespuestaPadron("ruc", "20131312955", {
        razon_social: "Superintendencia Nacional de Aduanas",
        numero_documento: "20131312955",
        estado: "ACTIVO",
        condicion: "HABIDO",
        direccion: "AV. GARCILASO DE LA VEGA 1472",
      })
    ).toEqual({
      numero: "20131312955",
      tipo: "ruc",
      nombre: "SUPERINTENDENCIA NACIONAL DE ADUANAS",
      estado: "ACTIVO",
      condicion: "HABIDO",
      direccion: "AV. GARCILASO DE LA VEGA 1472",
    });
  });

  it("lee el formato de Factiliza (nombre_o_razon_social)", () => {
    const d = normalizarRespuestaPadron("ruc", "20601030013", {
      numero: "20601030013",
      nombre_o_razon_social: "Textiles Cayla SAC",
      estado: "BAJA DE OFICIO",
      condicion: "NO HABIDO",
      direccion_completa: "CALLE LOS ALAMOS 123 - TRUJILLO",
    });
    expect(d?.nombre).toBe("TEXTILES CAYLA SAC");
    expect(d?.estado).toBe("BAJA DE OFICIO");
    expect(d?.direccion).toBe("CALLE LOS ALAMOS 123 - TRUJILLO");
  });

  it("devuelve null si el proveedor respondió sin razón social", () => {
    expect(normalizarRespuestaPadron("ruc", "20131312955", { estado: "ACTIVO" })).toBeNull();
  });
});

describe("normalizarRespuestaPadron — DNI", () => {
  it("arma el nombre cuando viene en tres pedazos", () => {
    const d = normalizarRespuestaPadron("dni", "46027897", {
      nombres: "María Fernanda",
      apellido_paterno: "Alvarez",
      apellido_materno: "Quispe",
    });
    expect(d?.nombre).toBe("MARÍA FERNANDA ALVAREZ QUISPE");
    // Estado y condición son cosa de SUNAT: una persona no está "no habida".
    expect(d?.estado).toBeNull();
    expect(d?.condicion).toBeNull();
  });

  it("usa el nombre completo cuando el proveedor ya lo arma", () => {
    expect(normalizarRespuestaPadron("dni", "46027897", { full_name: "Ana Torres Ruiz" })?.nombre).toBe(
      "ANA TORRES RUIZ"
    );
  });

  it("devuelve null si no vino ningún nombre", () => {
    expect(normalizarRespuestaPadron("dni", "46027897", { numero: "46027897" })).toBeNull();
  });
});

describe("advertenciasDe — lo que impide que la factura sea válida", () => {
  const base = { numero: "20601030013", tipo: "ruc" as const, nombre: "X SAC", direccion: null };

  it("no dice nada de un RUC activo y habido", () => {
    expect(advertenciasDe({ ...base, estado: "ACTIVO", condicion: "HABIDO" })).toEqual([]);
  });

  it("avisa cuando el RUC está de baja", () => {
    const a = advertenciasDe({ ...base, estado: "BAJA DE OFICIO", condicion: "HABIDO" });
    expect(a).toHaveLength(1);
    expect(a[0]).toContain("BAJA DE OFICIO");
  });

  it("avisa cuando el domicilio es NO HABIDO", () => {
    const a = advertenciasDe({ ...base, estado: "ACTIVO", condicion: "NO HABIDO" });
    expect(a).toHaveLength(1);
    expect(a[0]).toContain("crédito fiscal");
  });

  it("un DNI nunca genera advertencias de SUNAT", () => {
    expect(
      advertenciasDe({ numero: "46027897", tipo: "dni", nombre: "ANA TORRES", estado: null, condicion: null, direccion: null })
    ).toEqual([]);
  });
});

// ==================== camino completo, con el proveedor simulado ====================
// Prueba `consultarPadron` de punta a punta (URL, cabecera de autorización,
// manejo de cada código de error, caché) sin gastar una sola consulta pagada ni
// depender de que el proveedor esté arriba hoy.
describe("consultarPadron", () => {
  const original = { ...process.env };
  const fetchOriginal = global.fetch;

  afterEach(() => {
    process.env.PADRON_PROVEEDOR = original.PADRON_PROVEEDOR;
    process.env.PADRON_TOKEN = original.PADRON_TOKEN;
    global.fetch = fetchOriginal;
  });

  function simular(respuesta: { status: number; json?: unknown }) {
    const llamadas: { url: string; auth: string | undefined }[] = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      llamadas.push({ url: String(url), auth: (init.headers as Record<string, string>)?.Authorization });
      return {
        ok: respuesta.status >= 200 && respuesta.status < 300,
        status: respuesta.status,
        json: async () => respuesta.json,
      };
    }) as unknown as typeof fetch;
    return llamadas;
  }

  it("sin proveedor configurado no llama a nadie y lo dice", async () => {
    delete process.env.PADRON_PROVEEDOR;
    delete process.env.PADRON_TOKEN;
    const r = await consultarPadron("ruc", "20131312955");
    expect(r).toEqual({ ok: false, motivo: "sin_proveedor", detalle: "No hay proveedor de padrón configurado" });
  });

  it("arma la URL y manda el token en la cabecera, nunca en la URL", async () => {
    process.env.PADRON_PROVEEDOR = "decolecta";
    process.env.PADRON_TOKEN = "sk_secreto";
    const llamadas = simular({ status: 200, json: { razon_social: "Cayla SAC", estado: "ACTIVO", condicion: "HABIDO" } });

    const r = await consultarPadron("ruc", "20601030013");
    expect(r.ok).toBe(true);
    expect(llamadas[0].url).toBe("https://api.decolecta.com/v1/sunat/ruc?numero=20601030013");
    expect(llamadas[0].auth).toBe("Bearer sk_secreto");
    expect(llamadas[0].url).not.toContain("sk_secreto");
  });

  it("la segunda consulta del mismo número no vuelve a salir a internet", async () => {
    process.env.PADRON_PROVEEDOR = "decolecta";
    process.env.PADRON_TOKEN = "sk_secreto";
    const llamadas = simular({ status: 200, json: { razon_social: "Cayla SAC", estado: "ACTIVO", condicion: "HABIDO" } });

    await consultarPadron("ruc", "20100070970");
    await consultarPadron("ruc", "20100070970");
    expect(llamadas).toHaveLength(1);
  });

  // Números distintos por caso a propósito: la caché de `consultarPadron` es real
  // y compartida, y reusar uno haría pasar la prueba por la razón equivocada.
  it.each([
    [401, "credenciales", "20512333335"],
    [429, "cuota_agotada", "20522222226"],
    [404, "no_encontrado", "20533333338"],
    [500, "sin_respuesta", "20544444449"],
  ])("un %i del proveedor se traduce a %s", async (status, motivo, ruc) => {
    process.env.PADRON_PROVEEDOR = "decolecta";
    process.env.PADRON_TOKEN = "sk_secreto";
    simular({ status });
    const r = await consultarPadron("ruc", ruc);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toBe(motivo);
  });

  it("si el proveedor no responde, se degrada en vez de reventar", async () => {
    process.env.PADRON_PROVEEDOR = "decolecta";
    process.env.PADRON_TOKEN = "sk_secreto";
    global.fetch = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    const r = await consultarPadron("dni", "12345678");
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta", detalle: "El padrón no respondió a tiempo" });
  });

  it("Factiliza envuelve la respuesta en `data` y también se entiende", async () => {
    process.env.PADRON_PROVEEDOR = "factiliza";
    process.env.PADRON_TOKEN = "sk_secreto";
    const llamadas = simular({
      status: 200,
      json: { success: true, data: { nombre_completo: "Ana Torres Ruiz", numero: "87654321" } },
    });
    const r = await consultarPadron("dni", "87654321");
    expect(llamadas[0].url).toBe("https://api.factiliza.com/v1/dni/info/87654321");
    expect(r.ok === true && r.datos.nombre).toBe("ANA TORRES RUIZ");
  });
});
