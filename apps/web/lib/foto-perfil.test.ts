import { describe, expect, it } from "vitest";
import { iniciales, urlFotoPerfil } from "./foto-perfil";

const BASE = "https://vovjyyiafkxteijimpuy.supabase.co";

describe("urlFotoPerfil", () => {
  it("arma la URL pública del bucket a partir de la ruta que guarda Dynamic", () => {
    expect(urlFotoPerfil("perfil/1f0c2a4e-0000-4000-8000-000000000001/1788896014150.jpg", BASE)).toBe(
      `${BASE}/storage/v1/object/public/fotos-perfil/perfil/1f0c2a4e-0000-4000-8000-000000000001/1788896014150.jpg`,
    );
  });

  it("sin foto, o sin base conocida, no inventa una URL: se pintan las iniciales", () => {
    expect(urlFotoPerfil(null, BASE)).toBeNull();
    expect(urlFotoPerfil("   ", BASE)).toBeNull();
    expect(urlFotoPerfil("perfil/x/1.jpg", undefined)).toBeNull();
  });

  it("respeta una URL completa y tolera barras de más", () => {
    expect(urlFotoPerfil("https://otro.host/foto.jpg", BASE)).toBe("https://otro.host/foto.jpg");
    expect(urlFotoPerfil("/perfil/x/1.jpg", `${BASE}/`)).toBe(`${BASE}/storage/v1/object/public/fotos-perfil/perfil/x/1.jpg`);
  });

  it("escapa cada tramo de la ruta sin tocar las barras", () => {
    expect(urlFotoPerfil("perfil/x/foto nueva#1.jpg", BASE)).toBe(`${BASE}/storage/v1/object/public/fotos-perfil/perfil/x/foto%20nueva%231.jpg`);
  });
});

describe("iniciales", () => {
  it("toma la primera letra de las dos primeras palabras", () => {
    expect(iniciales("Felipe Alvarez Paz")).toBe("FA");
    expect(iniciales("Felipe A.")).toBe("FA");
    expect(iniciales("  lucía  ")).toBe("L");
  });

  it("nunca deja el círculo vacío", () => {
    expect(iniciales("")).toBe("·");
    expect(iniciales(" . ")).toBe("·");
  });
});
