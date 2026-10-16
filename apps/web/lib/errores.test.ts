import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { capturarError } from "./errores";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// Esta función solo trabaja cuando algo ya salió mal, así que nadie la ve fallar. Estas pruebas fijan lo
// que tiene que quedar en el log para diagnosticar: el motivo real, no el genérico.

function linea(): Record<string, unknown> {
  const espia = vi.mocked(console.error);
  return JSON.parse(String(espia.mock.calls.at(-1)?.[0]));
}

describe("capturarError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("de un fetch caído guarda la causa real (ENOTFOUND), no solo «fetch failed»", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const caido = new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }) });
    capturarError("lucode: sin respuesta", caido, { ruta: "/boleta" });
    expect(linea()).toEqual({ nivel: "error", ruta: "/boleta", donde: "lucode: sin respuesta", mensaje: "fetch failed", tipo: "TypeError", causa: "ENOTFOUND" });
  });

  it("de un error de supabase-js guarda su código de Postgres", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    capturarError("x", { message: "permission denied", code: "42501" });
    expect(linea()).toMatchObject({ mensaje: "permission denied", codigo: "42501" });
  });

  it("el contexto no puede pisar dónde ni el mensaje", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    capturarError("real", "texto suelto", { donde: "falso", mensaje: "falso" });
    expect(linea()).toMatchObject({ donde: "real", mensaje: "texto suelto" });
  });

  it("manda el mismo error a Sentry, agrupado por dónde pasó y con su contexto (ADR-0424)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const caido = Object.assign(new Error("ya emitido"), { code: "P0001" });
    capturarError("lucode: emitido sin guardar", caido, { comprobante: "B001-123" });
    expect(Sentry.captureException).toHaveBeenLastCalledWith(caido, {
      fingerprint: ["capturarError", "lucode: emitido sin guardar"],
      tags: { donde: "lucode: emitido sin guardar" },
      contexts: { detalle: { comprobante: "B001-123", codigo: "P0001", causa: undefined } },
    });
  });

  it("un error que no es Error (el de supabase-js) llega a Sentry como Error con su mensaje", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    capturarError("x", { message: "permission denied", code: "42501" });
    const [enviado] = vi.mocked(Sentry.captureException).mock.lastCall ?? [];
    expect(enviado).toBeInstanceOf(Error);
    expect((enviado as Error).message).toBe("permission denied");
  });
});
