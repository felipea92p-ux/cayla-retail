import { describe, expect, it } from "vitest";
import { etapaDelEnvio } from "./trayecto-envio-reglas";

describe("etapaDelEnvio", () => {
  it("en camino es la segunda parada, en pizarra", () => {
    expect(etapaDelEnvio("en_camino")).toEqual({ indice: 1, nombre: "En camino", detalle: null, tono: "viaja", avance: 100 });
  });

  it("abierto se está contando: dice cuánto va y llena su anillo", () => {
    expect(etapaDelEnvio("abierto", { contadas: 1, dijeron: 2 })).toMatchObject({ indice: 2, nombre: "Contando", detalle: "1 de 2", tono: "trabaja", avance: 50 });
    expect(etapaDelEnvio("abierto", { contadas: 5, dijeron: 2 })?.avance).toBe(100);
  });

  it("abierto sin lo que dijeron (sin aviso) o sin cifras no inventa un avance", () => {
    expect(etapaDelEnvio("abierto", { contadas: 3, dijeron: null })).toMatchObject({ detalle: "3 contadas", avance: 100 });
    expect(etapaDelEnvio("abierto")).toMatchObject({ indice: 2, detalle: null });
  });

  it("cerrado con pendientes queda por terminar; sin ellos, recibido en verde", () => {
    expect(etapaDelEnvio("cerrado", { pendientes: 1 })).toMatchObject({ indice: 3, nombre: "Por terminar", detalle: "1 pendiente", tono: "trabaja" });
    expect(etapaDelEnvio("cerrado", { pendientes: 3 })?.detalle).toBe("3 pendientes");
    expect(etapaDelEnvio("cerrado")).toMatchObject({ indice: 4, nombre: "Recibido", detalle: null, tono: "listo" });
  });

  it("un envío anulado no tiene camino", () => {
    expect(etapaDelEnvio("anulado")).toBeNull();
  });
});
