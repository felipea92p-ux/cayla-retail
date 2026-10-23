import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VENTANA_REPETIDA_MS, crearArranqueDemo } from "./arranque-demo";

// El arranque de `?demo=1` sin React: cada `pedir` es una pasada del efecto de `MotorGuias` y cada `desmontar`, su limpieza.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("arranque de la demo pedida con ?demo=1", () => {
  it("StrictMode (montar, desmontar, volver a montar) arranca la guía una vez", () => {
    const arranque = crearArranqueDemo();
    const arrancar = vi.fn();
    expect(arranque.pedir("clientas", null, arrancar)).toBe(true);
    arranque.desmontar();
    expect(arranque.pedir("clientas", null, arrancar)).toBe(true);
    vi.runAllTimers();
    expect(arrancar).toHaveBeenCalledTimes(1);
  });

  it("dos pedidos antes de arrancar dejan un solo arranque", () => {
    const arranque = crearArranqueDemo();
    const arrancar = vi.fn();
    arranque.pedir("vender", null, arrancar);
    arranque.pedir("vender", null, arrancar);
    vi.runAllTimers();
    expect(arrancar).toHaveBeenCalledTimes(1);
  });

  it("desmontarse de verdad cancela lo programado", () => {
    const arranque = crearArranqueDemo();
    const arrancar = vi.fn();
    arranque.pedir("vender", null, arrancar);
    arranque.desmontar();
    vi.runAllTimers();
    expect(arrancar).not.toHaveBeenCalled();
  });

  it("un ?demo=1 que vuelve por un enlace mientras la guía corre no la reinicia", () => {
    const arranque = crearArranqueDemo();
    const arrancar = vi.fn();
    arranque.pedir("finanzas.facturas", null, arrancar);
    vi.runAllTimers();
    expect(arranque.pedir("finanzas.facturas", "finanzas.facturas", arrancar)).toBe(false);
    vi.runAllTimers();
    expect(arrancar).toHaveBeenCalledTimes(1);
  });

  it("si arrancó hace menos de un minuto no se reinicia; pasado el minuto, sí", () => {
    const arranque = crearArranqueDemo();
    const arrancar = vi.fn();
    arranque.pedir("finanzas.facturas", null, arrancar);
    vi.runAllTimers();
    vi.advanceTimersByTime(VENTANA_REPETIDA_MS - 1_000);
    expect(arranque.pedir("finanzas.facturas", null, arrancar)).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(arranque.pedir("finanzas.facturas", null, arrancar)).toBe(true);
    vi.runAllTimers();
    expect(arrancar).toHaveBeenCalledTimes(2);
  });

  it("la demo de otra pantalla arranca aunque la anterior sea reciente", () => {
    const arranque = crearArranqueDemo();
    const arrancar = vi.fn();
    arranque.pedir("clientas", null, arrancar);
    vi.runAllTimers();
    expect(arranque.pedir("vender", null, arrancar)).toBe(true);
    vi.runAllTimers();
    expect(arrancar).toHaveBeenCalledTimes(2);
  });
});
