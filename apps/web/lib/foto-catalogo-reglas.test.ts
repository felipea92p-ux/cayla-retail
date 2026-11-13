import { describe, expect, it } from "vitest";
import {
  contarPedido,
  esFotoIA,
  LADO_MAXIMO_IA,
  MAX_BYTES_POR_FOTO_IA,
  medidasParaIA,
  moldeDeLaPrenda,
  originalDeLaFotoIA,
  rutaDeLaFotoIA,
  TOPE_POR_MINUTO,
} from "./foto-catalogo-reglas";

describe("medidasParaIA", () => {
  it("achica el lado mayor al máximo y conserva la proporción", () => {
    expect(medidasParaIA(3000, 4000, 1600)).toEqual({ ancho: 1200, alto: 1600 });
    expect(medidasParaIA(4000, 3000, 1600)).toEqual({ ancho: 1600, alto: 1200 });
  });

  it("nunca agranda una foto chica", () => {
    expect(medidasParaIA(800, 1000, 1600)).toEqual({ ancho: 800, alto: 1000 });
  });

  it("cuatro fotos al tope entran bajo los 4,5 MB que acepta Vercel", () => {
    expect(4 * MAX_BYTES_POR_FOTO_IA).toBeLessThan(4.5 * 1024 * 1024);
    expect(LADO_MAXIMO_IA).toBeGreaterThanOrEqual(1280);
  });
});

describe("contarPedido", () => {
  it("la primera vez abre la ventana", () => {
    expect(contarPedido(undefined, 1000)).toEqual({ ventana: { desde: 1000, usos: 1 }, excede: false });
  });

  it("frena al pasar el tope dentro del mismo minuto", () => {
    let v: { desde: number; usos: number } | undefined;
    let excede = false;
    for (let i = 0; i < TOPE_POR_MINUTO + 1; i++) ({ ventana: v, excede } = contarPedido(v, 1000 + i));
    expect(excede).toBe(true);
  });

  it("pasado el minuto, vuelve a contar desde cero", () => {
    expect(contarPedido({ desde: 0, usos: 99 }, 60_001)).toEqual({ ventana: { desde: 60_001, usos: 1 }, excede: false });
  });
});

describe("el par: la foto real y su versión de catálogo", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/abc.jpg";

  it("la de IA vive junto a la real, con el mismo nombre", () => {
    expect(rutaDeLaFotoIA("fotos/abc.jpg")).toBe("fotos/abc.jpg.ia.png");
    expect(esFotoIA(`${base}.ia.png`)).toBe(true);
    expect(esFotoIA(base)).toBe(false);
    expect(esFotoIA(`${base}.ia.png?v=2`)).toBe(true);
  });

  it("desde la de IA se llega a la real; desde la real, a nada", () => {
    expect(originalDeLaFotoIA(`${base}.ia.png`)).toBe(base);
    expect(originalDeLaFotoIA(base)).toBeNull();
  });
});

describe("moldeDeLaPrenda", () => {
  const ia = (n: string) => `https://x/fotos/${n}.jpg.ia.png`;
  const real = (n: string) => `https://x/fotos/${n}.jpg`;

  it("es la de IA del primer color en el orden de las variantes", () => {
    const fotos = [
      { url: ia("rosa"), colorCodigo: "ROS" },
      { url: ia("verde"), colorCodigo: "VER" },
    ];
    expect(moldeDeLaPrenda(["VER", "ROS"], fotos)).toBe(ia("verde"));
  });

  it("salta los colores sin foto de IA", () => {
    expect(moldeDeLaPrenda(["VER", "ROS"], [{ url: real("verde"), colorCodigo: "VER" }, { url: ia("rosa"), colorCodigo: "ROS" }])).toBe(ia("rosa"));
  });

  it("la foto «para todos los colores» no es molde", () => {
    expect(moldeDeLaPrenda(["VER"], [{ url: ia("general"), colorCodigo: null }])).toBeNull();
    expect(moldeDeLaPrenda(["VER"], [{ url: ia("general"), colorCodigo: null }, { url: ia("verde"), colorCodigo: "VER" }])).toBe(ia("verde"));
  });

  it("sin ninguna de IA no hay molde", () => {
    expect(moldeDeLaPrenda(["VER"], [{ url: real("verde"), colorCodigo: "VER" }])).toBeNull();
    expect(moldeDeLaPrenda([], [])).toBeNull();
  });
});
