import { afterEach, describe, expect, it, vi } from "vitest";
import { crearZip } from "./zip-simple";

vi.mock("server-only", () => ({}));

// Un SUNAT falso que responde como dicen los manuales (token → ticket → «06 Terminado» → .zip). Credenciales INVENTADAS.
const CRED = { clientId: "id", clientSecret: "secreto", usuario: "20605964550USUARIO", clave: "clave" };
const TXT = "RUC|Periodo\n20605964550|202610";

function sunatFalso(opciones: { sinToken?: boolean; nuncaTermina?: boolean; caido?: boolean; sinPermiso?: boolean } = {}) {
  const llamadas: string[] = [];
  const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push(url);
    if (opciones.caido) throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    if (url.includes("oauth2/token")) {
      expect(init?.method).toBe("POST");
      return Response.json(opciones.sinToken ? { error: "invalid_grant" } : { access_token: "tok", expires_in: 3600 });
    }
    if (url.includes("exportacioncomprobantepropuesta")) {
      if (opciones.sinPermiso) return Response.json({ cod: "101", msg: "Sin permiso para el SIRE" }, { status: 401 });
      return Response.json({ numTicket: "20260300000123" });
    }
    if (url.includes("consultaestadotickets")) {
      return Response.json({
        registros: [
          opciones.nuncaTermina
            ? { numTicket: "20260300000123", codEstadoProceso: "02" }
            : { numTicket: "20260300000123", codEstadoProceso: "06", codProceso: "10", archivoReporte: [{ nomArchivoReporte: "p.zip", codTipoAchivoReporte: "01" }] },
        ],
      });
    }
    if (url.includes("archivoreporte")) return new Response(crearZip([{ nombre: "propuesta.txt", contenido: TXT }]) as BodyInit);
    return new Response("no", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchFalso);
  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function traer() {
  const { traerPropuestaSire } = await import("./sire-api");
  const p = traerPropuestaSire("compras", "2026-10", CRED);
  await vi.runAllTimersAsync();
  return p;
}

describe("traerPropuestaSire", () => {
  it("token, ticket, espera a «Terminado» y saca el .txt del .zip", async () => {
    vi.useFakeTimers();
    const llamadas = sunatFalso();
    const r = await traer();
    expect(r).toEqual({ ok: true, texto: TXT, ticket: "20260300000123" });
    expect(llamadas.map((u) => new URL(u).pathname.split("/").pop())).toEqual(["", "exportacioncomprobantepropuesta", "consultaestadotickets", "archivoreporte"]);
  });

  it("sin token dice por qué y no sigue", async () => {
    vi.useFakeTimers();
    const llamadas = sunatFalso({ sinToken: true });
    expect(await traer()).toMatchObject({ ok: false, paso: "token", motivo: expect.stringContaining("credenciales vencidas") });
    expect(llamadas).toHaveLength(1);
  });

  it("un 401 al pedir la propuesta dice el paso y lo que explica SUNAT, sin el token ni la clave", async () => {
    vi.useFakeTimers();
    const llamadas = sunatFalso({ sinPermiso: true });
    const r = await traer();
    expect(r).toEqual({ ok: false, paso: "pedir", motivo: "HTTP 401: 101 · Sin permiso para el SIRE" });
    expect(JSON.stringify(r)).not.toMatch(/tok|clave|secreto/);
    expect(llamadas).toHaveLength(2);
  });

  it("un ticket que no termina se deja para mañana, sin guardar nada", async () => {
    vi.useFakeTimers();
    sunatFalso({ nuncaTermina: true });
    expect(await traer()).toMatchObject({ ok: false, paso: "ticket", motivo: expect.stringContaining("mañana") });
  });

  it("si SUNAT no responde, lo dice sin colgarse", async () => {
    vi.useFakeTimers();
    sunatFalso({ caido: true });
    expect(await traer()).toEqual({ ok: false, paso: "token", motivo: "SUNAT no respondió a tiempo" });
  });
});
