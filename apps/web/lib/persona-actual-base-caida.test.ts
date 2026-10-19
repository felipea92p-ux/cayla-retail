import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// El 2026-10-17 la base se cayó y `requirePersonaActualV2` tomó el error de red por «esta cuenta no tiene acceso»: mandó a todos a
// `/login?error=sin_persona`. Aquí se corre la función de verdad (con la base y Next de mentira) y se mira a dónde manda cada caso (ADR-0450).

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null; status: number };
const estado = vi.hoisted(() => ({
  claims: { data: { claims: { sub: "cuenta-1" } } as { claims: { sub: string } } | null, error: null as unknown },
  respuestas: {} as Record<string, Respuesta>,
  ruta: "/caja?dia=2026-10-17" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => estado.claims },
    rpc: (nombre: string) => {
      const r = estado.respuestas[nombre] ?? { data: null, error: null, status: 200 };
      const promesa = Promise.resolve(r) as Promise<Respuesta> & { maybeSingle: () => Promise<Respuesta> };
      promesa.maybeSingle = () => Promise.resolve(r);
      return promesa;
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}));
// Las pruebas de `apps/web` no tienen el alias `@/` (solo rutas relativas): las importaciones `@/…` de `persona-actual.ts` se atienden con los
// módulos de verdad por su ruta relativa. Agregar una `vitest.config.ts` con el alias le cambia a Knip qué pruebas reconoce.
vi.mock("@/lib/base-caida-reglas", () => import("./base-caida-reglas"));
vi.mock("@/lib/modulos", () => import("./modulos"));
vi.mock("@/lib/vista-global", () => import("./vista-global"));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(estado.ruta ? { "x-cayla-ruta": estado.ruta } : {}),
}));

async function adonde(): Promise<string> {
  const { requirePersonaActualV2 } = await import("./persona-actual");
  try {
    await requirePersonaActualV2();
    return "ENTRA";
  } catch (e) {
    return (e as Error).message.replace("REDIRECT ", "");
  }
}

const SIN_BASE_DE_CAJA = "/sin-base?desde=%2Fcaja%3Fdia%3D2026-10-17";

beforeEach(() => {
  vi.resetModules();
  estado.claims = { data: { claims: { sub: "cuenta-1" } }, error: null };
  estado.respuestas = {};
  estado.ruta = "/caja?dia=2026-10-17";
});

describe("requirePersonaActualV2 con la base caída: espera, no saca a nadie", () => {
  it("un fetch que ni llegó (status 0) va a «sin conexión con la base», con la pantalla a la que volver", async () => {
    estado.respuestas.fn_persona_actual_resumen = { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
    expect(await adonde()).toBe(SIN_BASE_DE_CAJA);
  });

  it("un 503 de PostgREST, una consulta cancelada por tiempo y un 504 de la puerta también", async () => {
    for (const r of [
      { data: null, error: { code: "PGRST002", message: "Could not query the database for the schema cache" }, status: 503 },
      { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" }, status: 500 },
      { data: null, error: { code: "", message: "<html>504 Gateway Time-out</html>" }, status: 504 },
    ]) {
      estado.respuestas.fn_persona_actual_resumen = r;
      expect(await adonde(), JSON.stringify(r)).toBe(SIN_BASE_DE_CAJA);
    }
  });

  it("sin la cabecera de la ruta (una carga que no pasó por el proxy), va a /sin-base a secas", async () => {
    estado.ruta = null;
    estado.respuestas.fn_persona_actual_resumen = { data: null, error: { message: "x" }, status: 0 };
    expect(await adonde()).toBe("/sin-base");
  });

  it("Auth sin responder al renovar la sesión también espera (la sesión sigue abierta)", async () => {
    estado.claims = { data: null, error: new AuthRetryableFetchError("fetch failed", 0) };
    expect(await adonde()).toBe(SIN_BASE_DE_CAJA);
  });
});

describe("lo que SÍ es «sin acceso» sigue siendo «sin acceso» (falla cerrado)", () => {
  it("la base contestó y no hay fila de persona: /login con «sin_persona»", async () => {
    estado.respuestas.fn_persona_actual_resumen = { data: null, error: null, status: 200 };
    expect(await adonde()).toBe("/login?error=sin_persona");
  });

  it("la base contestó con un permiso negado: /login con «sin_persona»", async () => {
    estado.respuestas.fn_persona_actual_resumen = { data: null, error: { code: "42501", message: "permission denied" }, status: 403 };
    expect(await adonde()).toBe("/login?error=sin_persona");
  });

  it("sin sesión de verdad (sin error de red): al login", async () => {
    estado.claims = { data: null, error: null };
    expect(await adonde()).toBe("/login");
  });

  it("un error de Auth que no es de red (token inválido) también va al login", async () => {
    estado.claims = { data: null, error: Object.assign(new Error("invalid JWT"), { name: "AuthApiError", status: 401 }) };
    expect(await adonde()).toBe("/login");
  });
});
