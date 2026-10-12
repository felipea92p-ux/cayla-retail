import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transmitirComprobante, type Cliente } from "./transmitir-comprobante";
import { xmlDePrueba } from "./ya-emitido-fixture";

// ADR-0378, de punta a punta por la función real: `transmitirComprobante` → Lucode dice «ya fue emitido» →
// `resolverYaEmitido` pregunta el estado → baja el XML → compara → escribe por las RPC de siempre. Lucode es un `fetch`
// falso y la base, un cliente falso que anota cada RPC: lo que se mira es QUÉ se le pide a cada uno, y que nunca se
// reenvíe el documento ni se dé por declarado lo que no se confirmó.

type Llamada = { url: string; body: Record<string, unknown> | null };

const COMPROBANTE = {
  id: "c-262",
  tipo: "boleta",
  serie: "B005",
  numero: 262,
  moneda: "PEN",
  cliente_tipo_doc: "sin_documento",
  cliente_num_doc: null,
  cliente_nombre: null,
  total: 15,
  estado: "pendiente_reintento",
  // 15:54 de Lima del 9-oct: el día que viaja como fecha de emisión y el que trae el XML de prueba.
  created_at: "2026-10-09T20:54:44Z",
  items: [{ variante_id: "v-1", cantidad: 1, precio_unitario: 15, descuento_unitario: 0 }],
  comprobante_original_id: null,
  motivo: null,
  entorno_transmision: null,
  venta_id: "venta-1",
  venta: { estado: "completada" },
};

function clienteFalso(fila: Record<string, unknown> = COMPROBANTE) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const cadena = (tabla: string, columnas = "") => {
    const q = {
      select: (c: string) => cadena(tabla, c),
      match: () => q,
      in: () => q,
      eq: () => q,
      maybeSingle: async () => {
        if (tabla !== "comprobantes") return { data: null, error: null };
        return columnas.startsWith("es_anticipo") ? { data: { es_anticipo: false, anticipo_deducido: 0 }, error: null } : { data: fila, error: null };
      },
      // `await supabase.from("variantes").select(...).in(...)` sin `maybeSingle`.
      then: (ok: (v: unknown) => void) => ok({ data: [{ id: "v-1", sku: "NEG-M", producto: { referencia: "BLUSA AURORA" } }], error: null }),
    };
    return q;
  };
  const cliente = {
    from: (tabla: string) => cadena(tabla),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return { data: null, error: null };
    },
  };
  return { cliente: cliente as unknown as Cliente, rpcs };
}

const XML_URL = "https://app.apisunat.pe/xml/1/abc/20000000001-03-B005-262";

/** Lucode falso. `envio`: la respuesta a `/documents`; `estado`: la de `/status`; `xml`: el texto en `XML_URL`. */
function lucodeFalso({
  envio = { status: 400, json: { success: false, message: "ERROR: La boleta B005-262 fue emitido anteriormente." } },
  estado = { status: 200, json: { success: true, message: "aceptado por SUNAT", payload: { estado: "ACEPTADO", hash: "h", xml: XML_URL, cdr: "https://app.apisunat.pe/xml/1/abc/R-x", pdf: { a4: "https://app.apisunat.pe/pdf/a4/1" } } } } as
    | { status: number; json: unknown }
    | "caido",
  xml = { status: 200, texto: xmlDePrueba() } as { status: number; texto: string } | "caido",
}: {
  envio?: { status: number; json: unknown };
  estado?: { status: number; json: unknown } | "caido";
  xml?: { status: number; texto: string } | "caido";
} = {}) {
  const llamadas: Llamada[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    llamadas.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.endsWith("/api/v3/documents")) return new Response(JSON.stringify(envio.json), { status: envio.status });
    if (url.endsWith("/api/v3/status")) {
      if (estado === "caido") throw new TypeError("fetch failed");
      return new Response(JSON.stringify(estado.json), { status: estado.status });
    }
    if (xml === "caido") throw new TypeError("fetch failed");
    return new Response(xml.texto, { status: xml.status });
  });
  return llamadas;
}

beforeEach(() => {
  vi.stubEnv("LUCODE_TOKEN", "t");
  vi.stubEnv("LUCODE_ENTORNO", "produccion");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const envios = (ll: Llamada[]) => ll.filter((l) => l.url.endsWith("/api/v3/documents")).length;

describe("transmitirComprobante cuando Lucode ya tiene el número", () => {
  it("es la nuestra y SUNAT la aceptó: queda aceptada, en producción, sin reenviarla ni encolarla", async () => {
    const llamadas = lucodeFalso();
    const { cliente, rpcs } = clienteFalso();
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: "aceptado", entorno: "produccion", xmlUrl: XML_URL, ya_emitido: true });
    expect(llamadas.map((l) => l.url)).toEqual(["https://app.apisunat.pe/api/v3/documents", "https://app.apisunat.pe/api/v3/status", XML_URL]);
    expect(llamadas[1].body).toEqual({ documento: "boleta", serie: "B005", numero: 262 });
    expect(envios(llamadas)).toBe(1);
    expect(rpcs.map((x) => x.fn)).toEqual(["actualizar_transmision_comprobante"]);
    expect(rpcs[0].args).toMatchObject({ p_comprobante_id: "c-262", p_estado: "aceptado", p_entorno: "produccion" });
    // La respuesta guardada conserva la forma que leen las pantallas (`pdfUrl`, `xmlUrl` en la raíz) y dice de dónde salió.
    expect(rpcs[0].args.p_respuesta_sunat).toMatchObject({
      estado: "ACEPTADO",
      xmlUrl: XML_URL,
      pdfUrl: "https://app.apisunat.pe/pdf/a4/1",
      ya_emitido: { aviso_lucode: "ERROR: La boleta B005-262 fue emitido anteriormente.", verificado_con_xml: true },
    });
  });

  it("SUNAT todavía no responde: queda «enviado» (sale de la cola y lo sigue la consulta del barrido)", async () => {
    lucodeFalso({ estado: { status: 200, json: { payload: { estado: "PENDIENTE", xml: XML_URL } } } });
    const { cliente, rpcs } = clienteFalso();
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(r.status).toBe(200);
    expect(rpcs).toEqual([expect.objectContaining({ fn: "actualizar_transmision_comprobante", args: expect.objectContaining({ p_estado: "enviado" }) })]);
  });

  it("SUNAT la rechazó: queda rechazada con el motivo de SUNAT", async () => {
    lucodeFalso({ estado: { status: 200, json: { message: "El RUC del emisor no está activo", payload: { estado: "RECHAZADO", xml: XML_URL } } } });
    const { cliente, rpcs } = clienteFalso();
    await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(rpcs[0].args).toMatchObject({ p_estado: "rechazado", p_motivo_rechazo: "El RUC del emisor no está activo" });
  });

  it("Lucode tiene OTRO documento con nuestro número: no se da por declarada, queda «número ocupado» con la diferencia", async () => {
    const llamadas = lucodeFalso({ xml: { status: 200, texto: xmlDePrueba({ total: "89.90", lineas: 2 }) } });
    const { cliente, rpcs } = clienteFalso();
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      motivo: "numero_ocupado",
      encolado: true,
      error: "B005-262 ya existe en Lucode con otro total (S/ 89.90 en Lucode, S/ 15.00 aquí), otras líneas (2 en Lucode, 1 aquí).",
    });
    expect(rpcs.map((x) => x.fn)).toEqual(["fn_marcar_reintento_transmision"]);
    expect(rpcs[0].args.p_error).toBe(
      "numero_ocupado: otro total (S/ 89.90 en Lucode, S/ 15.00 aquí), otras líneas (2 en Lucode, 1 aquí)",
    );
    expect(envios(llamadas)).toBe(1);
  });

  it("Lucode no responde al preguntarle el estado: sigue en la cola como «ya emitido», sin escribir un estado", async () => {
    lucodeFalso({ estado: "caido" });
    const { cliente, rpcs } = clienteFalso();
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(r).toMatchObject({ status: 502, body: { motivo: "ya_emitido", encolado: true } });
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].fn).toBe("fn_marcar_reintento_transmision");
    expect(String(rpcs[0].args.p_error)).toMatch(/^ya_emitido: Lucode ya tiene B005-262, pero no se pudo consultar su estado/);
  });

  it("el estado dice que no existe (Lucode se contradice): tampoco se escribe un estado", async () => {
    lucodeFalso({ estado: { status: 400, json: { success: false, message: "La boleta B005-262 no está registrada" } } });
    const { cliente, rpcs } = clienteFalso();
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(r.body).toMatchObject({ motivo: "ya_emitido" });
    expect(rpcs.map((x) => x.fn)).toEqual(["fn_marcar_reintento_transmision"]);
  });

  it("aunque SUNAT diga ACEPTADO, sin XML legible no se da por aceptada", async () => {
    for (const xml of ["caido", { status: 404, texto: "Not found" }, { status: 200, texto: "<html>mantenimiento</html>" }] as const) {
      lucodeFalso({ xml });
      const { cliente, rpcs } = clienteFalso();
      const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });
      expect(r.body).toMatchObject({ motivo: "ya_emitido" });
      expect(rpcs.map((x) => x.fn)).toEqual(["fn_marcar_reintento_transmision"]);
      vi.unstubAllGlobals();
    }
  });

  it("un XML en una dirección que no es de Lucode ni se descarga", async () => {
    const llamadas = lucodeFalso({ estado: { status: 200, json: { payload: { estado: "ACEPTADO", xml: "https://otro-sitio.example/x.xml" } } } });
    const { cliente, rpcs } = clienteFalso();
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(llamadas.some((l) => l.url.includes("otro-sitio"))).toBe(false);
    expect(r.body).toMatchObject({ motivo: "ya_emitido" });
    expect(String(rpcs[0].args.p_error)).toContain("la dirección del XML no es de Lucode");
  });

  it("un comprobante ya rechazado que se reintenta no vuelve a la cola (la base lo negaría), pero sí se confirma", async () => {
    lucodeFalso({ xml: { status: 200, texto: xmlDePrueba({ total: "1.00" }) } });
    const { cliente, rpcs } = clienteFalso({ ...COMPROBANTE, estado: "rechazado" });
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(r.body).toMatchObject({ motivo: "numero_ocupado", encolado: false });
    expect(rpcs).toEqual([]);
  });
});

describe("lo que NO cambia", () => {
  it("un «ya emitido» que nombra OTRO número es un rechazo común: no se consulta nada", async () => {
    const llamadas = lucodeFalso({ envio: { status: 400, json: { message: "ERROR: La boleta B005-999 fue emitido anteriormente." } } });
    const { cliente, rpcs } = clienteFalso();
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(llamadas).toHaveLength(1);
    expect(r.body).toMatchObject({ motivo: "rechazado_por_lucode" });
    expect(rpcs[0].args.p_error).toBe("rechazado_por_lucode: ERROR: La boleta B005-999 fue emitido anteriormente.");
  });

  it("un rechazo de verdad sigue como antes", async () => {
    const llamadas = lucodeFalso({ envio: { status: 400, json: { message: "El número de documento del cliente no es válido" } } });
    const { cliente, rpcs } = clienteFalso();
    await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(llamadas).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({ fn: "fn_marcar_reintento_transmision", args: { p_error: "rechazado_por_lucode: El número de documento del cliente no es válido" } });
  });

  it("el envío normal que SUNAT acepta sigue como antes", async () => {
    const llamadas = lucodeFalso({ envio: { status: 200, json: { payload: { estado: "ACEPTADO", xml: XML_URL } } } });
    const { cliente, rpcs } = clienteFalso();
    const r = await transmitirComprobante(cliente, { comprobanteId: "c-262" });
    expect(llamadas).toHaveLength(1);
    expect(r.body).toMatchObject({ estado: "aceptado" });
    expect(r.body).not.toHaveProperty("ya_emitido");
    expect(rpcs[0]).toMatchObject({ fn: "actualizar_transmision_comprobante", args: { p_estado: "aceptado" } });
  });
});
