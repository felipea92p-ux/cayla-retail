import { describe, expect, it } from "vitest";
import { esRafaga, LECTOR_VACIO, lecturaSinEnter, MS_ENTRE_TECLAS, teclaDePistola, type LectorPistola } from "./existencias-pistola";

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
  it("sabe si una tecla viene en ráfaga (la regla con la que el panel de la talla ignora los dígitos de un código)", () => {
    expect(esRafaga("7", 100, 120)).toBe(true);
    expect(esRafaga("7", 100, 100 + MS_ENTRE_TECLAS)).toBe(false);
    expect(esRafaga("7", 100, 400)).toBe(false);
    // Una flecha o un Enter no son caracteres: nunca se ignoran, aunque lleguen seguidos.
    expect(esRafaga("ArrowRight", 100, 120)).toBe(false);
    expect(esRafaga("Enter", 100, 120)).toBe(false);
    // La primera tecla de la página (antes = 0) llega sola.
    expect(esRafaga("7", 0, 10_000)).toBe(false);
  });
});

describe("la pistola que no manda Enter", () => {
  it("una ráfaga larga que se calla es un código", () => {
    let l: LectorPistola = LECTOR_VACIO;
    let t = 1000;
    for (const k of "CMS-0011-ROS-STD") l = teclaDePistola(l, k, (t += 8)).lector;
    expect(lecturaSinEnter(l, 8)).toBe("CMS-0011-ROS-STD");
  });
  it("una ráfaga corta no es una lectura", () => {
    let l: LectorPistola = LECTOR_VACIO;
    for (const [i, k] of [..."abc"].entries()) l = teclaDePistola(l, k, 1000 + i * 8).lector;
    expect(lecturaSinEnter(l, 8)).toBeNull();
  });
  it("lo tecleado a mano nunca junta una ráfaga", () => {
    let l: LectorPistola = LECTOR_VACIO;
    for (const [i, k] of [..."blusaroja"].entries()) l = teclaDePistola(l, k, 1000 + i * 180).lector;
    expect(lecturaSinEnter(l, 8)).toBeNull();
  });
});
