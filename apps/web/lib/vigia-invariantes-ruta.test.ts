import { beforeEach, describe, expect, it, vi } from "vitest";

// La ruta del vigía de invariantes (`app/api/salud/invariantes/route.ts`, ADR-0632) corrida de verdad, con la base y Sentry de mentira:
// quién pasa, qué se avisa y qué responde cuando la base falla. La corrida en sí la prueba `pnpm pruebas:vigia-invariantes` en Postgres.

const estado = vi.hoisted(() => ({
  respuesta: { data: null as unknown, error: null as { message: string } | null },
  llamadas: 0,
  sinLlave: false,
  capturas: [] as { donde: string; contexto: unknown }[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  crearClienteAdmin: () => {
    if (estado.sinLlave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
    return {
      rpc: async () => {
        estado.llamadas++;
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
vi.mock("@/lib/vigia-invariantes-reglas", () => import("./vigia-invariantes-reglas"));

const { GET } = await import("../app/api/salud/invariantes/route");

const CORRIDA = (cambios: Record<string, unknown> = {}) => ({
  ultima_corrida_en: "2026-11-10T03:30:01.000-05:00",
  invariantes: 28,
  limpias: 25,
  violadas: 0,
  nuevas_graves: 0,
  nuevas_leves: 0,
  conocidas: 0,
  errores: 0,
  omitidas: 3,
  detalle: [],
  ...cambios,
});
const pedir = (clave?: string) =>
  GET(new Request("https://erp.cayla.pe/api/salud/invariantes", { headers: clave ? { authorization: `Bearer ${clave}` } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "secreto-del-cron");
  estado.respuesta = { data: CORRIDA(), error: null };
  estado.llamadas = 0;
  estado.sinLlave = false;
  estado.capturas = [];
});

describe("GET /api/salud/invariantes", () => {
  it("sin la clave del cron, o con otra, no pasa nadie y no toca la base", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir("otra")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await pedir("")).status).toBe(401);
    expect(estado.llamadas).toBe(0);
  });

  it("una corrida sin nada nuevo responde 200 y no despierta a nadie, aunque haya lo ya conocido", async () => {
    estado.respuesta = { data: CORRIDA({ violadas: 1, conocidas: 4 }), error: null };
    const r = await pedir("secreto-del-cron");
    expect(r.status).toBe(200);
    expect(estado.llamadas).toBe(1);
    expect(estado.capturas).toEqual([]);
  });

  it("algo nuevo roto o algo que no se pudo mirar va a Sentry con conteos e ids, nunca con el mensaje de la base", async () => {
    estado.respuesta = {
      data: CORRIDA({
        violadas: 1,
        nuevas_graves: 1,
        errores: 1,
        detalle: [
          { id: "INV-02", nombre: "venta_cuadra_con_sus_pagos", gravedad: 1, estado: "viola", total: 1, nuevas: 1, mensaje: null },
          { id: "INV-23", nombre: "stock_por_dueno_cuadra", gravedad: 1, estado: "error", total: 0, nuevas: 0, mensaje: "division by zero" },
        ],
      }),
      error: null,
    };
    const r = await pedir("secreto-del-cron");
    expect(r.status).toBe(200);
    expect(estado.capturas).toHaveLength(1);
    expect(estado.capturas[0].contexto).toEqual({ nuevas_graves: 1, nuevas_leves: 0, errores: 1, invariantes: ["INV-02:viola:1", "INV-23:error:0"] });
    expect(JSON.stringify(await r.json())).not.toMatch(/division/);
  });

  it("si la base falla (o la migración no está pegada), 500 y aviso: nadie lee la respuesta del cron", async () => {
    estado.respuesta = { data: null, error: { message: "Could not find the function retail.fn_correr_invariantes" } };
    expect((await pedir("secreto-del-cron")).status).toBe(500);
    expect(estado.capturas.map((c) => c.donde)).toEqual(["salud/invariantes (cron): fn_correr_invariantes falló"]);
  });

  it("sin la llave de servicio, 500 y aviso", async () => {
    estado.sinLlave = true;
    expect((await pedir("secreto-del-cron")).status).toBe(500);
    expect(estado.capturas).toHaveLength(1);
  });

  it("una respuesta con otra forma no se toma por «todo bien»: 500 y aviso", async () => {
    estado.respuesta = { data: { algo: "distinto" }, error: null };
    expect((await pedir("secreto-del-cron")).status).toBe(500);
    expect(estado.capturas).toHaveLength(1);
  });

  it("si otra corrida sigue en curso, responde sin avisar (no es una falla)", async () => {
    estado.respuesta = { data: { ok: false, motivo: "ya_corriendo" }, error: null };
    const r = await pedir("secreto-del-cron");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ corrio: false, motivo: "ya_corriendo" });
    expect(estado.capturas).toEqual([]);
  });
});
