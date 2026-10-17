import { describe, expect, it } from "vitest";
import { fichaDeLaTela, leerVocabularioDeTelas, textoDeLaFicha, valoresDeLaFicha, type VocabularioDeTelas } from "./insumos-ficha-reglas";

const vocab: VocabularioDeTelas = {
  tejidos: [{ id: "t-lino", nombre: "Lino" }, { id: "t-pop", nombre: "Popelina" }],
  colores: [{ codigo: "VEBO", nombre: "Verde botella", hex: "#1b4d3e" }, { codigo: "CRU", nombre: "Crudo", hex: null }],
};

describe("fichaDeLaTela", () => {
  it("una tela con tejido y color dice los dos y está completa", () => {
    const f = fichaDeLaTela({ tipo: "tela", tejidoId: "t-lino", colorCodigo: "VEBO" }, vocab);
    expect(f).toEqual({ tejido: "Lino", color: { nombre: "Verde botella", hex: "#1b4d3e" }, completa: true });
    expect(textoDeLaFicha(f, "tela")).toBe("Lino · Verde botella");
  });

  it("sin nada, dice lo que falta (no inventa) y no está completa", () => {
    const f = fichaDeLaTela({ tipo: "tela", tejidoId: null, colorCodigo: null }, vocab);
    expect(f).toEqual({ tejido: null, color: null, completa: false });
    expect(textoDeLaFicha(f, "tela")).toBe("Sin tejido ni color");
    expect(textoDeLaFicha(fichaDeLaTela({ tipo: "avio", tejidoId: null, colorCodigo: null }, vocab), "avio")).toBe("Sin color");
  });

  it("solo el tejido o solo el color: se dice lo que hay y no está completa", () => {
    expect(textoDeLaFicha(fichaDeLaTela({ tipo: "tela", tejidoId: "t-pop", colorCodigo: null }, vocab), "tela")).toBe("Popelina");
    const solo = fichaDeLaTela({ tipo: "tela", tejidoId: null, colorCodigo: "CRU" }, vocab);
    expect(solo).toMatchObject({ tejido: null, color: { nombre: "Crudo", hex: null }, completa: false });
  });

  it("un avío no tiene tejido (se ignora aunque la base lo traiga) y con su color está completo", () => {
    const f = fichaDeLaTela({ tipo: "avio", tejidoId: "t-lino", colorCodigo: "CRU" }, vocab);
    expect(f.tejido).toBeNull();
    expect(f.completa).toBe(true);
  });

  it("un tejido o un color que ya no está en la lista se dice, no se esconde", () => {
    const f = fichaDeLaTela({ tipo: "tela", tejidoId: "borrado", colorCodigo: "VIEJO" }, vocab);
    expect(f.tejido).toMatch(/ya no está/);
    expect(f.color?.nombre).toMatch(/ya no está/);
    expect(f.color?.hex).toBeNull();
  });
});

describe("valoresDeLaFicha", () => {
  it("escribe lo elegido y `null` si se dejó vacío", () => {
    expect(valoresDeLaFicha({ tipo: "tela", tejidoId: "t-lino", colorCodigo: "VEBO" }, vocab)).toEqual({ tejido_id: "t-lino", color_codigo: "VEBO" });
    expect(valoresDeLaFicha({ tipo: "tela", tejidoId: "", colorCodigo: "" }, vocab)).toEqual({ tejido_id: null, color_codigo: null });
  });

  it("el tejido de un avío no se guarda, y lo que no está en el vocabulario tampoco", () => {
    expect(valoresDeLaFicha({ tipo: "avio", tejidoId: "t-lino", colorCodigo: "CRU" }, vocab)).toEqual({ tejido_id: null, color_codigo: "CRU" });
    expect(valoresDeLaFicha({ tipo: "tela", tejidoId: "x", colorCodigo: "Y" }, vocab)).toEqual({ tejido_id: null, color_codigo: null });
  });
});

describe("leerVocabularioDeTelas", () => {
  it("ordena por nombre y descarta lo que no se entiende", () => {
    const v = leerVocabularioDeTelas(
      [{ id: "b", nombre: "Popelina" }, { id: "a", nombre: "Lino" }, { id: "c" }, "x", null],
      [{ codigo: "Z", nombre: "Verde", hex: "#00ff00" }, { codigo: "A", nombre: "Azul", hex: "" }, { nombre: "Sin código" }],
    );
    expect(v.tejidos.map((t) => t.nombre)).toEqual(["Lino", "Popelina"]);
    expect(v.colores).toEqual([{ codigo: "A", nombre: "Azul", hex: null }, { codigo: "Z", nombre: "Verde", hex: "#00ff00" }]);
  });

  it("una respuesta que no es lista da un vocabulario vacío (la pantalla sigue en pie)", () => {
    expect(leerVocabularioDeTelas(null, undefined)).toEqual({ tejidos: [], colores: [] });
  });
});
