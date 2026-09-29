import { describe, expect, it } from "vitest";
import { pendientesDeFicha, type EntradaFicha } from "./producto-ficha-guia";

const nombres: Record<string, string> = { AZD: "Azul denim", BEI: "Beige", MOS: "Mostaza" };
const foto = (colorCodigo: string | null, n = 1) => ({ clientKey: `f${colorCodigo}${n}`, id: `id${colorCodigo}${n}`, url: `u${colorCodigo}${n}`, esPrincipal: false, colorCodigo });

// Una prenda completa: con tejido, patrón y una foto en cada color.
const completa: EntradaFicha = {
  activa: true,
  pideTejidoPatron: true,
  hayTejidos: true,
  hayPatrones: true,
  tejidoId: "tj",
  patronId: "pt",
  colores: ["AZD", "BEI", "MOS"],
  fotos: [foto("AZD"), foto("BEI"), foto("MOS")],
  nombreColor: (c) => nombres[c] ?? c,
};
const ficha = (e: Partial<EntradaFicha> = {}) => pendientesDeFicha({ ...completa, ...e });

describe("pendientesDeFicha — qué le falta a una prenda para estar completa", () => {
  it("una prenda completa no tiene pendientes", () => {
    expect(ficha()).toEqual([]);
  });

  it("una prenda descontinuada no se regaña, aunque le falte todo", () => {
    expect(ficha({ activa: false, tejidoId: "", patronId: "", fotos: [] })).toEqual([]);
  });

  describe("tejido y patrón", () => {
    it("los pide en una familia de tela cuando la categoría los ofrece y la prenda no los tiene", () => {
      expect(ficha({ tejidoId: "", patronId: "" }).map((p) => p.id)).toEqual(["tejido", "patron"]);
      expect(ficha({ tejidoId: "" }).map((p) => p.id)).toEqual(["tejido"]);
    });

    it("no los pide fuera de esas familias", () => {
      expect(ficha({ pideTejidoPatron: false, tejidoId: "", patronId: "" })).toEqual([]);
    });

    it("no pide lo que la categoría no ofrece (no hay nada que elegir)", () => {
      expect(ficha({ hayTejidos: false, tejidoId: "" })).toEqual([]);
      expect(ficha({ hayPatrones: false, patronId: "" })).toEqual([]);
    });
  });

  describe("fotos", () => {
    it("un color sin foto se nombra", () => {
      const [p] = ficha({ fotos: [foto("AZD"), foto("MOS")] });
      expect(p).toMatchObject({ id: "fotos", etiqueta: "Foto de Beige" });
      expect(p.detalle).toContain("Beige");
    });

    it("varios colores sin foto se cuentan y se nombran en el detalle", () => {
      const [p] = ficha({ fotos: [foto("MOS")] });
      expect(p.etiqueta).toBe("Fotos de 2 colores");
      expect(p.detalle).toBe("Todavía sin foto: Azul denim y Beige.");
    });

    it("una foto de «Todos los colores» cubre a los que no tienen la suya: no falta nada", () => {
      expect(ficha({ fotos: [foto(null)] })).toEqual([]);
      expect(ficha({ fotos: [foto("AZD"), foto(null)] })).toEqual([]);
    });

    it("sin ninguna foto, faltan las de todos los colores", () => {
      expect(ficha({ fotos: [] })[0]).toMatchObject({ id: "fotos", etiqueta: "Fotos de 3 colores" });
    });

    it("con un solo color y sin foto, es «Foto de <color>»", () => {
      expect(ficha({ colores: ["BEI"], fotos: [] })[0].etiqueta).toBe("Foto de Beige");
    });

    it("una prenda sin colores necesita una foto, y con una ya está", () => {
      expect(ficha({ colores: [null], fotos: [] })[0]).toMatchObject({ id: "fotos", etiqueta: "Foto" });
      expect(ficha({ colores: [null], fotos: [foto(null)] })).toEqual([]);
    });

    it("una foto de un color que la prenda ya no vende no cubre a los demás", () => {
      expect(ficha({ fotos: [foto("AZD"), foto("BEI"), foto("ROJ")] })[0].etiqueta).toBe("Foto de Mostaza");
    });
  });

  it("en orden de pantalla: tejido, patrón y al final las fotos", () => {
    expect(ficha({ tejidoId: "", patronId: "", fotos: [] }).map((p) => p.id)).toEqual(["tejido", "patron", "fotos"]);
  });
});
