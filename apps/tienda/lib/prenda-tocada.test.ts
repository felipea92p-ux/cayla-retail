import { describe, expect, it } from "vitest";
import { esLaMismaFoto, fotoOriginal, leerPrendaTocada } from "./prenda-tocada";

const ID = "3f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f";
const FOTO = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.jpg";
const OPTIMIZADA = `http://localhost:3101/_next/image?url=${encodeURIComponent(FOTO)}&w=640&q=75`;

describe("lo que se vio de la prenda en la tarjeta tocada", () => {
  it("la foto original se saca de la dirección del optimizador; una foto directa queda igual", () => {
    expect(fotoOriginal(OPTIMIZADA)).toBe(FOTO);
    expect(fotoOriginal("/_next/image?url=%2Ffotos%2Fb.jpg&w=384&q=75")).toBe("/fotos/b.jpg");
    expect(fotoOriginal(FOTO)).toBe(FOTO);
    expect(fotoOriginal(null)).toBeNull();
    expect(fotoOriginal("")).toBeNull();
  });

  it("se lee de los data-* de la tarjeta, con la foto ya descargada", () => {
    expect(
      leerPrendaTocada({ prenda: ID.toUpperCase(), nombre: " Blusa Tiana ", precio: "S/ 61.50", antes: "S/ 69.90", oferta: "si", categoria: "Camisas y Blusas" }, OPTIMIZADA),
    ).toEqual({
      id: ID,
      nombre: "Blusa Tiana",
      precio: "S/ 61.50",
      antes: "S/ 69.90",
      oferta: true,
      categoria: "Camisas y Blusas",
      foto: OPTIMIZADA,
      original: FOTO,
    });
  });

  it("sin precio (la portada sin cuenta), sin oferta o sin foto descargada, solo lo que hay", () => {
    expect(leerPrendaTocada({ prenda: ID, nombre: "Falda Luna" }, null)).toEqual({
      id: ID,
      nombre: "Falda Luna",
      precio: null,
      antes: null,
      oferta: false,
      categoria: null,
      foto: null,
      original: null,
    });
  });

  it("sin un id de prenda válido o sin nombre no hay nada que adelantar", () => {
    expect(leerPrendaTocada({ prenda: "blusa", nombre: "Blusa" }, null)).toBeNull();
    expect(leerPrendaTocada({ prenda: ID, nombre: "  " }, null)).toBeNull();
    expect(leerPrendaTocada({}, null)).toBeNull();
  });

  it("la foto de la tarjeta solo se usa en la ficha si es su primera foto", () => {
    const tocada = leerPrendaTocada({ prenda: ID, nombre: "Blusa" }, OPTIMIZADA);
    expect(esLaMismaFoto(tocada, FOTO)).toBe(true);
    expect(esLaMismaFoto(tocada, "https://x.supabase.co/otra.jpg")).toBe(false);
    expect(esLaMismaFoto(tocada, null)).toBe(false);
    expect(esLaMismaFoto(leerPrendaTocada({ prenda: ID, nombre: "Blusa" }, null), FOTO)).toBe(false);
    expect(esLaMismaFoto(null, FOTO)).toBe(false);
  });
});
