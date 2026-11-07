import { describe, expect, it, vi } from "vitest";
import { EnPausaTrasFallo, unaALaVez } from "./una-a-la-vez";

// La defensa contra la avalancha del probador (2026-11-07): diez visitas a la vez son UNA lectura a la base, y una lectura que falló no se
// vuelve a pedir hasta que pase la pausa.

const reloj = () => {
  let t = 1_000_000;
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
};

describe("unaALaVez", () => {
  it("diez visitas a la vez con los mismos argumentos son una sola lectura, y todas reciben lo mismo", async () => {
    let soltar!: (v: string) => void;
    const consulta = vi.fn(() => new Promise<string>((r) => (soltar = r)));
    const leer = unaALaVez("probador", consulta, { pausaMs: 15_000 });
    const visitas = Array.from({ length: 10 }, () => leer());
    soltar("lectura");
    await expect(Promise.all(visitas)).resolves.toEqual(Array(10).fill("lectura"));
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it("argumentos distintos (otra tienda) son lecturas distintas", async () => {
    const consulta = vi.fn(async (sede: string | null) => sede ?? "todas");
    const leer = unaALaVez("probador", consulta, { pausaMs: 15_000 });
    await expect(Promise.all([leer(null), leer("trujillo")])).resolves.toEqual(["todas", "trujillo"]);
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("terminada una lectura, la siguiente vuelve a ir a la base (no guarda el valor: eso lo hace la caché de datos)", async () => {
    const consulta = vi.fn(async () => "ok");
    const leer = unaALaVez("probador", consulta, { pausaMs: 15_000 });
    await leer();
    await leer();
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("tras un fallo, durante la pausa no pide nada a la base y rechaza al instante; pasada la pausa, vuelve a intentar", async () => {
    const { ahora, avanzar } = reloj();
    const consulta = vi.fn().mockRejectedValueOnce(new Error("canceling statement due to statement timeout")).mockResolvedValue("ok");
    const leer = unaALaVez("probador", consulta, { pausaMs: 15_000, ahora });
    await expect(leer(null)).rejects.toThrow("statement timeout");
    avanzar(14_000);
    await expect(leer(null)).rejects.toBeInstanceOf(EnPausaTrasFallo);
    await expect(leer(null)).rejects.toThrow("por 1 s");
    expect(consulta).toHaveBeenCalledTimes(1);
    avanzar(1_000);
    await expect(leer(null)).resolves.toBe("ok");
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("todas las visitas que esperaban una lectura que falla reciben el mismo fallo", async () => {
    let fallar!: (e: Error) => void;
    const consulta = vi.fn(() => new Promise<string>((_, r) => (fallar = r)));
    const leer = unaALaVez("probador", consulta, { pausaMs: 15_000 });
    const visitas = [leer(), leer(), leer()].map((p) => p.catch((e: Error) => e.message));
    fallar(new Error("too many connections"));
    await expect(Promise.all(visitas)).resolves.toEqual(Array(3).fill("too many connections"));
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it("la pausa de una tienda no frena a otra", async () => {
    const consulta = vi.fn(async (sede: string) => {
      if (sede === "aqp") throw new Error("timeout");
      return sede;
    });
    const leer = unaALaVez("probador", consulta, { pausaMs: 15_000 });
    await expect(leer("aqp")).rejects.toThrow("timeout");
    await expect(leer("lim")).resolves.toBe("lim");
  });
});
