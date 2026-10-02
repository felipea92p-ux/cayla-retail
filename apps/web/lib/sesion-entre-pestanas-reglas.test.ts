import { describe, expect, it } from "vitest";
import { decidirAccionDeSesion, DESTINO_DE_ACCION } from "./sesion-entre-pestanas-reglas";

describe("decidirAccionDeSesion", () => {
  it("no hace nada si la pestaña no tenía cuenta (login, páginas públicas)", () => {
    expect(decidirAccionDeSesion(null, null)).toBe("nada");
    expect(decidirAccionDeSesion(null, "ana")).toBe("nada");
  });
  it("no hace nada si la cuenta es la misma", () => {
    expect(decidirAccionDeSesion("ana", "ana")).toBe("nada");
  });
  it("va a /login si la cuenta se cerró", () => {
    expect(decidirAccionDeSesion("ana", null)).toBe("login");
    expect(DESTINO_DE_ACCION.login).toBe("/login");
  });
  it("va al inicio si entró otra cuenta", () => {
    expect(decidirAccionDeSesion("ana", "luis")).toBe("inicio");
    expect(DESTINO_DE_ACCION.inicio).toBe("/");
  });
});
