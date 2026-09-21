import { afterEach, describe, expect, it, vi } from "vitest";
import { esperaOcupada, marcarFichas, marcarLoaderALaVista, suscribirEspera } from "./espera-estado";

afterEach(() => {
  marcarFichas(0);
  marcarLoaderALaVista(false);
});

describe("esperaOcupada", () => {
  it("empieza libre", () => {
    expect(esperaOcupada()).toBe(false);
  });

  it("una petición en curso ocupa la pantalla aunque el loader aún no se vea (sus 200 ms de cortesía)", () => {
    marcarFichas(1);
    expect(esperaOcupada()).toBe(true);
  });

  it("sin peticiones pero con el loader a la vista (mínimo, gracia y salida) sigue ocupada", () => {
    marcarFichas(1);
    marcarLoaderALaVista(true);
    marcarFichas(0);
    expect(esperaOcupada()).toBe(true);
  });

  it("queda libre solo cuando no hay peticiones Y el loader ya se fue", () => {
    marcarFichas(2);
    marcarLoaderALaVista(true);
    marcarFichas(1);
    expect(esperaOcupada()).toBe(true);
    marcarFichas(0);
    expect(esperaOcupada()).toBe(true);
    marcarLoaderALaVista(false);
    expect(esperaOcupada()).toBe(false);
  });
});

describe("suscribirEspera", () => {
  it("avisa al pasar de libre a ocupada y de ocupada a libre", () => {
    const oyente = vi.fn();
    const baja = suscribirEspera(oyente);
    marcarFichas(1);
    expect(oyente).toHaveBeenCalledTimes(1);
    marcarFichas(0);
    expect(oyente).toHaveBeenCalledTimes(2);
    baja();
  });

  it("no avisa cuando cambia el detalle pero la respuesta es la misma", () => {
    marcarFichas(1);
    const oyente = vi.fn();
    const baja = suscribirEspera(oyente);
    marcarFichas(3); // entran más peticiones: sigue ocupada
    marcarLoaderALaVista(true); // el loader aparece: sigue ocupada
    marcarFichas(0); // ya no hay peticiones, pero el loader sigue
    expect(oyente).not.toHaveBeenCalled();
    marcarLoaderALaVista(false); // ahora sí: libre
    expect(oyente).toHaveBeenCalledTimes(1);
    baja();
  });

  it("quien se da de baja deja de enterarse", () => {
    const oyente = vi.fn();
    suscribirEspera(oyente)();
    marcarFichas(1);
    expect(oyente).not.toHaveBeenCalled();
  });
});
