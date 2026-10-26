import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `leerFiltros` es un complemento de la lista (ADR-0512, actividad 7): pase lo que pase con la base, devuelve datos o `null`, nunca tira, no hace esperar
// a la lista más de 2 s y anota el fallo UNA vez cada 10 s. La base y la caché de Next se reemplazan: aquí solo se prueba lo que decide la tienda.
vi.mock("server-only", () => ({}));
// `cache` de React recuerda por petición; fuera de una petición recordaría entre pruebas: aquí no recuerda nada.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(f: T) => f }));
const lectura = vi.fn();
vi.mock("./compartido-servidor", () => ({
  db: () => {
    throw new Error("la prueba no abre la base");
  },
  lecturaCompartida: () => (...args: unknown[]) => lectura(...args),
}));
vi.mock("./catalogo-servidor", () => ({ SEGUNDOS_DEL_CATALOGO: 30 }));
vi.mock("./tiendas-servidor", () => ({ leerSedes: async () => [] }));

import { leerFiltros } from "./filtros-servidor";

const BUENA = { sede: null, variantes: [["a", "NEG", "M"]], colores: { NEG: "neutro" } };
const SEDE = "f775651f-62c8-4ff4-a414-b5614026d0cd";
let anotado: { mock: { calls: unknown[][] }; mockRestore: () => void };
let ahora = Date.parse("2026-10-26T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  // Cada prueba empieza 1 minuto después de la anterior: el aviso de «una vez cada 10 s» ya no cuenta lo de antes.
  ahora += 60_000;
  vi.setSystemTime(ahora);
  lectura.mockReset();
  anotado = vi.spyOn(console, "error").mockImplementation(() => undefined) as unknown as typeof anotado;
});
afterEach(() => {
  anotado.mockRestore();
  vi.useRealTimers();
});

const lineas = () => anotado.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])) as { evento: string; mensaje: string });

describe("leerFiltros", () => {
  it("con la base en orden devuelve las variantes, sin nada en el registro", async () => {
    lectura.mockResolvedValue(BUENA);
    const datos = await leerFiltros(SEDE);
    expect(datos?.variantes).toEqual([{ prenda: "a", color: "NEG", talla: "M" }]);
    expect(lineas()).toEqual([]);
  });

  it("si la base falla (sin permiso, la función no existe…) devuelve null y lo anota, sin tirar la página", async () => {
    lectura.mockRejectedValue(new Error("permission denied for function tienda_filtros"));
    await expect(leerFiltros(SEDE)).resolves.toBeNull();
    expect(lineas()).toEqual([{ evento: "tienda_filtros_fallo", mensaje: "permission denied for function tienda_filtros" }]);
  });

  it("si responde algo que no es lo esperado, también es null y también se anota", async () => {
    lectura.mockResolvedValue({ variantes: "no soy una lista" });
    await expect(leerFiltros(SEDE)).resolves.toBeNull();
    expect(lineas()).toEqual([{ evento: "tienda_filtros_fallo", mensaje: "la base respondió algo que no es lo esperado" }]);
  });

  it("si tarda, la lista no espera más de 2 s: devuelve null y lo anota", async () => {
    lectura.mockReturnValue(new Promise(() => undefined)); // nunca responde
    const espera = leerFiltros(SEDE);
    await vi.advanceTimersByTimeAsync(1999);
    expect(lineas()).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    await expect(espera).resolves.toBeNull();
    expect(lineas()).toEqual([{ evento: "tienda_filtros_fallo", mensaje: "tarda más de 2000 ms" }]);
  });

  it("anota el fallo una vez cada 10 s: con la base caída y mucha gente, el registro no se inunda", async () => {
    lectura.mockRejectedValue(new Error("la base no contesta"));
    for (let i = 0; i < 50; i++) await leerFiltros(SEDE);
    expect(lineas()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_001);
    await leerFiltros(SEDE);
    expect(lineas()).toHaveLength(2);
  });

  it("no deja un reloj colgado: tras responder, no queda nada pendiente", async () => {
    lectura.mockResolvedValue(BUENA);
    await leerFiltros(SEDE);
    expect(vi.getTimerCount()).toBe(0);
  });
});
