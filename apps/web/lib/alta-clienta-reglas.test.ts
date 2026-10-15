import { describe, expect, it } from "vitest";
import { avisoDelAlta, resultadoDelAlta } from "./alta-clienta-reglas";

// Qué pasó al registrar (Felipe 2026-10-15): `registrar_clienta` no crea una ficha repetida, completa o reactiva la que tenía ese
// documento. «+ Nuevo cliente» (/clientas) y «Registrar cliente» (el ticket de Vender) lo dicen igual, con esta regla.

describe("qué hizo la base con el documento", () => {
  it("sin ficha antes, o con otra ficha (no la que volvió): nueva", () => {
    expect(resultadoDelAlta(null, "f1")).toBe("nueva");
    expect(resultadoDelAlta({ id: "f0", archivadaEn: null }, "f1")).toBe("nueva");
  });

  it("la que volvió es la que ya tenía ese documento: activa, «ya tenía»; archivada, «reactivada»", () => {
    expect(resultadoDelAlta({ id: "f1", archivadaEn: null }, "f1")).toBe("ya_tenia");
    expect(resultadoDelAlta({ id: "f1", archivadaEn: "2026-09-01T10:00:00Z" }, "f1")).toBe("reactivada");
  });
});

describe("lo que dice el aviso", () => {
  it("en Clientes: registrado, ya tenía (se abre la suya) o reactivada (vuelve con su historial)", () => {
    expect(avisoDelAlta("nueva", "Ana Pérez", "clientes")).toEqual({ titulo: "Cliente registrado", detalle: "Ana Pérez. Para ser del club, que escanee el cartel." });
    expect(avisoDelAlta("ya_tenia", "Ana Pérez", "clientes")).toEqual({ titulo: "Ya tenía ficha", detalle: "Ana Pérez: se abrió la suya, no se creó otra." });
    expect(avisoDelAlta("reactivada", "Ana Pérez", "clientes")).toEqual({ titulo: "Ficha reactivada", detalle: "Ana Pérez vuelve con su historial." });
  });

  it("en el ticket: lo mismo, y que esta venta queda en su ficha al cobrar", () => {
    expect(avisoDelAlta("nueva", "Ana Pérez", "ticket")).toEqual({
      titulo: "Cliente registrado",
      detalle: "Ana Pérez. Al cobrar, esta venta queda en su ficha. Para ser del club, que escanee el cartel.",
    });
    expect(avisoDelAlta("ya_tenia", "Ana Pérez", "ticket")).toEqual({
      titulo: "Ya tenía ficha",
      detalle: "Ana Pérez: se usa la suya, no se creó otra. Al cobrar, esta venta queda en su ficha.",
    });
    expect(avisoDelAlta("reactivada", "DNI 71•••482", "ticket")).toEqual({
      titulo: "Ficha reactivada",
      detalle: "DNI 71•••482 vuelve con su historial. Al cobrar, esta venta queda en su ficha.",
    });
  });

  it("nunca dice «Cliente registrado» cuando la ficha ya existía", () => {
    for (const donde of ["clientes", "ticket"] as const) {
      expect(avisoDelAlta("ya_tenia", "X", donde).titulo).not.toBe("Cliente registrado");
      expect(avisoDelAlta("reactivada", "X", donde).titulo).not.toBe("Cliente registrado");
    }
  });
});
