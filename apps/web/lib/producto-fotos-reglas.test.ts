import { describe, it, expect } from "vitest";
import { fotoDeVariante, fotosDelTraslado, MAX_FOTOS_TRASLADO, type FotoCruda } from "./producto-fotos-reglas";

const foto = (url: string, extra: Partial<FotoCruda> = {}): FotoCruda => ({ url, orden: 0, es_principal: false, color_codigo: null, ...extra });

describe("fotoDeVariante", () => {
  it("la foto del color exacto gana a cualquier otra", () => {
    const fotos = [foto("general.jpg", { es_principal: true }), foto("blanco.jpg", { color_codigo: "BLA" }), foto("verde.jpg", { color_codigo: "VER" })];
    expect(fotoDeVariante(fotos, "VER")).toBe("verde.jpg");
    expect(fotoDeVariante(fotos, "BLA")).toBe("blanco.jpg");
  });

  it("si el color no tiene foto pero hay una general (sin color), usa la general", () => {
    const fotos = [foto("general.jpg"), foto("blanco.jpg", { color_codigo: "BLA" })];
    expect(fotoDeVariante(fotos, "VER")).toBe("general.jpg");
  });

  it("NUNCA muestra la foto de otro color: una blusa Verde con la foto de la Blanca confunde al contar", () => {
    const fotos = [foto("blanco.jpg", { color_codigo: "BLA", es_principal: true })];
    expect(fotoDeVariante(fotos, "VER")).toBeNull();
  });

  it("una variante sin color solo puede usar fotos generales", () => {
    expect(fotoDeVariante([foto("blanco.jpg", { color_codigo: "BLA" })], null)).toBeNull();
    expect(fotoDeVariante([foto("general.jpg"), foto("blanco.jpg", { color_codigo: "BLA" })], null)).toBe("general.jpg");
  });

  it("dentro de las candidatas gana la principal y luego la de menor orden", () => {
    const fotos = [
      foto("c-2.jpg", { color_codigo: "BLA", orden: 2 }),
      foto("c-0.jpg", { color_codigo: "BLA", orden: 0 }),
      foto("c-principal.jpg", { color_codigo: "BLA", orden: 5, es_principal: true }),
    ];
    expect(fotoDeVariante(fotos, "BLA")).toBe("c-principal.jpg");
    expect(fotoDeVariante(fotos.slice(0, 2), "BLA")).toBe("c-0.jpg");
  });

  it("sin fotos no hay foto, y no toca el arreglo original", () => {
    expect(fotoDeVariante([], "BLA")).toBeNull();
    const fotos = [foto("b.jpg", { orden: 2 }), foto("a.jpg", { orden: 1 })];
    fotoDeVariante(fotos, null);
    expect(fotos.map((f) => f.url)).toEqual(["b.jpg", "a.jpg"]);
  });
});

describe("fotosDelTraslado", () => {
  const mapa = new Map<string, FotoCruda[]>([
    ["blusa", [foto("blusa-bla.jpg", { color_codigo: "BLA" }), foto("blusa-neg.jpg", { color_codigo: "NEG" })]],
    ["falda", [foto("falda.jpg")]],
    ["vestido", [foto("vestido.jpg")]],
    ["pantalon", [foto("pantalon.jpg")]],
    ["sin-fotos", []],
  ]);

  it("las líneas más grandes primero, y una miniatura por foto distinta (varias tallas comparten)", () => {
    const fotos = fotosDelTraslado(
      [
        { cantidad: 3, productoId: "blusa", colorCodigo: "BLA", referencia: "Blusa Camila" },
        { cantidad: 9, productoId: "falda", colorCodigo: "NEG", referencia: "Falda Isabella" },
        { cantidad: 5, productoId: "blusa", colorCodigo: "BLA", referencia: "Blusa Camila" }, // otra talla, misma foto
      ],
      mapa
    );
    expect(fotos.map((f) => f.url)).toEqual(["falda.jpg", "blusa-bla.jpg"]);
    expect(fotos[0].referencia).toBe("Falda Isabella");
  });

  it("omite lo que no tiene foto en vez de rellenar", () => {
    const fotos = fotosDelTraslado(
      [
        { cantidad: 9, productoId: "sin-fotos", colorCodigo: null, referencia: "Sin foto" },
        { cantidad: 4, productoId: "desconocido", colorCodigo: null, referencia: "Fuera del mapa" },
        { cantidad: 2, productoId: null, colorCodigo: null, referencia: "Sin producto" },
        { cantidad: 1, productoId: "falda", colorCodigo: null, referencia: "Falda Isabella" },
      ],
      mapa
    );
    expect(fotos.map((f) => f.url)).toEqual(["falda.jpg"]);
  });

  it("corta en el máximo", () => {
    const fotos = fotosDelTraslado(
      ["falda", "vestido", "pantalon", "blusa"].map((p, i) => ({ cantidad: 10 - i, productoId: p, colorCodigo: "BLA", referencia: p })),
      mapa
    );
    expect(fotos).toHaveLength(MAX_FOTOS_TRASLADO);
    expect(fotos.map((f) => f.url)).toEqual(["falda.jpg", "vestido.jpg", "pantalon.jpg"]);
  });

  it("es determinista aunque las líneas lleguen en otro orden", () => {
    const items = [
      { cantidad: 5, productoId: "falda", colorCodigo: null, referencia: "Falda" },
      { cantidad: 5, productoId: "vestido", colorCodigo: null, referencia: "Vestido" },
    ];
    expect(fotosDelTraslado(items, mapa)).toEqual(fotosDelTraslado([...items].reverse(), mapa));
  });

  it("sin líneas no hay miniaturas", () => {
    expect(fotosDelTraslado([], mapa)).toEqual([]);
  });
});
