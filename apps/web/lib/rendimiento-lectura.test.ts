import { afterEach, describe, expect, it, vi } from "vitest";
import { dejarCausa, leerLecturasDeSede, type LlamarRpc } from "./rendimiento-lectura";

const TIENDA = "11111111-1111-4111-8111-111111111111";

/** Una base de mentira: anota qué se le pidió y responde bien salvo lo que se le diga que falle. */
function baseFalsa(falla: Record<string, { code?: string; message: string }> = {}) {
  const pedidos: { nombre: string; args: Record<string, unknown> }[] = [];
  const llamar: LlamarRpc = async (nombre, args) => {
    pedidos.push({ nombre, args });
    return falla[nombre] ? { data: null, error: falla[nombre] } : { data: [], error: null };
  };
  return { llamar, pedidos };
}

afterEach(() => vi.restoreAllMocks());

describe("leerLecturasDeSede: las tres lecturas se piden siempre", () => {
  it("pide la serie, el historial de cambios de meta y las ventas por hora de la tienda", async () => {
    const { llamar, pedidos } = baseFalsa();
    await leerLecturasDeSede(llamar, TIENDA, "2026-09-01", "2026-09-30");
    expect(pedidos.map((p) => p.nombre).sort()).toEqual(["fn_metas_historial", "fn_rendimiento_detalle", "fn_rendimiento_serie"]);
    for (const p of pedidos) expect(p.args.p_ubicacion_id).toBe(TIENDA);
    expect(pedidos.find((p) => p.nombre === "fn_rendimiento_serie")!.args).toMatchObject({ p_desde: "2026-09-01", p_hasta: "2026-09-30" });
  });

  it("el historial se pide para CADA tienda, no solo para la que se mira (el 2026-10-03 el panel decía «nadie cambió una meta» por esto)", async () => {
    const { llamar, pedidos } = baseFalsa();
    for (const t of ["t1", "t2", "t3"]) await leerLecturasDeSede(llamar, t, "2026-09-01", "2026-09-30");
    const deHistorial = pedidos.filter((p) => p.nombre === "fn_metas_historial").map((p) => p.args.p_ubicacion_id);
    expect(deHistorial).toEqual(["t1", "t2", "t3"]);
  });

  it("devuelve los datos tal cual cuando todo sale bien, sin registrar nada", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    const { llamar } = baseFalsa();
    const r = await leerLecturasDeSede(llamar, TIENDA, "2026-09-01", "2026-09-30");
    expect(r.serie).toEqual({ data: [], error: null });
    expect(espia).not.toHaveBeenCalled();
  });
});

describe("leerLecturasDeSede: una falla deja su causa y no se disfraza de «sin datos»", () => {
  it("registra el código y el mensaje de la base de la lectura que falló, y de ninguna otra", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    const { llamar } = baseFalsa({ fn_rendimiento_detalle: { code: "42883", message: "function retail.fn_rendimiento_detalle does not exist" } });
    await leerLecturasDeSede(llamar, TIENDA, "2026-09-01", "2026-09-30");
    expect(espia).toHaveBeenCalledTimes(1);
    const linea = String(espia.mock.calls[0][0]);
    expect(linea).toContain("las ventas por hora");
    expect(linea).toContain("42883");
    expect(linea).toContain("does not exist");
  });

  it("devuelve el error intacto (y no una lista vacía) para que quien llama no lo confunda con «no hay datos»", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { llamar } = baseFalsa({ fn_rendimiento_serie: { code: "42501", message: "No puedes ver el rendimiento de esa tienda" } });
    const r = await leerLecturasDeSede(llamar, TIENDA, "2026-09-01", "2026-09-30");
    expect(r.serie.error?.code).toBe("42501");
    expect(r.serie.data).toBeNull();
    expect(r.historial.error).toBeNull(); // las demás siguen
  });

  it("si fallan las tres, deja las tres causas (una por lectura)", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = { code: "XX000", message: "caída" };
    const { llamar } = baseFalsa({ fn_rendimiento_serie: e, fn_metas_historial: e, fn_rendimiento_detalle: e });
    await leerLecturasDeSede(llamar, TIENDA, "2026-09-01", "2026-09-30");
    expect(espia).toHaveBeenCalledTimes(3);
  });
});

describe("dejarCausa", () => {
  it("sin error no registra", () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    dejarCausa("algo", null);
    expect(espia).not.toHaveBeenCalled();
  });
  it("sin código dice «sin código» en vez de «undefined»", () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    dejarCausa("las metas de cada persona", { message: "timeout" });
    expect(String(espia.mock.calls[0][0])).toContain("sin código");
    expect(String(espia.mock.calls[0][0])).not.toContain("undefined");
  });
  it("no incluye identificadores de la tienda ni de personas: solo la lectura, el código y el mensaje de la base", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    const { llamar } = baseFalsa({ fn_metas_historial: { code: "XX000", message: "falló" } });
    await leerLecturasDeSede(llamar, TIENDA, "2026-09-01", "2026-09-30");
    expect(String(espia.mock.calls[0][0])).not.toContain(TIENDA);
  });
});
