import { describe, expect, it } from "vitest";
import { esRafaga, LECTOR_VACIO, teclaDePistola, type LectorPistola } from "./existencias-pistola";

/** Escribe `texto` con `ms` entre teclas y termina con Enter; devuelve el código leído. */
function escribir(texto: string, ms: number): string | null {
  let l: LectorPistola = LECTOR_VACIO;
  let t = 1000;
  for (const k of texto) {
    l = teclaDePistola(l, k, t).lector;
    t += ms;
  }
  return teclaDePistola(l, "Enter", t - ms + Math.min(ms, 10)).codigo;
}

describe("la pistola de códigos", () => {
  it("una ráfaga rápida terminada en Enter es un código", () => {
    expect(escribir("7750014226", 8)).toBe("7750014226");
  });
  it("una persona que escribe despacio no es la pistola", () => {
    expect(escribir("7750014226", 180)).toBeNull();
  });
  it("con menos de 6 caracteres un Enter no es una lectura", () => {
    expect(escribir("12345", 8)).toBeNull();
  });
  it("una pausa en medio empieza de nuevo: solo cuenta lo último seguido", () => {
    let l = teclaDePistola(LECTOR_VACIO, "a", 0).lector;
    l = teclaDePistola(l, "b", 500).lector;
    expect(l.texto).toBe("b");
  });
  it("una tecla que no escribe (flechas, Shift) vacía el lector", () => {
    const l = teclaDePistola({ texto: "abc", ultimo: 0 }, "ArrowRight", 10).lector;
    expect(l).toEqual(LECTOR_VACIO);
  });
  it("sabe si una tecla viene en ráfaga", () => {
    expect(esRafaga({ texto: "7", ultimo: 100 }, 120)).toBe(true);
    expect(esRafaga({ texto: "7", ultimo: 100 }, 400)).toBe(false);
    expect(esRafaga(LECTOR_VACIO, 10)).toBe(false);
  });
});
