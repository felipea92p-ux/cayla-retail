import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import type { PasoGuia } from "../guias/tipos";
import { pasoSePuedeRellenar, rellenoValido } from "./relleno";

describe("rellenoValido: solo lo que la persona escribió, tal cual", () => {
  const pregunta = "¿Cómo anulo la boleta B001-482 de la Blusa Émma?";

  it("un dato que está en la pregunta (sin tildes ni mayúsculas que importen) se escribe", () => {
    expect(rellenoValido("B001-482", pregunta)).toBe("B001-482");
    expect(rellenoValido("  blusa emma ", pregunta)).toBe("blusa emma");
  });

  it("un dato que la persona no dijo, o que la IA completó o corrigió, no", () => {
    expect(rellenoValido("B001-483", pregunta)).toBeNull();
    expect(rellenoValido("B001-482-1", pregunta)).toBeNull();
    expect(rellenoValido("Blusa Emma negra", pregunta)).toBeNull();
  });

  it("un DNI o un correo nunca se rellena: la pregunta llega con su hueco", () => {
    expect(rellenoValido("[número]", "la venta del DNI [número]")).toBeNull();
    expect(rellenoValido("del DNI [número]", "la venta del DNI [número]")).toBeNull();
    expect(rellenoValido("[correo]", "el pedido de [correo]")).toBeNull();
  });

  it("vacío, de una letra o más largo que un dato, no", () => {
    expect(rellenoValido("", pregunta)).toBeNull();
    expect(rellenoValido("B", pregunta)).toBeNull();
    const larga = "x".repeat(70);
    expect(rellenoValido(larga, larga)).toBeNull();
  });
});

describe("pasoSePuedeRellenar: solo donde la guía ya escribe un ejemplo", () => {
  const paso = (p: Partial<PasoGuia>): PasoGuia => ({ id: "p", ancla: "a", titulo: "t", texto: "x", ...p });

  it("con un «escribir» en su demostración, sí; sin él (o solo un clic), no", () => {
    expect(pasoSePuedeRellenar(paso({ demostrar: [{ tipo: "escribir", ancla: "a", texto: "Blusa" }] }))).toBe(true);
    expect(pasoSePuedeRellenar(paso({ demostrar: [{ tipo: "clic", ancla: "a" }] }))).toBe(false);
    expect(pasoSePuedeRellenar(paso({}))).toBe(false);
  });

  it("con las guías de verdad hay pasos donde se puede (si no, el relleno no serviría para nada)", () => {
    expect(GUIAS.some((g) => g.pasos.some(pasoSePuedeRellenar))).toBe(true);
  });
});
