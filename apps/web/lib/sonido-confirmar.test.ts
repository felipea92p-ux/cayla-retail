import { describe, expect, it } from "vitest";
import { PATRON_CONFIRMADO, sonidoConfirmarActivo } from "./sonido-confirmar";
import { PATRON_SONIDO } from "./conteo-conectado";

describe("sonido de «confirmado»", () => {
  it("la primera vez suena: sin nada guardado está encendido", () => {
    expect(sonidoConfirmarActivo(null)).toBe(true);
    expect(sonidoConfirmarActivo(undefined)).toBe(true);
    expect(sonidoConfirmarActivo("1")).toBe(true);
  });

  it("solo «0» lo apaga: un valor raro no deja a la persona sin el aviso", () => {
    expect(sonidoConfirmarActivo("0")).toBe(false);
    expect(sonidoConfirmarActivo("")).toBe(true);
    expect(sonidoConfirmarActivo("no")).toBe(true);
  });

  it("sube (el segundo tono es más agudo) y no se parece a ningún bip de la pistola", () => {
    const [a, b] = PATRON_CONFIRMADO.tonos;
    expect(b[0]).toBeGreaterThan(a[0]);
    const firma = (t: readonly (readonly [number, number])[]) => JSON.stringify(t);
    for (const bip of Object.values(PATRON_SONIDO)) expect(firma(bip.tonos)).not.toBe(firma(PATRON_CONFIRMADO.tonos));
  });
});
