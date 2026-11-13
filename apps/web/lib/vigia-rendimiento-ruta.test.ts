import { beforeEach, describe, expect, it, vi } from "vitest";

// La ruta del vigía de rendimiento (`app/api/salud/rendimiento/route.ts`, ADR-0656) corrida de verdad, con la base y Sentry de mentira:
// quién pasa, qué responde y qué avisa cuando la base falla. La foto en sí (las restas, los reinicios, quién puede) la prueba
// `pnpm pruebas:vigia-rendimiento` en Postgres.

const estado = vi.hoisted(() => ({
  respuesta: { data: null as unknown, error: null as { message: string } | null },
  llamadas: [] as string[],
  sinLlave: false,
  capturas: [] as { donde: string; contexto: unknown }[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  crearClienteAdmin: () => {
    if (estado.sinLlave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
    return {
      rpc: async (nombre: string) => {
        estado.llamadas.push(nombre);
        return estado.respuesta;
      },
    };
  },
}));
vi.mock("@/lib/errores", () => ({
  capturarError: (donde: string, _error: unknown, contexto: unknown = {}) => {
    estado.capturas.push({ donde, contexto });
  },
}));
// Las pruebas de `apps/web` no tienen el alias `@/`: los módulos de verdad se atienden por su ruta relativa.
vi.mock("@/lib/rutas-cron", () => import("./rutas-cron"));
vi.mock("@/lib/vigia-rendimiento-reglas", () => import("./vigia-rendimiento-reglas"));

const { GET } = await import("../app/api/salud/rendimiento/route");
const { leerFotoRendimiento } = await import("./vigia-rendimiento-reglas");

const FOTO = (cambios: Record<string, unknown> = {}) => ({
  ok: true,
  corrida_id: 12,
  desde: "2026-11-13T19:07:00.000+00:00",
  hasta: "2026-11-13T20:07:00.000+00:00",
  arranco_de_cero: false,
  consultas: 240,
  filas: 37,
  descartadas: 819,
  ...cambios,
});
const pedir = (clave?: string) =>
  GET(new Request("https://erp.cayla.pe/api/salud/rendimiento", { headers: clave ? { authorization: `Bearer ${clave}` } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "secreto-del-cron");
  estado.respuesta = { data: FOTO(), error: null };
  estado.llamadas = [];
  estado.sinLlave = false;
  estado.capturas = [];
});

describe("GET /api/salud/rendimiento", () => {
  it("sin la clave del cron, o con otra, no pasa nadie y no toca la base", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir("otra")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await pedir("")).status).toBe(401);
    expect(estado.llamadas).toEqual([]);
  });

  it("con la clave, toma la foto y responde lo que cubrió, sin avisar a nadie", async () => {
    const r = await pedir("secreto-del-cron");
    expect(r.status).toBe(200);
    expect(estado.llamadas).toEqual(["fn_foto_rendimiento"]);
    expect(await r.json()).toEqual({
      corrio: true,
      corridaId: 12,
      desde: "2026-11-13T19:07:00.000+00:00",
      hasta: "2026-11-13T20:07:00.000+00:00",
      arrancoDeCero: false,
      consultas: 240,
      filas: 37,
      descartadas: 819,
    });
    expect(estado.capturas).toEqual([]);
  });

  it("si la base falla (o la migración no está pegada), 500 y aviso: nadie lee la respuesta del cron", async () => {
    estado.respuesta = { data: null, error: { message: "Could not find the function retail.fn_foto_rendimiento" } };
    expect((await pedir("secreto-del-cron")).status).toBe(500);
    expect(estado.capturas.map((c) => c.donde)).toEqual(["salud/rendimiento (cron): fn_foto_rendimiento falló"]);
  });

  it("sin la llave de servicio, 500 y aviso", async () => {
    estado.sinLlave = true;
    expect((await pedir("secreto-del-cron")).status).toBe(500);
    expect(estado.capturas).toHaveLength(1);
  });

  it("una respuesta con otra forma no se toma por una foto: 500 y aviso", async () => {
    estado.respuesta = { data: { algo: "distinto" }, error: null };
    expect((await pedir("secreto-del-cron")).status).toBe(500);
    expect(estado.capturas).toHaveLength(1);
  });

  it("si otra foto sigue en curso, responde sin avisar (no es una falla)", async () => {
    estado.respuesta = { data: { ok: false, motivo: "ya_corriendo" }, error: null };
    const r = await pedir("secreto-del-cron");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ corrio: false, motivo: "ya_corriendo" });
    expect(estado.capturas).toEqual([]);
  });
});

describe("leerFotoRendimiento", () => {
  it("la primera foto (sin anterior) arranca de cero y puede no traer `descartadas`", () => {
    expect(leerFotoRendimiento(FOTO({ arranco_de_cero: true, descartadas: undefined }))).toMatchObject({ arrancoDeCero: true, descartadas: null });
  });

  it("nunca inventa una foto: cualquier pieza fuera de forma da null", () => {
    for (const malo of [
      null,
      [],
      "ok",
      { ok: false, motivo: "otra_cosa" },
      FOTO({ ok: undefined }),
      FOTO({ corrida_id: 0 }),
      FOTO({ corrida_id: "12" }),
      FOTO({ desde: "ayer" }),
      FOTO({ desde: "2026-11-13T21:00:00Z" }),
      FOTO({ arranco_de_cero: "no" }),
      FOTO({ consultas: -1 }),
      FOTO({ filas: 1.5 }),
      FOTO({ descartadas: "819" }),
    ]) {
      expect(leerFotoRendimiento(malo), JSON.stringify(malo)).toBeNull();
    }
  });
});
