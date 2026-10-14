import { describe, expect, it } from "vitest";
import { claveCelda, construirCeldas } from "./alta-producto";
import { contarQueSeFabrica, fechaCorta, nombreDeLaFicha, soles, textoColoresYTallas, textoSeVendeA } from "./orden-ficha-reglas";

// Contrato en `orden-ficha-reglas.ts`. La ficha solo escribe lo que el formulario ya calculó: aquí se prueba que lo escriba bien.

describe("soles", () => {
  it("dos decimales y miles con coma, como el resto de Producción", () => {
    expect(soles(0)).toBe("S/\u00a00.00");
    expect(soles(89.9)).toBe("S/\u00a089.90");
    expect(soles(1234.5)).toBe("S/\u00a01,234.50");
  });
});

describe("fechaCorta", () => {
  it("«2026-10-23» es «23 oct» (sin cero adelante)", () => {
    expect(fechaCorta("2026-10-23")).toBe("23 oct");
    expect(fechaCorta("2027-01-05")).toBe("5 ene");
    expect(fechaCorta(" 2026-12-31 ")).toBe("31 dic");
  });
  it("vacío, a medias o un día que no existe no inventa una fecha", () => {
    for (const malo of ["", "2026-10", "23/10/2026", "2026-02-30", "2026-13-01", "2026-04-31", "abc"]) expect(fechaCorta(malo), malo).toBeNull();
  });
});

describe("contarQueSeFabrica", () => {
  const celdas = construirCeldas(["S", "M", "L"], ["NEG", "CRU", "PRO"]);
  const k = (t: string, c: string) => claveCelda(t, c);

  it("cuenta los colores y las tallas que llevan prendas, no los que ofrece la tabla", () => {
    expect(contarQueSeFabrica(celdas, new Set(), { [k("S", "NEG")]: "4", [k("M", "NEG")]: "6", [k("M", "PRO")]: "2" })).toEqual({ colores: 2, tallas: 2 });
  });
  it("una celda con 0, vacía o con texto que no es cantidad no cuenta; una celda quitada tampoco aunque tenga algo", () => {
    const cantidades = { [k("S", "NEG")]: "0", [k("M", "NEG")]: "", [k("L", "NEG")]: "abc", [k("S", "CRU")]: "5" };
    expect(contarQueSeFabrica(celdas, new Set([k("S", "CRU")]), cantidades)).toEqual({ colores: 0, tallas: 0 });
    expect(contarQueSeFabrica(celdas, new Set(), cantidades)).toEqual({ colores: 1, tallas: 1 });
  });
  it("sin color (o sin talla) ese eje no cuenta: «Sin color» no es un color", () => {
    expect(contarQueSeFabrica(construirCeldas(["S", "M"], []), new Set(), { [claveCelda("S", null)]: "3", [claveCelda("M", null)]: "2" })).toEqual({ colores: 0, tallas: 2 });
    expect(contarQueSeFabrica(construirCeldas([], ["NEG"]), new Set(), { [claveCelda(null, "NEG")]: "3" })).toEqual({ colores: 1, tallas: 0 });
  });
  it("nada escrito: cero y cero", () => {
    expect(contarQueSeFabrica(celdas, new Set(), {})).toEqual({ colores: 0, tallas: 0 });
  });
});

describe("textoColoresYTallas", () => {
  it("singular y plural", () => {
    expect(textoColoresYTallas({ colores: 3, tallas: 2 })).toBe("3 colores · 2 tallas");
    expect(textoColoresYTallas({ colores: 1, tallas: 1 })).toBe("1 color · 1 talla");
  });
  it("un eje sin nada se omite; sin nada, null (la ficha no escribe una línea vacía)", () => {
    expect(textoColoresYTallas({ colores: 0, tallas: 3 })).toBe("3 tallas");
    expect(textoColoresYTallas({ colores: 2, tallas: 0 })).toBe("2 colores");
    expect(textoColoresYTallas({ colores: 0, tallas: 0 })).toBeNull();
  });
});

describe("nombreDeLaFicha", () => {
  it("con nombre, el nombre (sin espacios de sobra) y no tenue", () => {
    expect(nombreDeLaFicha({ esNuevo: true, hayModelo: false, nombre: "  Blusa Aurora " })).toEqual({ texto: "Blusa Aurora", vacio: false });
  });
  it("sin modelo elegido y modelo nuevo sin nombre se dicen distinto, y ambos tenues", () => {
    expect(nombreDeLaFicha({ esNuevo: false, hayModelo: false, nombre: "" })).toEqual({ texto: "Sin modelo todavía", vacio: true });
    expect(nombreDeLaFicha({ esNuevo: true, hayModelo: false, nombre: "   " })).toEqual({ texto: "Sin nombre todavía", vacio: true });
  });
});

describe("textoSeVendeA", () => {
  it("con precio, el precio", () => {
    expect(textoSeVendeA({ precio: 79.9, esNuevo: false, esMuestra: false })).toBe("S/\u00a079.90");
    expect(textoSeVendeA({ precio: 40, esNuevo: true, esMuestra: true })).toBe("S/\u00a040.00");
  });
  it("modelo nuevo sin precio: una muestra dice «al aprobarla» y un lote, «—»", () => {
    expect(textoSeVendeA({ precio: 0, esNuevo: true, esMuestra: true })).toBe("al aprobarla");
    expect(textoSeVendeA({ precio: 0, esNuevo: true, esMuestra: false })).toBe("—");
  });
  it("un modelo que ya existe sin precio no escribe la fila (la nota de la ficha explica y lleva a Editar producto)", () => {
    expect(textoSeVendeA({ precio: 0, esNuevo: false, esMuestra: false })).toBeNull();
  });
});
