import { describe, expect, it } from "vitest";
import { topeDelVuelo, trayectoDelVuelo, unaSolaVez, valorDeLaCuenta } from "./vuelo-reglas";

const caja = (left: number, top: number, width: number, height = width) => ({ left, top, width, height });

describe("el vuelo de la prenda a Tu compra", () => {
  it("va de centro a centro y aterriza más chica", () => {
    const t = trayectoDelVuelo(caja(100, 500, 48), caja(900, 200, 36));
    expect(t.dx).toBe(900 + 18 - (100 + 24));
    expect(t.dy).toBe(200 + 18 - (500 + 24));
    expect(t.escala).toBeCloseTo(36 / 48);
  });
  it("sube un poco más cuanto más lejos queda, con tope", () => {
    expect(trayectoDelVuelo(caja(0, 0, 48), caja(0, 100, 36)).subida).toBeCloseTo(56.9);
    expect(trayectoDelVuelo(caja(0, 0, 48), caja(0, 2000, 36)).subida).toBe(70);
  });
  it("dura entre 520 y 680 ms: un vuelo corto no es un parpadeo ni uno largo se hace eterno", () => {
    expect(trayectoDelVuelo(caja(0, 0, 48), caja(1, 1, 36)).ms).toBe(520);
    expect(trayectoDelVuelo(caja(0, 0, 48), caja(900, 400, 36)).ms).toBeGreaterThan(520);
    expect(trayectoDelVuelo(caja(0, 0, 48), caja(9000, 9000, 36)).ms).toBe(680);
  });
  it("nunca crece ni se hace diminuta, y una miniatura sin ancho no rompe la cuenta", () => {
    expect(trayectoDelVuelo(caja(0, 0, 20), caja(50, 50, 80)).escala).toBe(1);
    expect(trayectoDelVuelo(caja(0, 0, 200), caja(50, 50, 10)).escala).toBe(0.34);
    expect(trayectoDelVuelo(caja(0, 0, 0), caja(50, 50, 10)).escala).toBe(1);
  });
  it("el total cuenta de la cifra de antes a la nueva, y se queda en la nueva", () => {
    expect(valorDeLaCuenta(636, 1036, 0)).toBe(636);
    expect(valorDeLaCuenta(636, 1036, 1)).toBe(1036);
    expect(valorDeLaCuenta(636, 1036, 0.5)).toBeGreaterThan(836); // arranca rápido
    expect(valorDeLaCuenta(636, 1036, 2)).toBe(1036);
    expect(valorDeLaCuenta(1036, 636, 0.5)).toBeLessThan(836); // y también hacia abajo
  });
  // /chaos 2026-10-28, hallazgo 2: si el navegador cancelaba la animación, el vuelo nunca «aterrizaba» (solo se esperaba su final normal):
  // la miniatura quedaba en el aire, la línea oculta y Tu compra decía menos de lo que llevaba.
  it("aterriza una sola vez, llegue por el final, por la cancelación o por el tope de tiempo", () => {
    let llegadas = 0;
    const aterrizar = unaSolaVez(() => llegadas++);
    aterrizar(); // final normal
    aterrizar(); // cancelación
    aterrizar(); // tope de tiempo
    expect(llegadas).toBe(1);
  });
  it("el tope le da al vuelo un margen y nunca menos que su duración", () => {
    expect(topeDelVuelo(620)).toBeGreaterThan(620);
    expect(topeDelVuelo(520)).toBeLessThan(2000);
  });
});
