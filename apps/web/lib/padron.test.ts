import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { advertenciasDe, consultarPadron, leerSunatPublico, normalizarRespuestaPadron, reiniciarSunatPublico } from "./padron";

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
describe("consultarPadron — proveedor de pago", () => {
  const original = { ...process.env };
  const fetchOriginal = global.fetch;

  // Aquí se prueba SOLO el proveedor de pago: SUNAT público va apagado para que el
  // simulador de `fetch` no conteste por él. El orden entre las dos fuentes se prueba
  // más abajo, en su propio bloque.
  beforeEach(() => {
    process.env.PADRON_SUNAT_PUBLICO = "no";
  });

  afterEach(() => {
    process.env.PADRON_PROVEEDOR = original.PADRON_PROVEEDOR;
    process.env.PADRON_TOKEN = original.PADRON_TOKEN;
    process.env.PADRON_SUNAT_PUBLICO = original.PADRON_SUNAT_PUBLICO;
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

// ==================== SUNAT público (gratis, primera opción) ====================
// La respuesta de abajo es la REAL que devolvió el servicio el 2026-09-29 para el RUC
// de la propia SUNAT (dato público), tal cual, con sus espacios de relleno.
const RESPUESTA_RUC_REAL = {
  message: "success",
  lista: [
    {
      idprovincia: "01",
      iddistrito: "01",
      apenomdenunciado: "SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA - SUNAT                         ",
      iddepartamento: "15",
      direstablecimiento: "AV. GARCILASO DE LA VEGA - Nro: 1472  - LIMA",
      desdistrito: "LIMA                      ",
    },
  ],
};
const RESPUESTA_NO_EXISTE = { error: "No existen datos para los filtros seleccionados" };

describe("leerSunatPublico", () => {
  it("lee un RUC real: nombre y dirección sin espacios de relleno, sin estado ni condición", () => {
    const r = leerSunatPublico("ruc", "20131312955", RESPUESTA_RUC_REAL);
    expect(r).toEqual({
      ok: true,
      origen: "sunat_publico",
      datos: {
        numero: "20131312955",
        tipo: "ruc",
        nombre: "SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA - SUNAT",
        // SUNAT público no informa estado ni condición: null, nunca «ACTIVO» inventado.
        estado: null,
        condicion: null,
        direccion: "AV. GARCILASO DE LA VEGA - Nro: 1472 - LIMA",
      },
    });
  });

  it("un DNI con la misma estructura devuelve el nombre y nunca estado/condición", () => {
    // Forma SUPUESTA: el éxito del DNI no se verificó con un número real (solo el «no existe»).
    const r = leerSunatPublico("dni", "46027897", { message: "success", lista: [{ apenomdenunciado: "  torres ruiz ana   " }] });
    expect(r.ok && r.datos.nombre).toBe("TORRES RUIZ ANA");
    expect(r.ok && r.datos.estado).toBeNull();
  });

  it("«No existen datos» es no_encontrado, no un error", () => {
    expect(leerSunatPublico("dni", "00000000", RESPUESTA_NO_EXISTE)).toEqual({
      ok: false,
      motivo: "no_encontrado",
      detalle: "El padrón no tiene registrado ese número",
    });
  });

  it("una lista vacía también es no_encontrado", () => {
    const r = leerSunatPublico("ruc", "20131312955", { message: "success", lista: [] });
    expect(r.ok === false && r.motivo).toBe("no_encontrado");
  });

  it.each([
    ["otro mensaje de error", { error: "Sesión expirada" }],
    ["sin `lista`", { message: "success" }],
    ["lista con algo que no es objeto", { lista: ["x"] }],
    ["fila sin nombre", { lista: [{ direstablecimiento: "AV. X 1" }] }],
    ["null", null],
    ["una lista suelta", []],
    ["un texto", "<html>firewall</html>"],
  ])("formato que no reconoce (%s) → sin_respuesta, para que caiga al proveedor", (_caso, json) => {
    const r = leerSunatPublico("ruc", "20131312955", json);
    expect(r.ok === false && r.motivo).toBe("sin_respuesta");
  });
});

describe("consultarPadron — orden de fuentes", () => {
  const original = { ...process.env };
  const fetchOriginal = global.fetch;

  type Sim = { status: number; json?: unknown } | "caido";
  /** Simula las dos fuentes por separado y anota a quién se llamó y en qué orden. */
  function simular(sunat: Sim, pago: Sim) {
    const llamadas: ("sunat" | "pago")[] = [];
    global.fetch = (async (url: string) => {
      const cual = String(url).includes("sunat.gob.pe") ? "sunat" : "pago";
      llamadas.push(cual);
      const r = cual === "sunat" ? sunat : pago;
      if (r === "caido") throw new Error("sin conexión");
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
    }) as unknown as typeof fetch;
    return llamadas;
  }

  const PAGO_OK = { status: 200, json: { razon_social: "Cayla SAC", estado: "ACTIVO", condicion: "HABIDO" } };
  const SUNAT_OK = { status: 200, json: RESPUESTA_RUC_REAL };
  const SUNAT_NO_EXISTE = { status: 200, json: RESPUESTA_NO_EXISTE };

  beforeEach(() => {
    reiniciarSunatPublico();
    process.env.PADRON_PROVEEDOR = "decolecta";
    process.env.PADRON_TOKEN = "sk_secreto";
    delete process.env.PADRON_SUNAT_PUBLICO;
  });

  afterEach(() => {
    process.env.PADRON_PROVEEDOR = original.PADRON_PROVEEDOR;
    process.env.PADRON_TOKEN = original.PADRON_TOKEN;
    process.env.PADRON_SUNAT_PUBLICO = original.PADRON_SUNAT_PUBLICO;
    global.fetch = fetchOriginal;
    reiniciarSunatPublico();
  });

  // Números distintos por caso: la caché de `consultarPadron` es real y compartida.

  it("si SUNAT lo encuentra, el proveedor de pago NO se llama (no se gasta cuota)", async () => {
    const llamadas = simular(SUNAT_OK, PAGO_OK);
    const r = await consultarPadron("ruc", "20100000011");
    expect(llamadas).toEqual(["sunat"]);
    expect(r.ok && r.origen).toBe("sunat_publico");
  });

  it("si SUNAT no lo encuentra, se va al proveedor de pago", async () => {
    const llamadas = simular(SUNAT_NO_EXISTE, PAGO_OK);
    const r = await consultarPadron("ruc", "20100000022");
    expect(llamadas).toEqual(["sunat", "pago"]);
    expect(r.ok && r.origen).toBe("proveedor");
    expect(r.ok && r.datos.estado).toBe("ACTIVO");
  });

  it.each([
    ["se cae", "caido" as Sim, "20100000201"],
    ["responde 503", { status: 503 } as Sim, "20100000202"],
    ["contesta un HTML de firewall", { status: 200, json: undefined } as Sim, "20100000203"],
  ])("si SUNAT %s, se va al proveedor de pago", async (_caso, sunat, ruc) => {
    const llamadas = simular(sunat, PAGO_OK);
    const r = await consultarPadron("ruc", ruc);
    expect(llamadas).toEqual(["sunat", "pago"]);
    expect(r.ok && r.origen).toBe("proveedor");
  });

  it("la segunda consulta del mismo número sale de la caché sin llamar a nadie", async () => {
    const llamadas = simular(SUNAT_OK, PAGO_OK);
    await consultarPadron("ruc", "20100000033");
    await consultarPadron("ruc", "20100000033");
    expect(llamadas).toEqual(["sunat"]);
  });

  it("sin proveedor de pago configurado, SUNAT sola alcanza para consultar", async () => {
    delete process.env.PADRON_PROVEEDOR;
    delete process.env.PADRON_TOKEN;
    const llamadas = simular(SUNAT_OK, PAGO_OK);
    const r = await consultarPadron("ruc", "20100000044");
    expect(llamadas).toEqual(["sunat"]);
    expect(r.ok).toBe(true);
  });

  it("sin proveedor y SUNAT caída, el motivo es el de SUNAT — no «no está activada»", async () => {
    delete process.env.PADRON_PROVEEDOR;
    delete process.env.PADRON_TOKEN;
    simular("caido", PAGO_OK);
    const r = await consultarPadron("ruc", "20100000055");
    expect(r).toEqual({ ok: false, motivo: "sin_respuesta", detalle: "El padrón no respondió a tiempo" });
  });

  it("sin proveedor y SUNAT sin ese número, dice que no está registrado", async () => {
    delete process.env.PADRON_PROVEEDOR;
    delete process.env.PADRON_TOKEN;
    simular(SUNAT_NO_EXISTE, PAGO_OK);
    const r = await consultarPadron("dni", "10000001");
    expect(r.ok === false && r.motivo).toBe("no_encontrado");
  });

  it("si fallan las dos, manda el motivo del proveedor de pago (cuota, credenciales…)", async () => {
    simular("caido", { status: 429 });
    const r = await consultarPadron("ruc", "20100000066");
    expect(r.ok === false && r.motivo).toBe("cuota_agotada");
  });

  it("PADRON_SUNAT_PUBLICO=no: SUNAT no se llama nunca", async () => {
    process.env.PADRON_SUNAT_PUBLICO = "no";
    const llamadas = simular(SUNAT_OK, PAGO_OK);
    const r = await consultarPadron("ruc", "20100000077");
    expect(llamadas).toEqual(["pago"]);
    expect(r.ok && r.origen).toBe("proveedor");
  });

  it("PADRON_SUNAT_PUBLICO=solo_dni: el RUC va directo al proveedor (trae estado), el DNI prueba SUNAT", async () => {
    process.env.PADRON_SUNAT_PUBLICO = "solo_dni";
    const llamadas = simular({ status: 200, json: { lista: [{ apenomdenunciado: "TORRES RUIZ ANA" }] } }, PAGO_OK);
    await consultarPadron("ruc", "20100000088");
    await consultarPadron("dni", "10000002");
    expect(llamadas).toEqual(["pago", "sunat"]);
  });

  describe("interruptor de circuito", () => {
    it("tras 3 fallos seguidos de SUNAT deja de llamarla, y la consulta sigue por el proveedor", async () => {
      const llamadas = simular("caido", PAGO_OK);
      await consultarPadron("ruc", "20100000101");
      await consultarPadron("ruc", "20100000102");
      await consultarPadron("ruc", "20100000103");
      expect(llamadas.filter((l) => l === "sunat")).toHaveLength(3);

      llamadas.length = 0;
      const r = await consultarPadron("ruc", "20100000104");
      expect(llamadas).toEqual(["pago"]); // SUNAT en pausa: ni se intenta
      expect(r.ok).toBe(true);
    });

    it("«no existe» NO cuenta como fallo: SUNAT sigue en servicio", async () => {
      const llamadas = simular(SUNAT_NO_EXISTE, PAGO_OK);
      for (const n of ["20100000111", "20100000112", "20100000113", "20100000114"]) {
        await consultarPadron("ruc", n);
      }
      expect(llamadas.filter((l) => l === "sunat")).toHaveLength(4);
    });

    it("un acierto entre fallos reinicia la cuenta: SUNAT no se pausa por fallos que no fueron seguidos", async () => {
      simular("caido", PAGO_OK);
      await consultarPadron("ruc", "20100000121"); // fallo 1
      await consultarPadron("ruc", "20100000122"); // fallo 2
      simular(SUNAT_OK, PAGO_OK);
      await consultarPadron("ruc", "20100000123"); // acierta → la cuenta vuelve a cero
      simular("caido", PAGO_OK);
      await consultarPadron("ruc", "20100000124"); // fallo 1 de la racha nueva
      await consultarPadron("ruc", "20100000125"); // fallo 2
      // Con 5 fallos acumulados en total ya estaría pausada; con la cuenta reiniciada, este
      // tercero de la racha todavía sale a intentar SUNAT.
      const llamadas = simular("caido", PAGO_OK);
      await consultarPadron("ruc", "20100000126");
      expect(llamadas).toEqual(["sunat", "pago"]);
    });
  });
});
