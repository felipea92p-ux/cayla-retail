import { describe, expect, it } from "vitest";
import { normalizarCodigo, sugerirCodigoColor } from "./color-codigo";

// Los 35 códigos reales de producción al 2026-09-18: la sugerencia tiene que
// reproducir la regla con la que ya se armaron, no inventar otra. Los 32 del
// 2026-09-25 tienen su propia prueba abajo.
const REALES = new Set(
  "NEG BLA CRU GRI BEI ARN ARE AZM AZC CEL ROJ VIN ROS PAL FUC NAR AMA MOS VER VOL VEA MOR LIL CAM MAR CHO DOR PLA EST MUL ANI COB GRA CAQ TOS".split(" ")
);
const vacio = new Set<string>();

describe("sugerirCodigoColor", () => {
  it("una palabra: sus primeras 3 letras", () => {
    expect(sugerirCodigoColor("Negro", vacio)).toBe("NEG");
    expect(sugerirCodigoColor("Blanco", vacio)).toBe("BLA");
    expect(sugerirCodigoColor("Cobalto", vacio)).toBe("COB");
  });

  it("dos palabras: 2 letras de la primera + 1 de la segunda", () => {
    expect(sugerirCodigoColor("Azul marino", vacio)).toBe("AZM");
    expect(sugerirCodigoColor("Azul claro", vacio)).toBe("AZC");
    expect(sugerirCodigoColor("Verde agua", vacio)).toBe("VEA");
    expect(sugerirCodigoColor("Gris antracita", vacio)).toBe("GRA");
    expect(sugerirCodigoColor("Verde botella", vacio)).toBe("VEB");
  });

  it("quita tildes, símbolos y espacios de sobra", () => {
    expect(sugerirCodigoColor("  Marrón  ", vacio)).toBe("MAR");
    expect(sugerirCodigoColor("Metálico", vacio)).toBe("MET");
    expect(sugerirCodigoColor("Azul-marino (nuevo)", vacio)).toBe("AZM");
  });

  it("si la sugerencia ya está usada, ofrece la siguiente libre", () => {
    const s = sugerirCodigoColor("Azul marino", REALES);
    expect(s).toMatch(/^[A-Z]{3}$/);
    expect(REALES.has(s)).toBe(false);
    // Verde y "Verde oliva" chocan con VER/VOL/VEA: nunca devuelve uno ocupado.
    for (const nombre of ["Verde", "Verde oliva", "Gris", "Arena", "Rojo"]) {
      const c = sugerirCodigoColor(nombre, REALES);
      expect(REALES.has(c)).toBe(false);
    }
  });

  it("reproduce los 32 códigos de la paleta esencial (20260926100000), en el orden en que entraron", () => {
    // Si la migración y la app usaran reglas distintas, un color creado a mano recibiría un código con otra lógica
    // que los del mismo día. Cada código entra a `usados` antes del siguiente, como pasaría creándolos uno por uno.
    const usados = new Set([...REALES, "MAC"]);
    const paleta: [string, string][] = [
      ["Gris perla", "GRP"], ["Gris melange", "GRM"], ["Topo", "TOP"], ["Turquesa", "TUR"], ["Azul denim", "AZD"],
      ["Azul eléctrico", "AZE"], ["Azul petróleo", "AZP"], ["Salmón", "SAL"], ["Coral", "COR"], ["Frambuesa", "FRA"],
      ["Vainilla", "VAI"], ["Amarillo limón", "AML"], ["Mandarina", "MAN"], ["Pistacho", "PIS"], ["Salvia", "SAV"],
      ["Verde limón", "VEL"], ["Esmeralda", "ESM"], ["Verde militar", "VEM"], ["Verde botella", "VEB"], ["Lavanda", "LAV"],
      ["Malva", "MAL"], ["Orquídea", "ORQ"], ["Violeta", "VIO"], ["Ciruela", "CIR"], ["Berenjena", "BER"],
      ["Terracota", "TER"], ["Plata vieja", "PLV"], ["Champán", "CHA"], ["Oro viejo", "ORV"], ["Oro rosa", "ORR"],
      ["Cobre", "COE"], ["Bronce", "BRO"],
    ];
    for (const [nombre, codigo] of paleta) {
      expect(sugerirCodigoColor(nombre, usados), nombre).toBe(codigo);
      usados.add(codigo);
    }
  });

  it("cuenta también los códigos de colores desactivados", () => {
    // ARE es «Arena (retirado)» y sigue ocupando su clave.
    expect(sugerirCodigoColor("Arena", new Set(["ARE"]))).not.toBe("ARE");
    expect(sugerirCodigoColor("Arena", new Set(["ARE"]))).toMatch(/^[A-Z]{3}$/);
  });

  it("nombre vacío o sin letras suficientes: no sugiere", () => {
    expect(sugerirCodigoColor("", vacio)).toBe("");
    expect(sugerirCodigoColor("   ", vacio)).toBe("");
    expect(sugerirCodigoColor("12 34", vacio)).toBe("");
    expect(sugerirCodigoColor("Ro", vacio)).toBe("");
  });
});

describe("normalizarCodigo", () => {
  it("deja 3 letras A-Z en mayúscula", () => {
    expect(normalizarCodigo("veb")).toBe("VEB");
    expect(normalizarCodigo("v-e b!")).toBe("VEB");
    expect(normalizarCodigo("ñuñoa")).toBe("NUN");
    expect(normalizarCodigo("abcdef")).toBe("ABC");
  });
});
