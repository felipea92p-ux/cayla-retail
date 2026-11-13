import { describe, expect, it } from "vitest";
import { TRAZOS_DE_RED } from "./redes-trazos";
import { CUENTA_EN_REDES, nombreDelEnlace, REDES } from "./redes";

describe("las redes de CAYLA", () => {
  it("son seis, sin repetir ninguna, y cada una tiene su dibujo", () => {
    const ids = REDES.map((r) => r.id);
    expect(ids).toEqual(["instagram", "tiktok", "facebook", "pinterest", "youtube", "spotify"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(TRAZOS_DE_RED[id]).toMatch(/^M[\d.\s,a-zA-Z-]+$/);
  });

  it("cada enlace va por https al sitio de su red, limpio (sin idioma ni rastreo en la dirección)", () => {
    const dominio: Record<string, string> = {
      instagram: "www.instagram.com",
      tiktok: "www.tiktok.com",
      facebook: "www.facebook.com",
      pinterest: "www.pinterest.com",
      youtube: "www.youtube.com",
      spotify: "open.spotify.com",
    };
    for (const r of REDES) {
      const url = new URL(r.url);
      expect(url.protocol, r.id).toBe("https:");
      expect(url.host, r.id).toBe(dominio[r.id]);
      expect(url.search, r.id).toBe("");
    }
  });

  it("todas son de CAYLA: la dirección lleva caylaperu", () => {
    for (const r of REDES) expect(r.url, r.id).toContain(CUENTA_EN_REDES.slice(1));
  });

  it("el lector de pantalla dice a dónde lleva y que se abre aparte", () => {
    expect(nombreDelEnlace(REDES[0])).toBe("CAYLA en Instagram (se abre en otra pestaña)");
  });
});
