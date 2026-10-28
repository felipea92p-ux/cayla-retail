import { describe, expect, it } from "vitest";
import { claveCelda, construirCeldas } from "./alta-producto";
import { contarQueSeFabrica, fechaCorta, nombreDeLaFicha, partesDelCostoPorPrenda, soles, textoColoresYTallas, textoSeVendeA } from "./orden-ficha-reglas";

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

describe("partesDelCostoPorPrenda", () => {
  const parte = (clave: string, nombre: string, costo: number, detalle: string | null = null) => ({ clave, nombre, detalle, costo });

  it("parte el costo por prenda en la tela y cada servicio de afuera: lo de toda la orden ÷ las prendas", () => {
    // 16 prendas: tela S/ 300 (18.75 c/u), costura S/ 72 (4.50 c/u), bordado S/ 96 (6.00 c/u) → 29.25 por prenda.
    const partes = partesDelCostoPorPrenda({
      totalPrendas: 16,
      porPrenda: 29.25,
      partes: [parte("tela", "Tela", 300), parte("costura", "Costura", 72, "Confecciones del Norte"), parte("bordado", "Bordado", 96, "Bordados Lima")],
    });
    expect(partes.map((p) => [p.clave, p.porPrenda])).toEqual([["tela", 18.75], ["costura", 4.5], ["bordado", 6]]);
    expect(partes[1].detalle).toBe("Confecciones del Norte");
  });

  it("las partes suman EXACTAMENTE lo que dice la ficha: tres tercios de una moneda no dejan una línea corrida (33.34 + 33.33 + 33.33 = 100.00)", () => {
    const partes = partesDelCostoPorPrenda({ totalPrendas: 3, porPrenda: 100, partes: [parte("tela", "Tela", 100), parte("costura", "Costura", 100), parte("bordado", "Bordado", 100)] });
    expect(partes.map((p) => p.porPrenda)).toEqual([33.34, 33.33, 33.33]);
    expect(Math.round(partes.reduce((s, p) => s + p.porPrenda, 0) * 100)).toBe(10000);
  });

  it("al azar: siempre suman el costo por prenda, ninguna se aparta más de una moneda de su valor exacto y ninguna es negativa", () => {
    let semilla = 20261016;
    const azar = () => {
      semilla = (semilla * 1664525 + 1013904223) % 4294967296;
      return semilla / 4294967296;
    };
    for (let caso = 0; caso < 400; caso++) {
      const totalPrendas = 1 + Math.floor(azar() * 400);
      const n = 1 + Math.floor(azar() * 5);
      const costos = Array.from({ length: n }, () => Math.round(azar() * 5000 * 100) / 100 + 0.01);
      const porPrenda = Math.round((costos.reduce((s, c) => s + c, 0) / totalPrendas) * 100) / 100;
      const partes = partesDelCostoPorPrenda({ totalPrendas, porPrenda, partes: costos.map((c, i) => parte(`p${i}`, `P${i}`, c)) });
      expect(partes, `caso ${caso}`).toHaveLength(n);
      expect(Math.round(partes.reduce((s, p) => s + p.porPrenda, 0) * 100), `caso ${caso}`).toBe(Math.round(porPrenda * 100));
      partes.forEach((p, i) => {
        expect(p.porPrenda, `caso ${caso}`).toBeGreaterThanOrEqual(0);
        expect(Math.abs(p.porPrenda - costos[i] / totalPrendas), `caso ${caso}`).toBeLessThan(0.0101);
      });
    }
  });

  it("una parte en 0 no se lista, y sin prendas, sin costo por prenda o sin nada que costar no hay desglose (la ficha no inventa)", () => {
    expect(partesDelCostoPorPrenda({ totalPrendas: 10, porPrenda: 5, partes: [parte("tela", "Tela", 0), parte("costura", "Costura", 50)] }).map((p) => p.clave)).toEqual(["costura"]);
    expect(partesDelCostoPorPrenda({ totalPrendas: 0, porPrenda: 0, partes: [parte("tela", "Tela", 50)] })).toEqual([]);
    expect(partesDelCostoPorPrenda({ totalPrendas: 10, porPrenda: 0, partes: [parte("tela", "Tela", 50)] })).toEqual([]);
    expect(partesDelCostoPorPrenda({ totalPrendas: 10, porPrenda: 5, partes: [] })).toEqual([]);
  });
});
