import { describe, expect, it } from "vitest";
import {
  contarPedido,
  esFotoIA,
  LADO_MAXIMO_IA,
  MAX_BYTES_POR_FOTO_IA,
  medidasParaIA,
  avisoIANoRespondio,
  firmaDeImagen,
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

describe("firmaDeImagen — /chaos 2026-11-13: un archivo que no es imagen no llega a OpenAI", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(12).fill(0)]);
  it("reconoce JPEG, PNG y WebP por sus primeros bytes", () => {
    expect(firmaDeImagen(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(firmaDeImagen(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(firmaDeImagen(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
  });
  it("un texto con nombre .jpg no es imagen", () => {
    expect(firmaDeImagen(new TextEncoder().encode("hola, esto no es una foto <script>"))).toBeNull();
    expect(firmaDeImagen(new Uint8Array([]))).toBeNull();
    // RIFF de otra cosa (un WAV) tampoco
    expect(firmaDeImagen(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });
});

describe("avisoIANoRespondio — /chaos 2026-11-13: el aviso dice de qué color quedó la foto real", () => {
  it("nombra el color, o la foto para todos los colores", () => {
    expect(avisoIANoRespondio("de Verde agua")).toBe("La IA no respondió: quedó tu foto de Verde agua.");
    expect(avisoIANoRespondio("para todos los colores")).toBe("La IA no respondió: quedó tu foto para todos los colores.");
  });
});
