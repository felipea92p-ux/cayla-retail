import { describe, expect, it } from "vitest";
import type { ColorAlta } from "./alta-producto";
import { colorDeRespuesta, coloresQueYaExisten, faltaParaCrear, familiaSugerida, nombreDeColor } from "./color-alta-reglas";

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
  it("lee el color (desde ADR-0534 nace aprobado: el estado no se lee)", () => {
    const r = colorDeRespuesta({ color: { codigo: "PAR", nombre: "Palo de rosa", familia_color: "rojo", hex: "#C98B8B", estado: "pendiente", sinonimos: ["rosa viejo"] } });
    // Sin ficha todavía (ADR-0316): descripción vacía y sin compañeros, nunca `undefined`.
    expect(r).toEqual({ color: { codigo: "PAR", nombre: "Palo de rosa", hex: "#C98B8B", familiaColor: "rojo", sinonimos: ["rosa viejo"], pantoneTcx: null, descripcion: null, combinaCon: [] } });
  });
  it("trae el Pantone cuando la API lo devuelve (la referencia real de la tela)", () => {
    const r = colorDeRespuesta({ color: { codigo: "FRA", nombre: "Frambuesa", familia_color: "rojo", hex: "#A52350", estado: "aprobado", pantone_tcx: "19-2039 TCX" } });
    expect(r?.color.pantoneTcx).toBe("19-2039 TCX");
  });
  it("trae el tipo del color (una textura se pinta jaspeada) y, si la API no lo dice, lo deja ausente: liso", () => {
    const base = { codigo: "GRM", nombre: "Gris melange", familia_color: "neutro", hex: "#A2A2A1", estado: "aprobado" };
    expect(colorDeRespuesta({ color: { ...base, tipo: "textura" } })?.color.tipo).toBe("textura");
    expect(colorDeRespuesta({ color: base })?.color.tipo).toBeUndefined();
    expect(colorDeRespuesta({ color: { ...base, tipo: 3 } })?.color.tipo).toBeUndefined();
  });
  it("una respuesta sin color no se inventa", () => {
    expect(colorDeRespuesta(null)).toBeNull();
    expect(colorDeRespuesta({ error: "x" })).toBeNull();
  });
});

describe("coloresQueYaExisten: nombre y tono en una sola lista (ADR-0576)", () => {
  const vocabulario = [
    ...colores,
    { codigo: "VOL", nombre: "Verde oliva", hex: "#6A6F34", familiaColor: "verde" },
    { codigo: "VJA", nombre: "Verde jade", hex: "#70A38D", familiaColor: "verde" },
  ];
  const lista = (nombre: string, hex: string | null, familia: string | null, excluir?: string) =>
    coloresQueYaExisten(nombre, hex, familia, vocabulario, { excluir }).map((c) => `${c.item.codigo}:${c.por}`);

  it("el caso «Verde Olivo»: con el tono de la captura (≈ #80885A) queda a ΔE 10,5 de «Verde oliva», fuera del umbral de 8: solo el nombre lo delata", () => {
    expect(lista("Verde Olivo", "#80885A", "verde")).toEqual(["VOL:casi-igual"]);
  });
  it("el mismo nombre va primero; después lo que solo se parece en el tono", () => {
    expect(lista("verde oliva", "#6B6B3A", "verde")).toEqual(["VOL:mismo-nombre"]);
    expect(lista("Verde pacay", "#6F7437", "verde")).toEqual(["VOL:tono"]);
  });
  it("un color que se parece por nombre y por tono aparece una sola vez, con el motivo del nombre", () => {
    expect(lista("Verde olivo", "#6A6F34", "verde")).toEqual(["VOL:casi-igual"]);
  });
  it("un sinónimo cargado se reconoce como otro nombre", () => {
    expect(lista("Piel", null, null)).toEqual(["NUD:otro-nombre"]);
  });
  it("al editar un color no se acusa a sí mismo", () => {
    expect(lista("Verde oliva", "#6A6F34", "verde", "VOL")).toEqual([]);
  });
  it("un color nuevo de verdad no avisa de nada", () => {
    expect(lista("Verde pacay", "#B0C4DE", "azul")).toEqual([]);
  });
});
