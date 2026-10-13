import { describe, expect, it } from "vitest";
import type { VarianteCatalogo } from "./catalogo-v2";
import { coloresDeModelos, presentacionesDeModelos } from "./produccion-presentacion";

const v = (extra: Partial<VarianteCatalogo> = {}): VarianteCatalogo => ({
  varianteId: "v",
  sku: "s",
  codigo: null,
  talla: "M",
  color: "Negro",
  colorHex: "#111111",
  fotoUrl: null,
  precio: 50,
  activo: true,
  productoId: "p1",
  referencia: "Blusa Encaje",
  categoria: "Blusas",
  categoriaPrefijo: "BLU",
  categoriaFamilia: "indumentaria",
  codigosBarras: [],
  ...extra,
});

describe("presentacionesDeModelos (la foto de cada modelo en el Resumen de Producción)", () => {
  it("la foto del modelo es la del primer color que tiene una: la misma que muestra Catálogo ▸ Productos", () => {
    const p = presentacionesDeModelos([
      v({ varianteId: "a", color: "Negro", colorHex: "#111111", fotoUrl: null }),
      v({ varianteId: "b", color: "Rojo", colorHex: "#aa0000", fotoUrl: "https://x/rojo.jpg" }),
      v({ varianteId: "c", color: "Azul", colorHex: "#0000aa", fotoUrl: "https://x/azul.jpg" }),
    ]);
    expect(p.p1.fotoUrl).toBe("https://x/rojo.jpg");
    expect(p.p1.colorHex).toBe("#aa0000");
  });
  it("una talla sin foto no le quita la foto a su color", () => {
    const p = presentacionesDeModelos([v({ varianteId: "a", talla: "S", fotoUrl: null }), v({ varianteId: "b", talla: "M", fotoUrl: "https://x/negro.jpg" })]);
    expect(p.p1.fotoUrl).toBe("https://x/negro.jpg");
  });
  it("sin ninguna foto y con UN solo color: el ícono de su categoría se pinta de ese color", () => {
    const p = presentacionesDeModelos([v({ varianteId: "a", talla: "S", color: "Verde", colorHex: "#00aa00" }), v({ varianteId: "b", talla: "M", color: "Verde", colorHex: "#00aa00" })]);
    expect(p.p1).toEqual({ fotoUrl: null, colorHex: "#00aa00", categoria: "Blusas", categoriaPrefijo: "BLU", categoriaFamilia: "indumentaria" });
  });
  it("sin ninguna foto y con VARIOS colores no se pinta ninguno (ADR-0333): pintar el primero afirmaría un color que el modelo no tiene", () => {
    const p = presentacionesDeModelos([v({ varianteId: "a", color: "Verde", colorHex: "#00aa00" }), v({ varianteId: "b", color: "Rojo", colorHex: "#aa0000" })]);
    expect(p.p1).toEqual({ fotoUrl: null, colorHex: null, categoria: "Blusas", categoriaPrefijo: "BLU", categoriaFamilia: "indumentaria" });
  });
  it("un color sin hex no se inventa gris: queda sin color", () => {
    expect(presentacionesDeModelos([v({ color: "Estampado", colorHex: null })]).p1.colorHex).toBeNull();
  });
  it("con foto, el color queda de respaldo por si la imagen no carga", () => {
    const p = presentacionesDeModelos([v({ varianteId: "a", color: "Rojo", colorHex: "#aa0000", fotoUrl: "https://x/rojo.jpg" }), v({ varianteId: "b", color: "Azul", colorHex: "#0000aa" })]);
    expect(p.p1).toMatchObject({ fotoUrl: "https://x/rojo.jpg", colorHex: "#aa0000" });
  });
  it("una variante sin color pero con foto también cuenta como foto del modelo", () => {
    const p = presentacionesDeModelos([v({ color: null, colorHex: null, fotoUrl: "https://x/sola.jpg" })]);
    expect(p.p1.fotoUrl).toBe("https://x/sola.jpg");
  });
  it("cada modelo tiene la suya, aunque el catálogo los traiga mezclados", () => {
    const p = presentacionesDeModelos([
      v({ productoId: "p1", varianteId: "a", fotoUrl: "https://x/1.jpg" }),
      v({ productoId: "p2", varianteId: "b", referencia: "Casaca", categoria: "Casacas", categoriaPrefijo: "CAS", fotoUrl: null }),
      v({ productoId: "p1", varianteId: "c", fotoUrl: "https://x/otra.jpg" }),
    ]);
    expect(Object.keys(p).sort()).toEqual(["p1", "p2"]);
    expect(p.p1.fotoUrl).toBe("https://x/1.jpg");
    expect(p.p2).toMatchObject({ fotoUrl: null, categoria: "Casacas", categoriaPrefijo: "CAS" });
  });
  it("sin categoría en el catálogo no se cae: todo queda nulo y quien dibuja usa la percha", () => {
    const p = presentacionesDeModelos([v({ categoria: null, categoriaPrefijo: undefined, categoriaFamilia: undefined })]);
    expect(p.p1).toMatchObject({ categoria: null, categoriaPrefijo: null, categoriaFamilia: null });
  });
  it("un modelo que el catálogo no trae no tiene presentación", () => {
    expect(presentacionesDeModelos([]).p1).toBeUndefined();
  });
});

describe("coloresDeModelos (la foto de cada color en la hoja «Ver el modelo»)", () => {
  it("cada color trae su foto, en el orden en que llegan; una talla sin foto no le quita la foto a su color", () => {
    const c = coloresDeModelos([
      v({ varianteId: "a", talla: "S", color: "Negro", colorHex: "#111111", fotoUrl: null }),
      v({ varianteId: "b", talla: "M", color: "Negro", colorHex: "#111111", fotoUrl: "https://x/negro.jpg" }),
      v({ varianteId: "c", talla: "S", color: "Rojo", colorHex: "#aa0000", fotoUrl: null }),
    ]);
    expect(c.p1).toEqual([
      { nombre: "Negro", hex: "#111111", fotoUrl: "https://x/negro.jpg" },
      { nombre: "Rojo", hex: "#aa0000", fotoUrl: null },
    ]);
  });
  it("sin hex en el catálogo queda null: no se inventa el gris de relleno", () => {
    expect(coloresDeModelos([v({ color: "Sin nombre conocido", colorHex: null })]).p1).toEqual([{ nombre: "Sin nombre conocido", hex: null, fotoUrl: null }]);
  });
  it("separa un modelo de otro y no mezcla sus colores", () => {
    const c = coloresDeModelos([v({ productoId: "p1", color: "Negro" }), v({ productoId: "p2", color: "Verde", colorHex: "#00aa00" })]);
    expect(c.p1.map((x) => x.nombre)).toEqual(["Negro"]);
    expect(c.p2.map((x) => x.nombre)).toEqual(["Verde"]);
  });
  it("una variante desactivada no aporta color mientras haya otras activas", () => {
    const c = coloresDeModelos([v({ varianteId: "a", color: "Negro" }), v({ varianteId: "b", color: "Viejo", activo: false })]);
    expect(c.p1.map((x) => x.nombre)).toEqual(["Negro"]);
  });
  it("un modelo sin colores en sus variantes devuelve una lista vacía, no se cae", () => {
    expect(coloresDeModelos([v({ color: null, colorHex: null })]).p1).toEqual([]);
  });
});
