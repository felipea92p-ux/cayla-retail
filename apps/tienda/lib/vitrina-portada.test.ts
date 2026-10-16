import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { EN_LA_VITRINA, tiendasEnFrase, vitrinaDePortada } from "./vitrina-portada";

const prenda = (id: string, d: Partial<Prenda> = {}): Prenda => ({
  id,
  codigo: null,
  nombre: `Prenda ${id}`,
  categoria: null,
  precio: 50,
  precioFinal: 50,
  desde: false,
  campana: null,
  colores: [],
  fotos: [`https://fotos.test/${id}.jpg`],
  stock: null,
  nuevo: null,
  vendidos: null,
  ...d,
});

describe("la vitrina de la portada", () => {
  it("solo prendas con foto, y sin repetir las del héroe", () => {
    const v = vitrinaDePortada([prenda("a", { fotos: [] }), prenda("b"), prenda("c")], new Set(["c"]));
    expect(v.map((p) => p.id)).toEqual(["b"]);
  });

  it("una foto de un color sirve aunque el modelo no tenga foto propia", () => {
    const conColor = prenda("a", { fotos: [], colores: [{ codigo: "NEG", nombre: "Negro", hex: "#111111", foto: "https://fotos.test/a-neg.jpg" }] as Prenda["colores"] });
    expect(vitrinaDePortada([conColor], new Set()).map((p) => p.id)).toEqual(["a"]);
  });

  it("primero lo nuevo (lo último que llegó primero), después lo más vendido, al final lo demás en su orden", () => {
    const v = vitrinaDePortada(
      [
        prenda("resto-1"),
        prenda("vendida-2", { vendidos: 2 }),
        prenda("nueva-10", { nuevo: { dias: 10 } }),
        prenda("resto-2"),
        prenda("vendida-1", { vendidos: 1 }),
        prenda("nueva-2", { nuevo: { dias: 2 } }),
      ],
      new Set(),
    );
    expect(v.map((p) => p.id)).toEqual(["nueva-2", "nueva-10", "vendida-1", "vendida-2", "resto-1", "resto-2"]);
  });

  it("dentro de lo nuevo, la ropa antes que los accesorios (la vitrina abre con ropa)", () => {
    const blusa = { nombre: "Blusas", prefijo: "BLU" };
    const aretes = { nombre: "Aretes", prefijo: "ARE" };
    const v = vitrinaDePortada(
      [prenda("aretes", { categoria: aretes, nuevo: { dias: 1 } }), prenda("blusa", { categoria: blusa, nuevo: { dias: 5 } }), prenda("sin-categoria", { nuevo: { dias: 1 } })],
      new Set(),
    );
    expect(v.map((p) => p.id)).toEqual(["blusa", "aretes", "sin-categoria"]);
  });

  it("muestra como mucho las que caben en el carril", () => {
    const muchas = Array.from({ length: 30 }, (_, i) => prenda(`p${i}`));
    expect(vitrinaDePortada(muchas, new Set())).toHaveLength(EN_LA_VITRINA);
  });
});

describe("las tiendas en una frase", () => {
  it("una, dos o varias; sin tiendas, nada", () => {
    expect(tiendasEnFrase([])).toBeNull();
    expect(tiendasEnFrase(["Lima"])).toBe("Lima");
    expect(tiendasEnFrase(["Lima", "Trujillo"])).toBe("Lima y Trujillo");
    expect(tiendasEnFrase(["Arequipa", "Lima", "Trujillo"])).toBe("Arequipa, Lima y Trujillo");
  });
});
