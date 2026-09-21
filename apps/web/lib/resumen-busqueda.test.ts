import { describe, expect, it } from "vitest";
import { crearIndiceBusquedaEspecial, filtrarConBusquedaEspecial } from "./filtro-busqueda-especial";
import { camposBuscables, type CamposBusqueda } from "./resumen-busqueda";

// Análisis busca con el Filtro de búsqueda especial (ver filtro-busqueda-especial.test.ts para sus reglas).
// Aquí se prueba lo propio de Análisis: cómo se lee una fila suya (la categoría cuenta como nombre; el código de
// la variante y el del producto se buscan igual que el SKU) y que todo lo que su buscador anterior encontraba
// —los ejemplos de Felipe, ADR-0121— se sigue encontrando.

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
const BLUSA_CAMILA_BLANCA_M: CamposBusqueda = { ...BLUSA_CAMILA_BLANCA_L, talla: "M", sku: "BLU-CAM-BLA-M", codigo: "BLU-0001-M", codigosBarras: [] };
const CAMISA_LINO_BEIGE_M: CamposBusqueda = { ...BLUSA_CAMILA_BLANCA_L, referencia: "Camisa Lino", categoria: "Camisas", talla: "M", color: "Beige", sku: "CAM-LIN-BEI-M", codigo: null, productoCodigo: null, codigosBarras: [] };
const CAMISA_LINO_BEIGE_XL: CamposBusqueda = { ...CAMISA_LINO_BEIGE_M, talla: "XL", sku: "CAM-LIN-BEI-XL" };
const PANTALON_MIA_38: CamposBusqueda = { ...BLUSA_CAMILA_BLANCA_L, referencia: "Pantalón Mía", categoria: "Pantalones", talla: "38", sku: "PAN-MIA-AZM-38", color: "Azul marino", codigo: null, productoCodigo: null, codigosBarras: [] };
const CARGO_ESPECIAL: CamposBusqueda = { referencia: "Cargo especial", categoria: null, color: null, talla: null, sku: "", codigo: null, productoCodigo: null, codigosBarras: [] };
const BOLSO_ANDREA: CamposBusqueda = { ...CARGO_ESPECIAL, referencia: "Andrea", categoria: "Bolsos", sku: "BOL-AND-CAM", color: "Camel" };

// Una sede con varias filas: qué es talla y qué es color se reconoce mirando lo que hay en ella.
const SEDE = [BLUSA_CAMILA_BLANCA_L, BLUSA_CAMILA_BLANCA_M, CAMISA_LINO_BEIGE_M, CAMISA_LINO_BEIGE_XL, PANTALON_MIA_38, CARGO_ESPECIAL, BOLSO_ANDREA];
const indice = crearIndiceBusquedaEspecial(SEDE, camposBuscables);
const encontradas = (consulta: string) => filtrarConBusquedaEspecial(indice, consulta).filas;
const encuentra = (consulta: string, fila: CamposBusqueda = BLUSA_CAMILA_BLANCA_L) => encontradas(consulta).includes(fila);

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
    expect(encontradas("")).toHaveLength(SEDE.length);
    expect(encontradas("   ")).toHaveLength(SEDE.length);
  });
});

describe("todas las condiciones tienen que cumplirse", () => {
  it.each(["blusa negra", "blusa camila M", "falda", "camila 0002", "blusa blanco XL"])("«%s» NO la encuentra", (consulta) => {
    expect(encuentra(consulta)).toBe(false);
  });

  it("una letra sola es una talla, no un comienzo de palabra: «l» no encuentra «Lino» ni «Lima»", () => {
    expect(encuentra("l", CAMISA_LINO_BEIGE_M)).toBe(false);
    expect(encuentra("m", CAMISA_LINO_BEIGE_M)).toBe(true);
    expect(encontradas("l")).toEqual([BLUSA_CAMILA_BLANCA_L]);
  });

  it("«M» encuentra la talla M pero no todo lo que tenga una M", () => {
    expect(encuentra("m")).toBe(false);
    expect(encontradas("m")).toEqual([BLUSA_CAMILA_BLANCA_M, CAMISA_LINO_BEIGE_M]);
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
    expect(encuentra("pantalon 38", PANTALON_MIA_38)).toBe(true);
    expect(encuentra("pantalón mía azul 38", PANTALON_MIA_38)).toBe(true);
    expect(encuentra("pantalon 40", PANTALON_MIA_38)).toBe(false);
  });
});

describe("lo propio de Análisis", () => {
  it("la categoría cuenta como parte del nombre: «bolsos» y «bolso» encuentran un producto que se llama «Andrea»", () => {
    expect(encuentra("bolsos", BOLSO_ANDREA)).toBe(true);
    expect(encuentra("bolso camel", BOLSO_ANDREA)).toBe(true);
    expect(encuentra("bolso", BLUSA_CAMILA_BLANCA_L)).toBe(false);
  });

  it("una fila sin categoría, color, talla ni códigos no revienta ni aparece por accidente", () => {
    expect(encuentra("cargo", CARGO_ESPECIAL)).toBe(true);
    expect(encuentra("blusa", CARGO_ESPECIAL)).toBe(false);
    expect(encuentra("null", CARGO_ESPECIAL)).toBe(false);
  });
});
