import { describe, expect, it, vi } from "vitest";
import { bajoDemanda } from "./bajo-demanda";

// ADR-0674, Fase 2 · actividad 7: el código de una hoja se descarga recién cuando hace falta.

describe("bajoDemanda", () => {
  it("no descarga nada hasta que se pide", () => {
    const cargar = vi.fn(async () => "hoja");
    const b = bajoDemanda(cargar);
    expect(b.lista()).toBeNull();
    expect(cargar).not.toHaveBeenCalled();
  });

  it("varias peticiones a la vez comparten UNA descarga", async () => {
    const cargar = vi.fn(async () => "hoja");
    const b = bajoDemanda(cargar);
    const [x, y, z] = await Promise.all([b.pedir(), b.pedir(), b.pedir()]);
    expect([x, y, z]).toEqual(["hoja", "hoja", "hoja"]);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it("descargada, queda en memoria: pedirla de nuevo no toca la red", async () => {
    const cargar = vi.fn(async () => "hoja");
    const b = bajoDemanda(cargar);
    await b.pedir();
    expect(b.lista()).toBe("hoja");
    await b.pedir();
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it("un corte al abrir NO se recuerda: la siguiente vez reintenta y abre", async () => {
    let conRed = false;
    const cargar = vi.fn(async () => {
      if (!conRed) throw new Error("sin conexión");
      return "hoja";
    });
    const b = bajoDemanda(cargar);
    await expect(b.pedir()).rejects.toThrow("sin conexión");
    expect(b.lista()).toBeNull();
    conRed = true;
    await expect(b.pedir()).resolves.toBe("hoja");
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it("las que esperaban la misma descarga fallan juntas, y ninguna deja el fallo guardado", async () => {
    const cargar = vi.fn(async () => {
      throw new Error("sin conexión");
    });
    const b = bajoDemanda(cargar);
    const r = await Promise.allSettled([b.pedir(), b.pedir()]);
    expect(r.map((x) => x.status)).toEqual(["rejected", "rejected"]);
    expect(cargar).toHaveBeenCalledTimes(1);
    await expect(b.pedir()).rejects.toThrow();
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it("una pieza que vale `null` o `undefined` también cuenta como descargada", async () => {
    const cargar = vi.fn(async () => undefined);
    const b = bajoDemanda(cargar);
    await b.pedir();
    await b.pedir();
    expect(cargar).toHaveBeenCalledTimes(1);
  });
});
