import { describe, expect, it } from "vitest";
import { avisoGuardado, decidirAccionDeSesion, DESTINO_DE_ACCION, esSalidaPropia, MS_SALIDA_PROPIA } from "./sesion-entre-pestanas-reglas";

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
  it("si la cuenta se cerró porque ESTA pestaña apretó «Salir», no avisa de «otra pestaña»", () => {
    expect(decidirAccionDeSesion("ana", null, true)).toBe("nada");
    expect(decidirAccionDeSesion("ana", null, false)).toBe("login"); // un cierre hecho en otra pestaña sigue avisando
  });
  it("la marca de «yo salí» no esconde un cambio de cuenta: eso sigue yendo al inicio", () => {
    expect(decidirAccionDeSesion("ana", "luis", true)).toBe("inicio");
  });
  it("va al inicio si entró otra cuenta", () => {
    expect(decidirAccionDeSesion("ana", "luis")).toBe("inicio");
    expect(DESTINO_DE_ACCION.inicio).toBe("/");
  });
});

describe("esSalidaPropia", () => {
  it("vale un rato desde que se apretó «Salir» y después caduca (un cierre ajeno vuelve a avisar)", () => {
    expect(esSalidaPropia(null, 5000)).toBe(false);
    expect(esSalidaPropia(1000, 1000)).toBe(true);
    expect(esSalidaPropia(1000, 1000 + MS_SALIDA_PROPIA)).toBe(true);
    expect(esSalidaPropia(1000, 1000 + MS_SALIDA_PROPIA + 1)).toBe(false);
  });
  it("un reloj que va hacia atrás no la da por buena", () => {
    expect(esSalidaPropia(5000, 4000)).toBe(false);
  });
});

describe("avisoGuardado", () => {
  it("dice qué pasó según la acción guardada", () => {
    expect(avisoGuardado("inicio")?.texto).toBe("La cuenta cambió");
    expect(avisoGuardado("login")?.texto).toContain("sesión");
  });
  it("ignora lo que no es una acción conocida", () => {
    expect(avisoGuardado(null)).toBeNull();
    expect(avisoGuardado("nada")).toBeNull();
    expect(avisoGuardado("<script>")).toBeNull();
  });
});
