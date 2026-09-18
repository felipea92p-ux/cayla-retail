import { describe, it, expect } from "vitest";
import { iconoDeEtiqueta } from "./etiqueta-visual";

// Las 21 etiquetas reales sembradas en 20260917100200, 20260917230100 y
// 20260918030000/060000. Si una cae en `null` pierde su dibujo propio y se
// ve con el ícono genérico — no es un error, pero es justo lo que esta
// pantalla quería evitar para el vocabulario que ya existe.
describe("iconoDeEtiqueta — el vocabulario real", () => {
  it.each([
    ["Nuevo", "nuevo"],
    ["Últimas unidades", "ultimas"],
    ["Top ventas", "top"],
    ["Para liquidar", "liquidar"],
    ["Para liquidar — Taller", "liquidar"],
    ["Para liquidar — Tienda AQP", "liquidar"],
    ["Para liquidar — Tienda LIM", "liquidar"],
    ["Hecho a mano", "manual"],
    ["Pieza única", "unica"],
    ["Reedición", "reedicion"],
    ["San Valentín", "valentin"],
    ["Galentine's Day", "galentine"],
    ["Día de la Madre", "madre"],
    ["Día de la Mujer", "mujer"],
    ["Halloween", "halloween"],
    ["Navidad", "navidad"],
    ["Fiestas Patrias", "patrias"],
    ["Black Friday", "blackfriday"],
    ["CyberWow", "cyberwow"],
    ["Aniversario CAYLA", "aniversario"],
    ["Día Internacional del Gato", "gato"],
    ["Día Internacional del Perro", "perro"],
    ["Día de la Tierra", "tierra"],
  ] as const)("%s → %s", (nombre, icono) => {
    expect(iconoDeEtiqueta(nombre)).toBe(icono);
  });
});

describe("iconoDeEtiqueta — casos límite", () => {
  it("Galentine's Day no se confunde con San Valentín", () => {
    expect(iconoDeEtiqueta("Galentine's Day")).toBe("galentine");
    expect(iconoDeEtiqueta("San Valentín")).toBe("valentin");
  });

  it("ignora mayúsculas y tildes", () => {
    expect(iconoDeEtiqueta("DÍA DE LA MADRE")).toBe("madre");
    expect(iconoDeEtiqueta("ultimas UNIDADES")).toBe("ultimas");
  });

  it("un nombre desconocido devuelve null (la pantalla usa el ícono genérico)", () => {
    expect(iconoDeEtiqueta("Cyber lunes de otoño")).toBe("cyberwow");
    expect(iconoDeEtiqueta("Vitrina principal")).toBeNull();
    expect(iconoDeEtiqueta("")).toBeNull();
  });
});
