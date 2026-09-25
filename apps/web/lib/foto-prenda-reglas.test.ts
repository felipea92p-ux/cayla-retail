import { describe, expect, it } from "vitest";
import { fotoOptimizable } from "./foto-prenda-reglas";

const SUPA = "https://vovjyyiafkxteijimpuy.supabase.co";
const FOTO = `${SUPA}/storage/v1/object/public/retail-productos-fotos/b6f795a3/BLA.webp`;

describe("fotoOptimizable", () => {
  it("acepta la foto pública de nuestro Storage", () => {
    expect(fotoOptimizable(FOTO, SUPA)).toBe(true);
  });
  it("rechaza otro host (next/image tumbaría la pantalla)", () => {
    expect(fotoOptimizable("https://cdn.otro.com/storage/v1/object/public/x.webp", SUPA)).toBe(false);
    expect(fotoOptimizable(FOTO.replace("https://", "http://"), SUPA)).toBe(false);
  });
  it("rechaza lo que no es Storage público (firmado o privado)", () => {
    expect(fotoOptimizable(`${SUPA}/storage/v1/object/sign/retail-productos-fotos/x.webp?token=1`, SUPA)).toBe(false);
  });
  it("distingue localhost de 127.0.0.1 y el puerto, como el optimizador", () => {
    expect(fotoOptimizable("http://localhost:54421/storage/v1/object/public/a.webp", "http://127.0.0.1:54421")).toBe(false);
    expect(fotoOptimizable("http://127.0.0.1:54421/storage/v1/object/public/a.webp", "http://127.0.0.1:54421")).toBe(true);
  });
  it("sin URL de Supabase o con una URL rota, no optimiza", () => {
    expect(fotoOptimizable(FOTO, undefined)).toBe(false);
    expect(fotoOptimizable("no es una url", SUPA)).toBe(false);
  });
});
