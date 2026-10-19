import { describe, expect, it } from "vitest";
import { unaSolaPasada } from "./una-sola-pasada";

describe("una sola pasada (/chaos DC-02: diez clics en el mismo instante son una llamada)", () => {
  it("de diez llamadas seguidas, solo la primera corre", async () => {
    const pasada = unaSolaPasada();
    let corridas = 0;
    const trabajo = async () => {
      corridas++;
      await Promise.resolve();
    };
    await Promise.all(Array.from({ length: 10 }, () => pasada(trabajo)));
    expect(corridas).toBe(1);
  });

  it("al terminar, deja volver a intentar (también si falló)", async () => {
    const pasada = unaSolaPasada();
    let corridas = 0;
    await pasada(async () => void corridas++);
    await pasada(async () => {
      corridas++;
      throw new Error("sin red");
    }).catch(() => {});
    await pasada(async () => void corridas++);
    expect(corridas).toBe(3);
  });

  it("dos candados distintos no se estorban", async () => {
    const a = unaSolaPasada();
    const b = unaSolaPasada();
    let corridas = 0;
    await Promise.all([a(async () => void corridas++), b(async () => void corridas++)]);
    expect(corridas).toBe(2);
  });
});
