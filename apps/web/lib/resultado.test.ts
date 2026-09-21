import { afterEach, describe, expect, it, vi } from "vitest";
import { opcional } from "./resultado";

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
