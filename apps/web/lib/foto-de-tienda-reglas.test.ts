import { describe, expect, it } from "vitest";
import { BUCKET_DE_TIENDAS, esRutaDeFotoDeTienda, rutaDeFotoDeTienda, urlDeFotoDeTienda } from "@cayla-retail/shared/tienda-web-sede";
import { avisoDeFachada, medidasDeFachada } from "./foto-de-tienda-reglas";

const T = "f775651f-62c8-4ff4-a414-b5614026d0cd";
const OTRA = "2d97d322-8a0a-4cd5-99c4-70e52b9c01db";
const A = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("la foto de la fachada de una tienda", () => {
  it("la ruta nueva va a la carpeta de su tienda, con nombre propio", () => {
    expect(rutaDeFotoDeTienda(T.toUpperCase(), A.toUpperCase())).toBe(`tiendas/${T}/${A}.webp`);
    expect(rutaDeFotoDeTienda(T, A, "jpg")).toBe(`tiendas/${T}/${A}.jpg`);
  });

  it("solo pasa una ruta que el ERP pudo subir (y, si se pide, a la carpeta de ESA tienda)", () => {
    expect(esRutaDeFotoDeTienda(`tiendas/${T}/${A}.webp`)).toBe(true);
    expect(esRutaDeFotoDeTienda(`tiendas/${T}/${A}.webp`, T)).toBe(true);
    expect(esRutaDeFotoDeTienda(`tiendas/${T}/${A}.webp`, OTRA)).toBe(false);
    for (const mala of [`campanas/${T}/${A}.webp`, `tiendas/${T}/../${A}.webp`, `https://evil.com/tiendas/${T}/${A}.webp`, `tiendas/${T}/${A}.png`, `tiendas/${T}/fachada.webp`, `tiendas/${T}/${A.toUpperCase()}.webp`, null, 3]) {
      expect(esRutaDeFotoDeTienda(mala)).toBe(false);
    }
  });

  it("la dirección pública sale del origen del almacén, o no sale", () => {
    expect(urlDeFotoDeTienda("https://abc.supabase.co/loquesea", `tiendas/${T}/${A}.webp`)).toBe(`https://abc.supabase.co/storage/v1/object/public/${BUCKET_DE_TIENDAS}/tiendas/${T}/${A}.webp`);
    expect(urlDeFotoDeTienda(null, `tiendas/${T}/${A}.webp`)).toBeNull();
    expect(urlDeFotoDeTienda("no es una dirección", `tiendas/${T}/${A}.webp`)).toBeNull();
    expect(urlDeFotoDeTienda("https://abc.supabase.co", "tiendas/../x")).toBeNull();
  });

  it("una foto grande se reduce sin deformarse y una chica no se agranda", () => {
    expect(medidasDeFachada(4000, 3000)).toEqual({ ancho: 1067, alto: 800 });
    expect(medidasDeFachada(2400, 1600)).toEqual({ ancho: 1200, alto: 800 });
    expect(medidasDeFachada(600, 400)).toEqual({ ancho: 600, alto: 400 });
  });

  it("avisa, sin bloquear, si la foto es muy vertical", () => {
    expect(avisoDeFachada(1200, 800)).toBeNull();
    expect(avisoDeFachada(1000, 1000)).toContain("se recorta");
    expect(avisoDeFachada(900, 1600)).toContain("más ancha");
  });
});
