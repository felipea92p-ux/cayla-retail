import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./errores", () => ({ capturarError: vi.fn() }));

// `leerPieza` es la única puerta por la que Análisis lee: aquí se fija lo que promete (principio 9). Nunca lanza, no espera más del
// tope, no reintenta y avisa por pieza a lo más una vez por hora sin llevar nada que no sea un id o un código. El freno de avisos vive
// en el módulo, así que cada prueba lo carga de cero.

const TIENDA = "11111111-2222-3333-4444-555555555555";

async function cargar() {
  vi.resetModules();
  const { capturarError } = await import("./errores");
  const { leerPieza } = await import("./analisis-lectura");
  const { TOPE_LECTURA_MS, AVISOS_CADA_MS } = await import("./analisis-con-tope");
  vi.mocked(capturarError).mockClear();
  return { capturarError: vi.mocked(capturarError), leerPieza, TOPE_LECTURA_MS, AVISOS_CADA_MS };
}

describe("leerPieza", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("si responde, da los datos y no avisa nada", async () => {
    const { leerPieza, capturarError } = await cargar();
    const r = await leerPieza("sede", { ubicacion_id: TIENDA }, async () => ["prenda"]);
    expect(r).toEqual({ estado: "ok", datos: ["prenda"] });
    expect(capturarError).not.toHaveBeenCalled();
  });

  it("una lista vacía es un dato, no una falla (una tienda sin prendas no es «no se pudo leer»)", async () => {
    const { leerPieza, capturarError } = await cargar();
    expect(await leerPieza("por_llegar", {}, async () => [])).toEqual({ estado: "ok", datos: [] });
    expect(capturarError).not.toHaveBeenCalled();
  });

  it("si la base da un error, no lanza: dice «no se pudo» y avisa con SU CÓDIGO, no con su mensaje", async () => {
    const { leerPieza, capturarError } = await cargar();
    const dijoLaBase = { code: "57014", message: "canceling statement due to statement timeout (Juana Pérez, 45678912)" };
    const r = await leerPieza("sede", { ubicacion_id: TIENDA }, async () => {
      throw dijoLaBase;
    });
    expect(r).toEqual({ estado: "no_se_pudo" });
    expect(capturarError).toHaveBeenCalledTimes(1);
    const [donde, error, contexto] = capturarError.mock.calls[0]!;
    expect(donde).toBe("analisis.sede");
    expect((error as Error).message).toBe("Análisis: la lectura falló");
    expect((error as Error & { code?: string }).code).toBe("57014");
    expect(contexto).toMatchObject({ pieza: "sede", motivo: "error", ubicacion_id: TIENDA });
    expect(JSON.stringify(capturarError.mock.calls)).not.toMatch(/Juana|Pérez|45678912/);
  });

  it("si la base responde algo que no se entiende (null), dice «no se pudo» y avisa «sin datos»", async () => {
    const { leerPieza, capturarError } = await cargar();
    expect(await leerPieza("por_llegar", { ubicacion_id: TIENDA }, async () => null)).toEqual({ estado: "no_se_pudo" });
    expect(capturarError.mock.calls[0]![2]).toMatchObject({ motivo: "sin_datos" });
  });

  it("si la lectura lanza antes de empezar (sin esperar nada), tampoco rompe", async () => {
    const { leerPieza } = await cargar();
    const r = await leerPieza("rinde", {}, () => {
      throw new Error("no hay cliente");
    });
    expect(r).toEqual({ estado: "no_se_pudo" });
  });

  it("si no responde, el tope la da por perdida: la pantalla no se queda esperando y no se reintenta", async () => {
    const { leerPieza, capturarError, TOPE_LECTURA_MS } = await cargar();
    const leer = vi.fn(() => new Promise<string>(() => {}));
    const espera = leerPieza("frescura", { ubicacion_id: TIENDA }, leer);
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS - 1);
    expect(capturarError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await espera).toEqual({ estado: "tope_vencido" });
    expect(leer).toHaveBeenCalledTimes(1);
    expect(capturarError.mock.calls[0]![2]).toMatchObject({ pieza: "frescura", motivo: "tope_vencido", ms: TOPE_LECTURA_MS });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("una lectura sana pero lenta (3,8 s, lo más lento medido) no se corta", async () => {
    const { leerPieza, capturarError } = await cargar();
    const espera = leerPieza("rinde", {}, () => new Promise<string>((resolver) => setTimeout(() => resolver("rinde"), 3_800)));
    await vi.advanceTimersByTimeAsync(3_800);
    expect(await espera).toEqual({ estado: "ok", datos: "rinde" });
    expect(capturarError).not.toHaveBeenCalled(); // «rinde» no pide aviso de lenta
  });

  it("como máximo un aviso por pieza y por hora, aunque fallen las tres tiendas y varias visitas", async () => {
    const { leerPieza, capturarError, AVISOS_CADA_MS } = await cargar();
    const cae = async () => {
      throw { code: "57014" };
    };
    await Promise.all([leerPieza("sede", { ubicacion_id: TIENDA }, cae), leerPieza("sede", { ubicacion_id: TIENDA }, cae), leerPieza("sede", {}, cae)]);
    await leerPieza("rinde", {}, cae);
    expect(capturarError).toHaveBeenCalledTimes(2); // una por pieza
    await vi.advanceTimersByTimeAsync(AVISOS_CADA_MS - 1);
    await leerPieza("sede", {}, cae);
    expect(capturarError).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await leerPieza("sede", {}, cae);
    expect(capturarError).toHaveBeenCalledTimes(3);
  });

  it("avisa de la lectura lenta solo si se le pidió, y también lleva el tiempo", async () => {
    const { leerPieza, capturarError } = await cargar();
    const tarda = (ms: number) => () => new Promise<string>((resolver) => setTimeout(() => resolver("x"), ms));
    const sinPedir = leerPieza("conteos", {}, tarda(4_000));
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await sinPedir).toEqual({ estado: "ok", datos: "x" });
    expect(capturarError).not.toHaveBeenCalled();

    const pedida = leerPieza("sede", { ubicacion_id: TIENDA }, tarda(3_200), 3_000);
    await vi.advanceTimersByTimeAsync(3_200);
    expect(await pedida).toEqual({ estado: "ok", datos: "x" });
    expect(capturarError).toHaveBeenCalledTimes(1);
    expect(capturarError.mock.calls[0]![0]).toBe("analisis.sede.lenta");
    expect(capturarError.mock.calls[0]![2]).toMatchObject({ pieza: "sede", motivo: "lenta", ms: 3_200 });
  });

  it("avisar de una lectura lenta no calla, esa hora, a la que después falla de verdad", async () => {
    const { leerPieza, capturarError, TOPE_LECTURA_MS } = await cargar();
    const lenta = leerPieza("sede", { ubicacion_id: TIENDA }, () => new Promise<string>((resolver) => setTimeout(() => resolver("x"), 3_200)), 3_000);
    await vi.advanceTimersByTimeAsync(3_200);
    await lenta;
    const colgada = leerPieza("sede", { ubicacion_id: TIENDA }, () => new Promise<string>(() => {}), 3_000);
    await vi.advanceTimersByTimeAsync(TOPE_LECTURA_MS);
    expect(await colgada).toEqual({ estado: "tope_vencido" });
    expect(capturarError.mock.calls.map((c) => c[0])).toEqual(["analisis.sede.lenta", "analisis.sede"]);
  });

  it("una lectura rápida que se pidió vigilar no avisa", async () => {
    const { leerPieza, capturarError } = await cargar();
    await leerPieza("sede", {}, async () => "x", 3_000);
    expect(capturarError).not.toHaveBeenCalled();
  });

  it("si Sentry (o el aviso) falla, la lectura sigue: avisar es lo último que debe romper la pantalla", async () => {
    const { leerPieza, capturarError } = await cargar();
    capturarError.mockImplementationOnce(() => {
      throw new Error("Sentry no responde");
    });
    expect(await leerPieza("sede", {}, async () => null)).toEqual({ estado: "no_se_pudo" });
  });

  it("si armar el aviso lanza (unos ids que no se dejan leer), la lectura igual contesta: `leerPieza` no lanza NUNCA", async () => {
    const { leerPieza, capturarError } = await cargar();
    const ids = new Proxy({}, { ownKeys: () => { throw new Error("ids rotos"); } }) as Record<string, string>;
    expect(await leerPieza("sede", ids, async () => null)).toEqual({ estado: "no_se_pudo" });
    expect(await leerPieza("sede", ids, async () => { throw { code: "57014" }; })).toEqual({ estado: "no_se_pudo" });
    expect(capturarError).not.toHaveBeenCalled();
  });

  it("en desarrollo, la terminal dice POR QUÉ falló (con el mensaje de quien falló); en producción y en las pruebas no escribe nada, y el aviso nunca lo lleva", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { leerPieza, capturarError } = await cargar();
      const cae = async () => {
        throw { code: "42883", message: "function retail.fn_nueva() does not exist" };
      };
      await leerPieza("sede", {}, cae);
      expect(aviso).not.toHaveBeenCalled(); // NODE_ENV de vitest: "test"

      vi.stubEnv("NODE_ENV", "production");
      await leerPieza("rinde", {}, cae);
      expect(aviso).not.toHaveBeenCalled();

      vi.stubEnv("NODE_ENV", "development");
      await leerPieza("por_llegar", {}, cae);
      expect(aviso).toHaveBeenCalledWith("Análisis (por_llegar): function retail.fn_nueva() does not exist");
      expect(JSON.stringify(capturarError.mock.calls)).not.toContain("fn_nueva");
    } finally {
      vi.unstubAllEnvs();
      aviso.mockRestore();
    }
  });

  it("un nombre que alguien pase como «id» no llega al aviso", async () => {
    const { leerPieza, capturarError } = await cargar();
    await leerPieza("sede", { ubicacion_id: "Tienda Lima" }, async () => null);
    expect(capturarError.mock.calls[0]![2]).not.toHaveProperty("ubicacion_id");
    expect(JSON.stringify(capturarError.mock.calls)).not.toContain("Tienda Lima");
  });
});
