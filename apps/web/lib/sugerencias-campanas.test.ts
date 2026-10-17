import { describe, expect, it } from "vitest";
import { FECHAS_COMERCIALES, sugerirNombreCampana } from "./sugerencias-campanas";

// Las campañas de producción del 2026-10-17.
const EXISTENTES = [
  "San Valentín", "Galentine's Day", "Día de la Mujer", "Día de la Tierra", "Día de la Madre", "Fiestas Patrias",
  "Día Internacional del Perro", "Halloween", "Aniversario CAYLA", "Día Internacional del Gato", "Black Friday", "Navidad", "CyberWow",
];

describe("el ejemplo del nombre de una campaña nueva", () => {
  it("la próxima fecha que todavía no es campaña (después de Halloween y Black Friday, que ya existen)", () => {
    expect(sugerirNombreCampana(EXISTENTES, "2026-10-17")).toBe("Ej. Cyber Days");
  });
  it("nunca propone una que ya existe, sin importar tildes ni mayúsculas", () => {
    for (const f of FECHAS_COMERCIALES) {
      const sugerido = sugerirNombreCampana([...EXISTENTES, f.nombre.toUpperCase().replace("í", "i")], "2026-01-01");
      expect(sugerido).not.toBe(`Ej. ${f.nombre}`);
    }
  });
  it("da la vuelta al año: en diciembre, sin Navidad ni Fin de año libres, propone la primera del año que viene", () => {
    expect(sugerirNombreCampana(["Navidad", "Fin de año"], "2026-12-20")).toBe("Ej. San Valentín");
  });
  it("con todas las fechas tomadas, un texto que no promete ninguna", () => {
    expect(sugerirNombreCampana(FECHAS_COMERCIALES.map((f) => f.nombre), "2026-10-17")).toBe("El nombre que verá el cliente");
  });
  it("es estable: el mismo día y las mismas campañas dan el mismo ejemplo", () => {
    expect(sugerirNombreCampana(EXISTENTES, "2026-10-17")).toBe(sugerirNombreCampana([...EXISTENTES].reverse(), "2026-10-17"));
  });
  it("cabe a 375 px (lo que el campo muestra sin cortarse)", () => {
    for (const f of FECHAS_COMERCIALES) expect(`Ej. ${f.nombre}`.length).toBeLessThanOrEqual(28);
  });
});
