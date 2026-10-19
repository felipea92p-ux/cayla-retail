import { describe, expect, it } from "vitest";
import { FECHAS_COMERCIALES, MAX_FRASE_EJEMPLO, sugerirFrase, sugerirNombreCampana } from "./sugerencias-campanas";

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

describe("el ejemplo de la frase propia de la portada", () => {
  // Todos los valores que cambian el ejemplo: con o sin descuento, con o sin fecha de fin (cada mes, y los días de dos cifras).
  const casos = [null, 15, 12.5].flatMap((pct) =>
    [null, ...Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-${i % 2 ? "30" : "1"}`)].map((hasta) => ({ pct, hasta })),
  );

  it("siempre hay uno, empieza con «Ej.» y cabe a 375 px", () => {
    for (const c of casos) {
      const t = sugerirFrase(c);
      expect(t.startsWith("Ej. "), JSON.stringify(c)).toBe(true);
      expect(t.length, t).toBeLessThanOrEqual(MAX_FRASE_EJEMPLO);
    }
  });

  it("sigue lo que la campaña tiene: la urgencia con descuento y fin, el descuento sin fin, las prendas sin descuento", () => {
    expect(sugerirFrase({ pct: 15, hasta: "2026-10-30" })).toBe("Ej. Solo por unos días, no te lo pierdas");
    expect(sugerirFrase({ pct: 15, hasta: null })).toBe("Ej. Un descuento para estrenar algo");
    // Sin descuento, nunca habla de un descuento ni de un plazo, aunque tenga fecha de fin; sin fin, nunca de unos días.
    for (const hasta of [null, "2026-12-31"]) expect(sugerirFrase({ pct: null, hasta })).not.toMatch(/descuento|días|hasta/i);
    expect(sugerirFrase({ pct: 15, hasta: null })).not.toMatch(/días/);
  });

  it("no repite lo que la web ya pone en el héroe: ni el porcentaje ni la fecha", () => {
    for (const c of casos) expect(sugerirFrase(c)).not.toMatch(/%|\d/);
  });

  it("sigue al cambio: con descuento, sin él y otra vez con él, vuelve al mismo", () => {
    const a = sugerirFrase({ pct: 20, hasta: "2026-11-27" });
    expect(sugerirFrase({ pct: null, hasta: "2026-11-27" })).not.toBe(a);
    expect(sugerirFrase({ pct: 20, hasta: "2026-11-27" })).toBe(a);
  });

  it("no pasa de lo que la frase admite (60 letras)", () => {
    for (const c of casos) expect(sugerirFrase(c).replace(/^Ej\. /, "").length).toBeLessThanOrEqual(60);
  });
});
