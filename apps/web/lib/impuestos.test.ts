import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const base = vi.hoisted(() => ({ pagosCaidos: false }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nombre: string) => {
      if (nombre === "fn_impuestos_pagos") return base.pagosCaidos ? { data: null, error: { message: "se cayó" } } : { data: [], error: null };
      return { data: {}, error: null };
    },
  }),
}));

vi.mock("@/lib/impuestos-reglas", async () => ({
  ...(await import("./impuestos-reglas")),
  leerPanelImpuestos: () => ({ mes: "2026-09", mesActual: "2026-10" }),
}));

import { getPanelImpuestos } from "./impuestos";

beforeEach(() => {
  base.pagosCaidos = false;
});

describe("getPanelImpuestos: lo pagado a SUNAT", () => {
  it("si se leyó, trae los pagos y no marca falla", async () => {
    const r = await getPanelImpuestos("2026-09");
    expect(r.falla).toBeNull();
    expect(r.datos?.pagos).toEqual([]);
    expect(r.datos?.pagosFalla).toBeUndefined();
  });

  it("si no se pudo leer, lo dice y lo marca; el panel se dibuja igual", async () => {
    base.pagosCaidos = true;
    const r = await getPanelImpuestos("2026-09");
    expect(r.falla).toMatch(/No se pudo leer lo pagado a SUNAT/);
    expect(r.datos?.pagosFalla).toBe(true);
    expect(r.datos?.pagos).toBeUndefined();
  });
});
