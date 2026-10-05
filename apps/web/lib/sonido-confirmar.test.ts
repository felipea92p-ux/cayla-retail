import { describe, expect, it } from "vitest";
import { PATRON_CONFIRMADO, sonidoConfirmar } from "./sonido-confirmar";
import { PATRON_SONIDO } from "./conteo-conectado";

describe("sonido de «confirmado»", () => {
  it("la primera vez suena: el valor de fábrica es «si»", () => {
    expect(sonidoConfirmar.leerEnServidor()).toBe("si");
  });

  it("sube (el segundo tono es más agudo) y no se parece a ningún bip de la pistola", () => {
    const [a, b] = PATRON_CONFIRMADO.tonos;
    expect(b[0]).toBeGreaterThan(a[0]);
    const firma = (t: readonly (readonly [number, number])[]) => JSON.stringify(t);
    for (const bip of Object.values(PATRON_SONIDO)) expect(firma(bip.tonos)).not.toBe(firma(PATRON_CONFIRMADO.tonos));
  });
});
