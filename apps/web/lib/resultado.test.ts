import { afterEach, describe, expect, it, vi } from "vitest";
import { FILAS_POR_PAGINA, IDS_POR_URL, leerPorTandas, leerTodas, opcional } from "./resultado";

describe("opcional", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve lo que la lectura devolvió", async () => {
    await expect(opcional(Promise.resolve({ n: 3 }), "algo")).resolves.toEqual({ n: 3 });
  });

  it("si la lectura lanza, devuelve null y deja la causa real en el log con lo que se estaba leyendo", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const causa = new Error("se cayó la red");
    await expect(opcional(Promise.reject(causa), "la cola de SUNAT")).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith("No se pudo leer la cola de SUNAT:", causa);
  });

  it("un null legítimo (la lectura devolvió null a propósito) sigue siendo null y no ensucia el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(opcional(Promise.resolve(null), "algo")).resolves.toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("leerTodas", () => {
  // Una «tabla» de N filas servida como PostgREST: corta cada respuesta en FILAS_POR_PAGINA.
  const tabla = (n: number) => Array.from({ length: n }, (_, i) => i);
  const servir = (filas: number[]) => vi.fn(async (desde: number, hasta: number) => ({ data: filas.slice(desde, Math.min(hasta + 1, desde + FILAS_POR_PAGINA)), error: null }));

  it("junta todas las páginas cuando hay más filas que el tope (1.295 variantes, sep-2026)", async () => {
    const pagina = servir(tabla(1295));
    const res = await leerTodas(pagina);
    expect(res.data).toHaveLength(1295);
    expect(res.data?.at(-1)).toBe(1294);
    // Una sola tanda de 3 páginas en paralelo: la tercera vuelve vacía y cierra.
    expect(pagina).toHaveBeenCalledTimes(3);
  });

  it("pasadas las 3.000 filas pide otra tanda, sin repetir ni saltarse filas", async () => {
    const pagina = servir(tabla(3500));
    const res = await leerTodas(pagina);
    expect(res.data).toEqual(tabla(3500));
    expect(pagina).toHaveBeenCalledTimes(6);
  });

  it("en serie (RPC que casi siempre cabe): una sola llamada si no llena la página, y sigue si la llena", async () => {
    const chica = servir(tabla(40));
    expect((await leerTodas(chica, { enParalelo: 1 })).data).toHaveLength(40);
    expect(chica).toHaveBeenCalledTimes(1);
    const grande = servir(tabla(2100));
    expect((await leerTodas(grande, { enParalelo: 1 })).data).toEqual(tabla(2100));
    expect(grande).toHaveBeenCalledTimes(3);
  });

  it("una página con error no entrega media lista", async () => {
    let llamada = 0;
    const res = await leerTodas(async () =>
      ++llamada === 1 ? { data: tabla(FILAS_POR_PAGINA), error: null } : { data: null, error: { message: "timeout" } },
    );
    expect(res).toEqual({ data: null, error: { message: "timeout" } });
  });
});

describe("leerPorTandas — una lista larga de ids no rompe la URL", () => {
  const ids = Array.from({ length: 300 }, (_, i) => `id-${i}`);

  it("300 ids viajan en tandas de a lo más IDS_POR_URL, sin perder ni repetir ninguno", async () => {
    const tamanos: number[] = [];
    const filas = await leerPorTandas(
      [...ids, "id-0", "id-1"],
      async (tanda) => {
        tamanos.push(tanda.length);
        return { data: tanda.map((id) => ({ id })), error: null };
      },
      "las prendas",
    );
    expect(Math.max(...tamanos)).toBeLessThanOrEqual(IDS_POR_URL);
    expect(tamanos.reduce((s, n) => s + n, 0)).toBe(300);
    expect(new Set(filas.map((f) => f.id)).size).toBe(300);
  });

  it("si una tanda falla, revienta: media lista no se entrega como entera", async () => {
    let n = 0;
    await expect(
      leerPorTandas(ids, async (tanda) => (++n === 2 ? { data: null, error: { message: "URI too long" } } : { data: tanda, error: null }), "las prendas"),
    ).rejects.toThrow(/las prendas: URI too long/);
  });

  it("sin ids no consulta", async () => {
    const leer = vi.fn();
    expect(await leerPorTandas([], leer, "nada")).toEqual([]);
    expect(leer).not.toHaveBeenCalled();
  });
});
