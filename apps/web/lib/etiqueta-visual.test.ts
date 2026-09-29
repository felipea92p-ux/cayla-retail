import { describe, it, expect } from "vitest";
import { iconoDeEtiqueta, rotuloDeEtiqueta } from "./etiqueta-visual";

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

describe("rotuloDeEtiqueta — la palabra del papel", () => {
  it.each([
    ["Nuevo", "Nuevo"],
    ["Últimas unidades", "Últimas"],
    ["Top ventas", "Top ventas"],
    ["Para liquidar", "Liquidar"],
    ["Para liquidar — Tienda AQP", "Liquidar"],
    ["Hecho a mano", "A mano"],
    ["Pieza única", "Pieza única"],
    ["Reedición", "Reedición"],
    ["Aniversario CAYLA", "Aniversario"],
    ["Black Friday", "Black Friday"],
    ["CyberWow", "CyberWow"],
    ["Día Internacional del Gato", "Día gato"],
    ["Día de la Madre", "Día madre"],
  ])("%s → %s", (nombre, rotulo) => {
    expect(rotuloDeEtiqueta(nombre)).toBe(rotulo);
  });
  it("un nombre que no se reconoce se queda con el suyo, sin espacios de más", () => {
    expect(rotuloDeEtiqueta("  Vitrina principal ")).toBe("Vitrina principal");
  });
  it("ninguna palabra pasa de 12 letras: con más, dos etiquetas no caben en 34 mm", () => {
    for (const n of ["Nuevo", "Últimas unidades", "Top ventas", "Para liquidar", "Hecho a mano", "Pieza única", "Reedición", "San Valentín", "Galentine's Day", "Día de la Madre", "Día de la Mujer", "Halloween", "Navidad", "Fiestas Patrias", "Black Friday", "CyberWow", "Aniversario CAYLA", "Día Internacional del Gato", "Día Internacional del Perro", "Día de la Tierra"]) {
      expect(rotuloDeEtiqueta(n).length).toBeLessThanOrEqual(12);
    }
  });
});
