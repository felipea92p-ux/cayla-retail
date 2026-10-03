import { describe, it, expect } from "vitest";
import { agruparCatalogo, agruparPorPrenda, colorInicial, filtrarConStock, ordenTalla, puntosAVista, resumenDePrenda } from "./catalogo-grupos";

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

// ADR-0323: una tarjeta por PRENDA, con los colores adentro. Con alm = lo del almacén de la sede.
const va = (varianteId: string, referencia: string, color: string, talla: string | null, stockAqui: number, almacenAqui = 0) => ({
  ...v(varianteId, referencia, color, talla, stockAqui),
  almacenAqui,
});

describe("agruparPorPrenda — una tarjeta por prenda (ADR-0323)", () => {
  it("junta los colores de la misma prenda aunque lleguen salteados, y ordena prendas y colores por nombre", () => {
    // El catálogo llega ordenado por `sku`, vacío en casi todas: en la práctica, al azar.
    const prendas = agruparPorPrenda([
      va("1", "Top Rib", "Negro", "Estándar", 1),
      va("2", "Blusa Rayón", "Vino", "S", 1),
      va("3", "Top Rib", "Beige", "Estándar", 1),
      va("4", "Blusa Rayón", "Chocolate", "M", 1),
      va("5", "blusa encaje", "Ámbar", "Estándar", 1),
      va("6", "Blusa Rayón", "Vino", "M", 0, 1),
    ]);
    expect(prendas.map((p) => p.referencia)).toEqual(["blusa encaje", "Blusa Rayón", "Top Rib"]);
    expect(prendas[1].colores.map((c) => c.color)).toEqual(["Chocolate", "Vino"]);
    expect(prendas[1].colores[1].tallas.map((t) => t.talla)).toEqual(["S", "M"]);
    expect(prendas[1].tallas).toEqual(["S", "M"]);
    expect(prendas[1].tallaUnica).toBe(false);
    expect(prendas[2].tallaUnica).toBe(true);
  });

  it("suma piso y almacén de todos los colores y guarda el rango de precio", () => {
    const [p] = agruparPorPrenda([
      { ...va("1", "Chaleco Cecia", "Arena", "L", 1, 3), precio: 49.9 },
      { ...va("2", "Chaleco Cecia", "Camel", "M", 0, 3), precio: 59.9 },
    ]);
    expect([p.stockTotal, p.almacenTotal, p.precioMin, p.precioMax, p.separaPiso]).toEqual([1, 6, 49.9, 59.9, true]);
  });

  it("dice colores y tallas en una línea", () => {
    const [rayon, top, gorra] = agruparPorPrenda([
      va("1", "Blusa Rayón", "Vino", "S", 1),
      va("2", "Blusa Rayón", "Vino", "M", 1),
      va("3", "Top Rib", "Beige", "Estándar", 1),
      va("4", "Top Rib", "Negro", "Estándar", 1),
      va("5", "Zz Gorra", "Negro", null, 1),
    ]);
    expect(resumenDePrenda(rayon)).toBe("1 color · S M");
    expect(resumenDePrenda(top)).toBe("2 colores · estándar");
    expect(resumenDePrenda(gorra)).toBe("1 color · talla única");
  });
});

describe("filtrarConStock — «Solo con stock» por color", () => {
  const prendas = agruparPorPrenda([
    va("1", "Polo Lucky", "Negro", "Estándar", 1),
    va("2", "Polo Lucky", "Crudo", "Estándar", 0, 1),
    va("3", "Polo Lucky", "Topo", "Estándar", 0, 0),
    va("4", "Pantalón Palazo", "Beige", "Estándar", 0, 2),
  ]);

  it("esconde los colores sin piso y la prenda que se queda sin ninguno", () => {
    const r = filtrarConStock(prendas, true);
    expect(r.prendas.map((p) => p.referencia)).toEqual(["Polo Lucky"]);
    expect(r.prendas[0].colores.map((c) => c.color)).toEqual(["Negro"]);
    // Crudo y Beige están en el almacén: no están agotados, falta bajarlos (D-40). Topo sí está agotado.
    expect([r.ocultos, r.ocultosEnAlmacen]).toEqual([3, 2]);
  });

  it("apagado muestra todo, sin contar nada", () => {
    expect(filtrarConStock(prendas, false)).toEqual({ prendas, ocultos: 0, ocultosEnAlmacen: 0 });
  });

  it("no toca la prenda original (el padre la memoiza)", () => {
    filtrarConStock(prendas, true);
    expect(prendas.find((p) => p.referencia === "Polo Lucky")?.colores).toHaveLength(3);
  });
});

describe("colorInicial y puntosAVista", () => {
  const [p] = agruparPorPrenda([
    va("1", "Gorra Urbana", "Azul", null, 0, 0),
    va("2", "Gorra Urbana", "Beige", null, 0, 2),
    va("3", "Gorra Urbana", "Celeste", null, 1),
    va("4", "Gorra Urbana", "Gris", null, 1),
    va("5", "Gorra Urbana", "Lila", null, 1),
    va("6", "Gorra Urbana", "Negro", null, 1),
    va("7", "Gorra Urbana", "Vino", null, 1),
  ]);

  it("abre en el primer color con piso; si no hay, en el del almacén", () => {
    expect(colorInicial(p)?.color).toBe("Celeste");
    const [sinPiso] = agruparPorPrenda([va("1", "X", "Azul", null, 0), va("2", "X", "Beige", null, 0, 1)]);
    expect(colorInicial(sinPiso)?.color).toBe("Beige");
  });

  it("con más colores que lugares deja un «+N», y el elegido siempre a la vista", () => {
    const nombres = (r: ReturnType<typeof puntosAVista>) => r.aVista.map((c) => c.color);
    expect(nombres(puntosAVista(p.colores, undefined, 5))).toEqual(["Azul", "Beige", "Celeste", "Gris"]);
    expect(puntosAVista(p.colores, undefined, 5).resto).toBe(3);
    const vino = p.colores.find((c) => c.color === "Vino")!.clave;
    expect(nombres(puntosAVista(p.colores, vino, 5))).toEqual(["Azul", "Beige", "Celeste", "Vino"]);
    expect(puntosAVista(p.colores, vino, 7)).toEqual({ aVista: p.colores, resto: 0 });
  });
});
