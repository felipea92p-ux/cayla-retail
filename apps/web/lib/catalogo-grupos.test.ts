import { describe, it, expect } from "vitest";
import { agruparCatalogo, ordenTalla } from "./catalogo-grupos";

// La grilla de Vender es el plan B (cuando la etiqueta no lee): la pistola trae talla,
// color y precio sola, así que la grilla no necesita una tarjeta por variante — una por
// prenda + color, con las tallas adentro, alcanza y deja sitio para la foto.

const v = (
  varianteId: string,
  referencia: string,
  color: string | null,
  talla: string | null,
  stockAqui: number,
  precio = 79.9,
) => ({ varianteId, referencia, color, talla, stockAqui, precio, categoria: "Blusas", fotoUrl: null });

describe("agruparCatalogo — una tarjeta por prenda + color", () => {
  it("junta las tallas de la misma prenda y color, y separa los colores", () => {
    const grupos = agruparCatalogo([
      v("1", "Blusa Emma", "Beige", "S", 6),
      v("2", "Blusa Emma", "Beige", "M", 5),
      v("3", "Blusa Emma", "Negro", "S", 6),
      v("4", "Blusa Emma", "Beige", "L", 4),
    ]);
    expect(grupos.map((g) => `${g.referencia} ${g.color}`)).toEqual(["Blusa Emma Beige", "Blusa Emma Negro"]);
    expect(grupos[0].tallas.map((t) => t.talla)).toEqual(["S", "M", "L"]);
    expect(grupos[1].tallas.map((t) => t.talla)).toEqual(["S"]);
  });

  it("respeta el orden en que aparecen las prendas en el catálogo", () => {
    const grupos = agruparCatalogo([v("1", "Casaca Ximena", "Azul", "M", 1), v("2", "Blusa Emma", "Beige", "M", 1)]);
    expect(grupos.map((g) => g.referencia)).toEqual(["Casaca Ximena", "Blusa Emma"]);
  });

  it("suma el stock de la sede y guarda el rango de precio", () => {
    const [g] = agruparCatalogo([v("1", "Blusa Emma", "Beige", "S", 6, 79.9), v("2", "Blusa Emma", "Beige", "M", 0, 89.9)]);
    expect(g.stockTotal).toBe(6);
    expect(g.precioMin).toBe(79.9);
    expect(g.precioMax).toBe(89.9);
  });

  it("un grupo con todas las tallas en cero es un grupo sin stock", () => {
    const [g] = agruparCatalogo([v("1", "Blusa Valentina", "Blanco", "S", 0), v("2", "Blusa Valentina", "Blanco", "M", 0)]);
    expect(g.stockTotal).toBe(0);
    expect(g.tallas.every((t) => t.stockAqui === 0)).toBe(true);
  });

  it("suma lo del almacén de la sede aparte del piso: sin piso pero con almacén no es un grupo agotado (D-40)", () => {
    const [g] = agruparCatalogo([
      { ...v("1", "Blusa Paracas", "Beige", "S", 0), almacenAqui: 2 },
      { ...v("2", "Blusa Paracas", "Beige", "M", 0), almacenAqui: null },
      v("3", "Blusa Paracas", "Beige", "L", 0),
    ]);
    expect(g.stockTotal).toBe(0);
    expect(g.almacenTotal).toBe(2);
    expect(g.tallas.map((t) => t.almacenAqui)).toEqual([2, 0, 0]);
    // Una tienda (alguna talla trae el dato del almacén): `stockTotal` es solo el piso.
    expect(g.separaPiso).toBe(true);
  });

  it("en el Taller (sin almacén) o sin el dato, `stockTotal` es todo lo de la sede, no «el piso»", () => {
    const [g] = agruparCatalogo([{ ...v("1", "Blusa Paracas", "Beige", "S", 3), almacenAqui: null }, v("2", "Blusa Paracas", "Beige", "M", 1)]);
    expect(g.separaPiso).toBe(false);
  });

  it("cada talla conserva su variante entera: es lo que va al ticket al tocarla", () => {
    const original = v("7", "Blusa Emma", "Beige", "M", 5);
    const [g] = agruparCatalogo([original]);
    expect(g.tallas[0].variante).toBe(original);
  });

  it("sin color agrupa por prenda sola; sin talla la etiqueta es «Única»", () => {
    const [g] = agruparCatalogo([v("1", "Pañuelo Lima", null, null, 3)]);
    expect(g.color).toBeNull();
    expect(g.tallas.map((t) => t.talla)).toEqual(["Única"]);
  });
});

describe("ordenTalla — el orden en que se leen las tallas en la tienda", () => {
  it("las letras van de la más chica a la más grande, no alfabéticas", () => {
    expect(["XL", "S", "M", "XS", "L", "XXL"].sort(ordenTalla)).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
  });

  it("las numéricas van por valor, no por texto (8 antes que 10)", () => {
    expect(["32", "8", "10", "28"].sort(ordenTalla)).toEqual(["8", "10", "28", "32"]);
  });

  it("lo que no es ni letra conocida ni número va al final, en orden alfabético", () => {
    expect(["Única", "M", "Larga", "S"].sort(ordenTalla)).toEqual(["S", "M", "Larga", "Única"]);
  });

  it("no distingue mayúsculas ni espacios", () => {
    expect(["m", " S", "l "].sort(ordenTalla)).toEqual([" S", "m", "l "]);
  });
});
