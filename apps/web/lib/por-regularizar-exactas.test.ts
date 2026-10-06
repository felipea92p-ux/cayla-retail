import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCandidatasExactas } from "./por-regularizar";

// La lectura del tramo exacto (D1, 2026-10-05): `fn_candidatas_de_venta` es por tienda, así que se pide una vez por cada tienda con
// pendientes, y si falla NO tumba Por regularizar (principio 9): devuelve `null` y el aviso.

const base = vi.hoisted(() => ({
  llamadas: [] as { nombre: string; args: Record<string, unknown> }[],
  porSede: {} as Record<string, { prenda_id: string; variante_id: string; disponible: number; limpia: boolean }[]>,
  fallaEn: null as string | null,
}));

vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    rpc: (nombre: string, args: Record<string, unknown>) => ({
      range: async (desde: number, hasta: number) => {
        base.llamadas.push({ nombre, args });
        const sede = String(args.p_ubicacion_id);
        if (sede === base.fallaEn) return { data: null, error: { message: "cola_sin_permiso_sede" } };
        return { data: (base.porSede[sede] ?? []).slice(desde, hasta + 1), error: null };
      },
    }),
  }),
}));

beforeEach(() => {
  base.llamadas = [];
  base.porSede = {};
  base.fallaEn = null;
});

describe("getCandidatasExactas — el tramo exacto de cada tienda", () => {
  it("una lectura por tienda (sin repetir) y todas las parejas juntas", async () => {
    base.porSede = {
      tru: [{ prenda_id: "v1", variante_id: "a", disponible: 2, limpia: true }],
      aqp: [{ prenda_id: "v2", variante_id: "b", disponible: 1, limpia: false }],
    };
    const r = await getCandidatasExactas(["tru", "aqp", "tru"]);
    expect(base.llamadas.map((l) => [l.nombre, l.args.p_ubicacion_id])).toEqual([
      ["fn_candidatas_de_venta", "tru"],
      ["fn_candidatas_de_venta", "aqp"],
    ]);
    expect(r).toEqual({
      exactas: [
        { prendaId: "v1", varianteId: "a", disponible: 2 },
        { prendaId: "v2", varianteId: "b", disponible: 1 },
      ],
      fallo: null,
    });
  });

  it("sin tiendas con pendientes no pregunta nada", async () => {
    expect(await getCandidatasExactas([])).toEqual({ exactas: [], fallo: null });
    expect(base.llamadas).toEqual([]);
  });

  it("si una tienda falla, no inventa: sin tramo exacto (null) y con el aviso para la pantalla", async () => {
    base.fallaEn = "aqp";
    const r = await getCandidatasExactas(["tru", "aqp"]);
    expect(r.exactas).toBeNull();
    expect(r.fallo).toMatch(/busca cada una en todo el catálogo/);
  });
});
