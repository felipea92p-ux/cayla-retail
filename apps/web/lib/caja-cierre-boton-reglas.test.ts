import { describe, expect, it } from "vitest";
import { estadoBotonCierre } from "./caja-cierre-boton-reglas";

// Lima = UTC−5. La caja abrió a las 9:02 a. m. de Lima del 2 de octubre.
const ABRIO = "2026-10-02T14:02:00Z";
const lima = (hhmm: string) => new Date(`2026-10-02T${hhmm}:00-05:00`);
const base = { abiertaEn: ABRIO, horaCierre: "19:45", puedeCerrar: true };

describe("estadoBotonCierre", () => {
  it("antes de la hora: nivel 0, dice cuánto lleva abierta y a qué hora se cierra", () => {
    const e = estadoBotonCierre({ ...base, ahora: lima("15:40") });
    expect(e.nivel).toBe(0);
    expect(e.titulo).toBe("Cuando termines tu turno, cierra la caja");
    expect(e.bajada).toBe("Tu caja lleva 6 h 38 min abierta. Cierra a las 7:45 p. m.");
    expect(e.abiertaHace).toBe("Abierta hace 6 h 38 min");
  });

  it("justo a la hora de cierre: nivel 1", () => {
    expect(estadoBotonCierre({ ...base, ahora: lima("19:44") }).nivel).toBe(0);
    const e = estadoBotonCierre({ ...base, ahora: lima("19:45") });
    expect(e.nivel).toBe(1);
    expect(e.titulo).toBe("Es hora de cerrar la caja");
  });

  it("a los 30 min sube a nivel 2 y dice la consecuencia real, sin cifras inventadas", () => {
    expect(estadoBotonCierre({ ...base, ahora: lima("20:14") }).nivel).toBe(1);
    const e = estadoBotonCierre({ ...base, ahora: lima("20:16") });
    expect(e.nivel).toBe(2);
    expect(e.titulo).toBe("La caja sigue abierta · pasó la hora de cierre hace 31 min");
    expect(e.bajada).toContain("las ventas de hoy y de mañana se mezclan");
  });

  it("pasada una hora sigue en nivel 2 (el rojo no escala más)", () => {
    expect(estadoBotonCierre({ ...base, ahora: lima("21:30") }).nivel).toBe(2);
  });

  it("sin hora de cierre en la tienda el botón no sube de nivel, pero sigue diciendo cuánto lleva abierta", () => {
    const e = estadoBotonCierre({ ...base, horaCierre: null, ahora: lima("23:00") });
    expect(e.nivel).toBe(0);
    expect(e.bajada).toBe("Tu caja lleva 13 h 58 min abierta.");
  });

  it("a quien no puede cerrar le dice a quién avisar, no le ofrece nada que la base rechace", () => {
    const e = estadoBotonCierre({ ...base, puedeCerrar: false, ahora: lima("20:20") });
    expect(e.bajada).toBe("La caja la cierra un líder de equipo.");
    expect(e.titulo).toContain("avisa a un líder");
    expect(e.nivel).toBe(2);
  });

  it("un reloj atrasado respecto a la apertura no da un negativo", () => {
    const e = estadoBotonCierre({ ...base, ahora: lima("08:00") });
    expect(e.abiertaHace).toBe("Abierta hace 0 min");
  });
});
