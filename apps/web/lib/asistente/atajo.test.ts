import { describe, expect, it } from "vitest";
import { esAtajoDelAsistente } from "./atajo";

const tecla = (t: Partial<Parameters<typeof esAtajoDelAsistente>[0]>) =>
  esAtajoDelAsistente({ tecla: "?", meta: false, ctrl: false, alt: false, enCampo: false, hayHoja: false, usada: false, ...t });

describe("el atajo del asistente", () => {
  it("«?» lo abre fuera de un campo, y dentro de un campo se escribe", () => {
    expect(tecla({})).toBe(true);
    expect(tecla({ enCampo: true })).toBe(false);
  });

  it("⌘/ y Ctrl+/ lo abren desde cualquier lado, también escribiendo", () => {
    expect(tecla({ tecla: "/", meta: true, enCampo: true })).toBe(true);
    expect(tecla({ tecla: "/", ctrl: true })).toBe(true);
  });

  it("«/» solo es del buscador de la pantalla, y ⌘K del buscador de la cabecera", () => {
    expect(tecla({ tecla: "/" })).toBe(false);
    expect(tecla({ tecla: "k", meta: true })).toBe(false);
  });

  it("no se abre sobre otra hoja, con Alt, ni si otro control ya usó la tecla", () => {
    expect(tecla({ hayHoja: true })).toBe(false);
    expect(tecla({ tecla: "/", meta: true, hayHoja: true })).toBe(false);
    expect(tecla({ alt: true })).toBe(false);
    expect(tecla({ usada: true })).toBe(false);
  });
});
