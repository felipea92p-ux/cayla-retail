import { describe, expect, it } from "vitest";
import { coincideConsulta, compactar, crearIndice, normalizarTexto, tokensDeConsulta, tronco, type CamposBusqueda } from "./resumen-busqueda";

const BLUSA_CAMILA_BLANCA_L: CamposBusqueda = {
  referencia: "Blusa Camila",
  categoria: "Blusas",
  color: "Blanco",
  talla: "L",
  sku: "BLU-CAM-BLA-L",
  codigo: "BLU-0001-L",
  productoCodigo: "BLU-0001",
  codigosBarras: ["7751234000019"],
};

const indice = crearIndice(BLUSA_CAMILA_BLANCA_L);
const encuentra = (consulta: string, i = indice) => coincideConsulta(i, consulta);

describe("normalización", () => {
  it("minúsculas, sin acentos, separadores como espacio", () => {
    expect(normalizarTexto("  Blúsa-CAMILA  ")).toBe("blusa camila");
    expect(compactar("BLU-0001")).toBe("blu0001");
  });

  it("tronco: plural y vocal de género", () => {
    expect(tronco("blanca")).toBe(tronco("blanco"));
    expect(tronco("blancos")).toBe(tronco("blanca"));
    expect(tronco("blusas")).toBe(tronco("blusa"));
    expect(tronco("negra")).toBe(tronco("negro"));
    // Las palabras cortas no se tocan (una talla no pierde su letra).
    expect(tronco("xl")).toBe("xl");
    expect(tronco("l")).toBe("l");
  });

  it("descarta las palabras vacías y repetidas", () => {
    expect(tokensDeConsulta("blusa talla L de blusa").map((t) => t.compacto)).toEqual(["blusa", "l"]);
  });
});

describe("los ejemplos de Felipe encuentran Blusa Camila Blanca talla L", () => {
  it.each([
    "blusa camila",
    "camila",
    "blusa blanca",
    "blusa blanco",
    "blusa L",
    "blusa blanco L",
    "camila blanco L",
    "BLU-0001",
    "blu 0001",
    "7751234000019",
    "l blanco blusa", // el orden no importa
    "Blúsa BLANCA talla l",
    "blusas", // plural
  ])("«%s»", (consulta) => {
    expect(encuentra(consulta)).toBe(true);
  });

  it("una consulta vacía cumple siempre", () => {
    expect(encuentra("")).toBe(true);
    expect(encuentra("   ")).toBe(true);
  });
});

describe("todas las condiciones tienen que cumplirse", () => {
  it.each(["blusa negra", "blusa camila M", "falda", "camila 0002", "blusa blanco XL"])("«%s» NO la encuentra", (consulta) => {
    expect(encuentra(consulta)).toBe(false);
  });

  it("una letra sola no es un prefijo: «l» no encuentra «Lima» ni «lino»", () => {
    const camisa = crearIndice({ ...BLUSA_CAMILA_BLANCA_L, referencia: "Camisa Lino", talla: "M", color: "Beige", sku: "CAM-LIN-BEI-M" });
    expect(coincideConsulta(camisa, "l")).toBe(false);
    expect(coincideConsulta(camisa, "m")).toBe(true);
  });

  it("«M» encuentra la talla M pero no todo lo que tenga una M", () => {
    expect(encuentra("m")).toBe(false);
  });
});

describe("códigos", () => {
  it("SKU completo, parcial y sin guiones", () => {
    expect(encuentra("BLU-CAM-BLA-L")).toBe(true);
    expect(encuentra("blu-cam")).toBe(true);
    expect(encuentra("blucamblal")).toBe(true);
  });

  it("código de variante y de producto", () => {
    expect(encuentra("blu-0001-l")).toBe(true);
    expect(encuentra("0001")).toBe(true);
  });

  it("código de barras completo y por fragmento", () => {
    expect(encuentra("7751234000019")).toBe(true);
    expect(encuentra("775123400")).toBe(true);
    expect(encuentra("9999999999")).toBe(false);
  });

  it("talla numérica exacta", () => {
    const pantalon = crearIndice({ ...BLUSA_CAMILA_BLANCA_L, referencia: "Pantalón Mía", talla: "38", sku: "PAN-MIA-AZM-38", color: "Azul marino", codigosBarras: [] });
    expect(coincideConsulta(pantalon, "pantalon 38")).toBe(true);
    expect(coincideConsulta(pantalon, "pantalón mía azul 38")).toBe(true);
    expect(coincideConsulta(pantalon, "pantalon 40")).toBe(false);
  });
});

describe("robustez", () => {
  it("una fila sin categoría, color, talla ni códigos no revienta", () => {
    const vacia = crearIndice({ referencia: "Cargo especial", categoria: null, color: null, talla: null, sku: "", codigo: null, productoCodigo: null, codigosBarras: [] });
    expect(coincideConsulta(vacia, "cargo")).toBe(true);
    expect(coincideConsulta(vacia, "blusa")).toBe(false);
  });
});
