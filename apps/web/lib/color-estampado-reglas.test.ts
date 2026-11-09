import { describe, expect, it } from "vitest";
import { agruparPorFamilia } from "./colores-familias";
import { coloresDominantes, ejemploDeEstampado, esEstampado, familiaEnCarta, fotoQueDistingue, faltaParaEstampado, nombreDeEstampado, patronesDeEstampado } from "./color-estampado-reglas";

const colores = [
  { codigo: "NEG", nombre: "Negro", hex: "#1A1A1A", familiaColor: "neutro" },
  { codigo: "AZM", nombre: "Azul marino", hex: "#1F2A44", familiaColor: "azul", tipo: "solido" },
  { codigo: "GRM", nombre: "Gris melange", hex: "#9A9A9A", familiaColor: "neutro", tipo: "textura" },
  { codigo: "MIU", nombre: "Multicolor", hex: null, familiaColor: null },
  { codigo: "FLA", nombre: "Floral azul marino", hex: "#1F2A44", familiaColor: "azul", tipo: "estampado" },
];

describe("esEstampado", () => {
  it("solo el tipo estampado lo es", () => {
    expect(colores.filter(esEstampado).map((c) => c.codigo)).toEqual(["FLA"]);
  });
});

describe("coloresDominantes", () => {
  it("deja fuera Multicolor (no dice qué color manda) y a los otros estampados", () => {
    expect(coloresDominantes(colores).map((c) => c.codigo)).toEqual(["NEG", "AZM", "GRM"]);
  });
});

describe("patronesDeEstampado", () => {
  it("«Liso» no es un estampado, se escriba como se escriba", () => {
    const lista = [{ nombre: "Floral" }, { nombre: "Liso" }, { nombre: " LISO " }, { nombre: "Lisó" }, { nombre: "Rayas" }];
    expect(patronesDeEstampado(lista).map((p) => p.nombre)).toEqual(["Floral", "Rayas"]);
  });
});

describe("nombreDeEstampado", () => {
  it("une el patrón y el color, con el color en minúscula", () => {
    expect(nombreDeEstampado("Floral", "Azul marino")).toBe("Floral azul marino");
    expect(nombreDeEstampado(" animal print ", "Café")).toBe("Animal print café");
  });
  it("sin uno de los dos no propone nada", () => {
    expect(nombreDeEstampado("Floral", null)).toBe("");
    expect(nombreDeEstampado(null, "Rojo")).toBe("");
    expect(nombreDeEstampado("  ", "Rojo")).toBe("");
  });
});

describe("ejemploDeEstampado", () => {
  it("sigue lo elegido y vuelve al neutro sin contexto", () => {
    expect(ejemploDeEstampado("Rayas", null)).toBe("Rayas y su color");
    expect(ejemploDeEstampado(null, "Azul marino")).toBe("Patrón y azul marino");
    expect(ejemploDeEstampado(null, null)).toBe("Se arma con el patrón y el color");
    expect(ejemploDeEstampado("Rayas", null)).toBe(ejemploDeEstampado("Rayas", null));
  });
});

describe("faltaParaEstampado", () => {
  it("pide el nombre primero y el color dominante después", () => {
    expect(faltaParaEstampado({ nombre: "  ", colorDominante: null })).toMatch(/patrón/);
    expect(faltaParaEstampado({ nombre: "Rayas negro-blanco", colorDominante: null })).toMatch(/más se ve/);
    expect(faltaParaEstampado({ nombre: "Rayas negro-blanco", colorDominante: colores[0] })).toBeNull();
  });
});

describe("familiaEnCarta", () => {
  it("los estampados van aparte, después de las familias y antes de «Varios colores»", () => {
    const g = agruparPorFamilia(colores, familiaEnCarta);
    expect(g.map((x) => x.texto)).toEqual(["Neutro", "Azul", "Estampados", "Varios colores"]);
    expect(g.find((x) => x.familia === "azul")?.colores.map((c) => c.codigo)).toEqual(["AZM"]);
  });
  it("no pierde ni repite ningún color", () => {
    expect(agruparPorFamilia(colores, familiaEnCarta).flatMap((x) => x.colores.map((c) => c.codigo)).sort()).toEqual(colores.map((c) => c.codigo).sort());
  });
});

describe("fotoQueDistingue", () => {
  it("solo sirve la foto que nadie más comparte", () => {
    expect(fotoQueDistingue("a.jpg", ["a.jpg", "b.jpg", null])).toBe("a.jpg");
    expect(fotoQueDistingue("general.jpg", ["general.jpg", "general.jpg", "b.jpg"])).toBeNull();
    expect(fotoQueDistingue(null, ["a.jpg"])).toBeNull();
  });
});
