import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FILAS_POR_PAGINA } from "./resultado";
import { leerCampanasVigentes } from "./campanas-vigentes";

// Un `supabase.rpc(...)` que sirve N filas como PostgREST: corta cada respuesta en FILAS_POR_PAGINA, sin error.
function clienteCon(filas: number) {
  const tabla = Array.from({ length: filas }, (_, i) => ({ variante_id: `v${String(i).padStart(5, "0")}`, etiqueta_id: "e1", etiqueta_nombre: "Aniversario CAYLA", descuento_pct: 10 }));
  const rpc = vi.fn<(nombre: string, args: object) => unknown>(() => ({
    order: () => ({ range: async (desde: number, hasta: number) => ({ data: tabla.slice(desde, Math.min(hasta + 1, desde + FILAS_POR_PAGINA)), error: null }) }),
  }));
  return { rpc };
}

describe("leerCampanasVigentes", () => {
  it("trae las 2.518 prendas de la campaña de TRU, no las 1.000 que entrega PostgREST (2026-10-23)", async () => {
    const cliente = clienteCon(2518);
    const { data, error } = await leerCampanasVigentes(cliente as never, "tru");
    expect(error).toBeNull();
    expect(data).toHaveLength(2518);
    expect(new Set(data!.map((c) => c.variante_id)).size).toBe(2518);
  });

  it("pregunta por la tienda y no vuelve a pedir si todo cabe en una página", async () => {
    const cliente = clienteCon(117);
    const { data } = await leerCampanasVigentes(cliente as never, "tru");
    expect(data).toHaveLength(117);
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(cliente.rpc).toHaveBeenCalledWith("campanas_vigentes", { p_ubicacion_id: "tru" });
  });

  it("una página con error corta la lectura: media lista nunca se entrega como lista entera", async () => {
    const rpc = vi.fn(() => ({ order: () => ({ range: async () => ({ data: null, error: { message: "se cayó", code: "XX000" } }) }) }));
    const { data, error } = await leerCampanasVigentes({ rpc } as never, "tru");
    expect(data).toBeNull();
    expect(error?.code).toBe("XX000");
  });
});

describe("nadie lee las campañas vigentes de un solo golpe", () => {
  // La caja, Apartados y el sondeo de precios deben pasar por `leerCampanasVigentes`: una llamada suelta se corta en 1.000 filas.
  const RAIZ = join(__dirname, "..");
  const SUELTA = /\.rpc\(\s*["']campanas_vigentes["']/;

  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nombre) => {
      if (nombre === "node_modules" || nombre === ".next") return [];
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) return archivos(ruta);
      return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
    });
  }

  it("ningún archivo llama .rpc(\"campanas_vigentes\") fuera del lector por páginas", () => {
    const sueltas = [...archivos(join(RAIZ, "app")), ...archivos(join(RAIZ, "components")), ...archivos(join(RAIZ, "lib"))]
      .filter((ruta) => !ruta.endsWith(join("lib", "campanas-vigentes.ts")))
      .filter((ruta) => SUELTA.test(readFileSync(ruta, "utf8")))
      .map((ruta) => relative(RAIZ, ruta));
    expect(sueltas).toEqual([]);
  });
});
