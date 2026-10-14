import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MS_TOPE_DEL_VELO } from "./login-entrada";

// `entrada-estado` vive en el navegador (mide el colibrí del login, marca <html>): aquí se le da lo mínimo de uno. Y guarda su estado en el módulo,
// así que cada prueba lo carga de nuevo.
async function cargar({ menosMovimiento = false } = {}) {
  const ave = { style: { transform: "" }, getBoundingClientRect: () => ({ left: 100, top: 70, width: 330, height: 222 }) };
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: menosMovimiento }),
    innerWidth: 1440,
    setTimeout: (f: () => void, ms: number) => globalThis.setTimeout(f, ms),
  });
  vi.stubGlobal("document", { querySelector: () => ave, documentElement: { setAttribute: () => {}, removeAttribute: () => {} } });
  vi.resetModules();
  return import("./entrada-estado");
}

/** ¿Ya se cumplió la promesa? (sin esperar a que se cumpla). */
async function cumplida(p: Promise<void>): Promise<boolean> {
  let si = false;
  void p.then(() => (si = true));
  await Promise.resolve();
  await Promise.resolve();
  return si;
}

describe("la app recién abierta espera al velo de la entrada (Felipe 2026-10-13, «se ve el inicio»)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sin una entrada en curso no hay nada que esperar: recargar o navegar dentro de la app no se retiene", async () => {
    const e = await cargar();
    expect(e.veloPendiente()).toBeNull();
  });

  it("al empezar la entrada, la app espera; cuando la capa avisa que el velo tapa, se suelta", async () => {
    const e = await cargar();
    expect(e.iniciarEntrada()).toBe(true);
    const id = e.entradaEnCurso()!.id;
    const tapa = e.veloPendiente();
    expect(tapa).not.toBeNull();
    // Es la MISMA promesa en cada lectura: React la usa para suspender y la reconoce al volver a intentar.
    expect(e.veloPendiente()).toBe(tapa);
    expect(await cumplida(tapa!)).toBe(false);
    e.marcarVeloCubierto(id + 99); // el aviso de otra entrada no cuenta
    expect(e.veloPendiente()).toBe(tapa);
    e.marcarVeloCubierto(id);
    expect(e.veloPendiente()).toBeNull();
    expect(await cumplida(tapa!)).toBe(true);
    e.marcarVeloCubierto(id); // avisar dos veces no hace nada
    expect(e.veloPendiente()).toBeNull();
  });

  it("si la entrada se deshace antes de que el velo tape, la app no se queda esperando", async () => {
    const e = await cargar();
    e.iniciarEntrada();
    const tapa = e.veloPendiente()!;
    e.terminarEntrada();
    expect(e.veloPendiente()).toBeNull();
    expect(await cumplida(tapa)).toBe(true);
  });

  it("si la capa nunca avisa (pestaña en segundo plano), se suelta sola al tope", async () => {
    const e = await cargar();
    e.iniciarEntrada();
    const tapa = e.veloPendiente()!;
    vi.advanceTimersByTime(MS_TOPE_DEL_VELO - 1);
    expect(await cumplida(tapa)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(e.veloPendiente()).toBeNull();
    expect(await cumplida(tapa)).toBe(true);
  });

  it("el tope de una entrada que ya terminó no suelta la de la siguiente", async () => {
    const e = await cargar();
    e.iniciarEntrada();
    e.terminarEntrada();
    vi.advanceTimersByTime(MS_TOPE_DEL_VELO / 2);
    e.iniciarEntrada();
    const segunda = e.veloPendiente()!;
    vi.advanceTimersByTime(MS_TOPE_DEL_VELO / 2 + 1); // vence el tope de la primera
    expect(e.veloPendiente()).toBe(segunda);
    expect(await cumplida(segunda)).toBe(false);
  });

  it("la salida y el login con menos movimiento no retienen nada", async () => {
    const e = await cargar();
    expect(e.iniciarSalida(async () => {}, { nombre: "Camila", terminal: false })).toBe(true);
    expect(e.veloPendiente()).toBeNull();

    const quieta = await cargar({ menosMovimiento: true });
    expect(quieta.iniciarEntrada()).toBe(false);
    expect(quieta.veloPendiente()).toBeNull();
  });
});
