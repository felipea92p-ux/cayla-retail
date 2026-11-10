import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Una base falsa que responde como PostgREST: corta en 1.000 filas por página y deja elegir qué función falla.
type Falla = { message: string; code?: string };
const base = vi.hoisted(() => ({
  movimientos: [] as Record<string, unknown>[],
  fallas: {} as Record<string, { message: string; code?: string }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc(nombre: string, args?: Record<string, unknown>) {
      const error = (base.fallas[nombre] ?? null) as Falla | null;
      if (nombre === "fn_movimientos_dinero") {
        const limite = Number(args?.p_limite ?? 100);
        const constructor = {
          order: () => constructor,
          range: async (desde: number, hasta: number) => ({ data: error ? null : base.movimientos.slice(0, limite).slice(desde, hasta + 1), error }),
        };
        return constructor;
      }
      return Promise.resolve({ data: error ? null : [], error });
    },
  }),
}));

// Vitest no conoce el alias «@/»: cada módulo que la función usa se apunta al de verdad.
vi.mock("@/lib/cuentas-dinero-reglas", () => import("./cuentas-dinero-reglas"));
vi.mock("@/lib/cuadrar-reglas", () => import("./cuadrar-reglas"));
vi.mock("@/lib/gastos-reglas", () => import("./gastos-reglas"));
vi.mock("@/lib/planilla-salidas-reglas", () => import("./planilla-salidas-reglas"));
vi.mock("@/lib/compras-reglas", () => import("./compras-reglas"));
vi.mock("@/lib/rpc-por-paginas", () => import("./rpc-por-paginas"));

import { getAlertasPos, getMovimientos, getPlanillaPorRegistrar } from "./cuentas-dinero";

const fila = (i: number) => ({ id: `m${i}`, tipo: "deposito", fecha: "2026-10-15", monto: 10, comision: 0, estado: "vigente", puede_anular: false });

beforeEach(() => {
  base.movimientos = [];
  base.fallas = {};
});

describe("getMovimientos: la plata del dueño y la caja fuerte necesitan todo el historial", () => {
  it("no se queda en los últimos 150: producción ya tiene 219", async () => {
    base.movimientos = Array.from({ length: 219 }, (_, i) => fila(i));
    const r = await getMovimientos(null);
    expect(r.falla).toBeNull();
    expect(r.datos).toHaveLength(219);
  });

  it("sigue leyendo aunque pase de las 1.000 filas por página", async () => {
    base.movimientos = Array.from({ length: 1200 }, (_, i) => fila(i));
    expect((await getMovimientos(null)).datos).toHaveLength(1200);
  });

  it("si la base no responde, lo dice: no entrega una lista vacía como si no hubiera movimientos", async () => {
    base.fallas.fn_movimientos_dinero = { message: "se cayó" };
    const r = await getMovimientos(null);
    expect(r.datos).toEqual([]);
    expect(r.falla).toMatch(/No se pudo leer los movimientos/);
  });
});

describe("los avisos de apoyo de Cuentas y dinero dicen si no se pudieron leer", () => {
  it("máquinas atrasadas: si la lectura falla, trae la falla", async () => {
    base.fallas.fn_pos_alertas = { message: "se cayó" };
    const r = await getAlertasPos();
    expect(r.datos).toEqual([]);
    expect(r.falla).toMatch(/máquinas/);
  });

  it("máquinas atrasadas: si la función todavía no existe, calla", async () => {
    base.fallas.fn_pos_alertas = { message: "no existe", code: "PGRST202" };
    expect(await getAlertasPos()).toEqual({ datos: [], falla: null });
  });

  it("planilla por registrar: si la lectura falla, trae la falla", async () => {
    base.fallas.fn_planilla_salidas_por_registrar = { message: "se cayó" };
    const r = await getPlanillaPorRegistrar();
    expect(r.datos).toEqual([]);
    expect(r.falla).toMatch(/planilla por registrar/);
  });

  it("planilla por registrar: si la función todavía no existe, calla", async () => {
    base.fallas.fn_planilla_salidas_por_registrar = { message: "no existe", code: "42883" };
    expect(await getPlanillaPorRegistrar()).toEqual({ datos: [], falla: null });
  });
});
