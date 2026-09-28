import { describe, expect, it } from "vitest";
import type { ColorAlta } from "./alta-producto";
import { colorConEseNombre, colorDeRespuesta, faltaParaCrear, familiaSugerida, nombreDeColor } from "./color-alta-reglas";

const colores: ColorAlta[] = [
  { codigo: "NEG", nombre: "Negro", hex: "#1A1A1A", familiaColor: "neutro" },
  { codigo: "NUD", nombre: "Nude", hex: "#F2D3BC", familiaColor: "neutro", sinonimos: ["color piel", "piel"] },
  { codigo: "AZM", nombre: "Azul marino", hex: "#1F2A44", familiaColor: "azul" },
  { codigo: "ROJ", nombre: "Rojo", hex: "#B3202A", familiaColor: "rojo" },
  { codigo: "PLA", nombre: "Plata", hex: "#B8B8B8", familiaColor: "metalico" },
  { codigo: "SIN", nombre: "Sin muestra", hex: null, familiaColor: "verde" },
];

describe("nombreDeColor", () => {
  it("quita espacios de más y pone la primera en mayúscula", () => {
    expect(nombreDeColor("  palo   de rosa ")).toBe("Palo de rosa");
    expect(nombreDeColor("ÁMBAR")).toBe("ÁMBAR");
    expect(nombreDeColor("   ")).toBe("");
  });
});

describe("colorConEseNombre", () => {
  it("reconoce el nombre sin tildes ni mayúsculas", () => {
    expect(colorConEseNombre("azul MARINO ", colores)?.codigo).toBe("AZM");
  });
  it("reconoce un sinónimo", () => {
    expect(colorConEseNombre("Piel", colores)?.codigo).toBe("NUD");
  });
  it("un nombre nuevo o vacío no coincide", () => {
    expect(colorConEseNombre("Palo de rosa", colores)).toBeUndefined();
    expect(colorConEseNombre("", colores)).toBeUndefined();
  });
});

describe("familiaSugerida", () => {
  it("toma la familia del color existente más parecido", () => {
    expect(familiaSugerida("#223050", colores)).toBe("azul");
    expect(familiaSugerida("#A51D25", colores)).toBe("rojo");
    // Rosado claro: CAYLA lo tiene como neutro (Nude), no como rojo.
    expect(familiaSugerida("#EFCDB8", colores)).toBe("neutro");
  });
  it("no sugiere metálico por cercanía a una muestra plana", () => {
    expect(familiaSugerida("#B9B9B9", colores)).not.toBe("metalico");
  });
  it("sin hex válido o sin con qué comparar, no sugiere", () => {
    expect(familiaSugerida(null, colores)).toBe("");
    expect(familiaSugerida("rojo", colores)).toBe("");
    expect(familiaSugerida("#123456", [])).toBe("");
  });
});

describe("faltaParaCrear", () => {
  const listo = { nombre: "Palo de rosa", hex: "#C98B8B", familia: "rojo", codigo: "PAR" };
  it("con todo, se puede crear", () => {
    expect(faltaParaCrear(listo)).toBeNull();
  });
  it("dice lo primero que falta, en orden", () => {
    expect(faltaParaCrear({ ...listo, nombre: " " })).toMatch(/nombre/);
    expect(faltaParaCrear({ ...listo, hex: null })).toMatch(/muestra/);
    expect(faltaParaCrear({ ...listo, familia: "" })).toMatch(/familia/);
    expect(faltaParaCrear({ ...listo, codigo: "PA" })).toMatch(/3 letras/);
  });
});

describe("colorDeRespuesta", () => {
  it("lee el color y si nació pendiente", () => {
    const r = colorDeRespuesta({ color: { codigo: "PAR", nombre: "Palo de rosa", familia_color: "rojo", hex: "#C98B8B", estado: "pendiente", sinonimos: ["rosa viejo"] } });
    expect(r).toEqual({ color: { codigo: "PAR", nombre: "Palo de rosa", hex: "#C98B8B", familiaColor: "rojo", sinonimos: ["rosa viejo"] }, pendiente: true });
    expect(colorDeRespuesta({ color: { codigo: "PAR", nombre: "Palo de rosa", familia_color: "rojo", hex: "#C98B8B", estado: "aprobado" } })?.pendiente).toBe(false);
  });
  it("una respuesta sin color no se inventa", () => {
    expect(colorDeRespuesta(null)).toBeNull();
    expect(colorDeRespuesta({ error: "x" })).toBeNull();
  });
});
