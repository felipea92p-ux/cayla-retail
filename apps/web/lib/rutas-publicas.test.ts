import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { esRutaPublica } from "./rutas-publicas";

// Toda ruta que `proxy.ts` deja pasar sin sesión es una puerta abierta a internet: esta prueba fija que hoy es UNA sola
// (la página del QR de una socia, ADR-0288 act. c) y que nada que se le parezca entra por ella.
describe("rutas públicas: solo /club/<token> pasa sin sesión", () => {
  it("la página del QR (y su acción de servidor, que viaja a la misma dirección) pasa", () => {
    expect(esRutaPublica("/club/Ab3_x-9QwErTyUiO")).toBe(true);
    expect(esRutaPublica("/club/Ab3_x-9QwErTyUiO/")).toBe(true);
    // Un token con mala forma también llega a la página: ella dice «no es válido» sin consultar la base.
    expect(esRutaPublica("/club/cualquier-cosa")).toBe(true);
  });

  it("nada más: ni el ERP, ni el club sin token, ni rutas que solo empiezan igual, ni subrutas", () => {
    for (const ruta of [
      "/",
      "/club",
      "/club/",
      "/clubes/abc",
      "/clientas",
      "/clientas/club",
      "/vender",
      "/login",
      "/auth/callback",
      "/api/padron",
      "/api/club/abc",
      "/club/abc/otra",
      "/club/abc/../../vender",
      "/x/club/abc",
    ]) {
      expect(esRutaPublica(ruta), ruta).toBe(false);
    }
  });

  it("proxy.ts la mira ANTES de pedir la sesión (si no, una clienta sin cuenta iría al login)", () => {
    const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
    const publica = proxy.indexOf("esRutaPublica(request.nextUrl.pathname)");
    const sesion = proxy.indexOf("supabase.auth.getClaims()");
    expect(publica).toBeGreaterThan(0);
    expect(sesion).toBeGreaterThan(0);
    expect(publica).toBeLessThan(sesion);
  });
});
