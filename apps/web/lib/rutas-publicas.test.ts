import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { esRutaPublica } from "./rutas-publicas";

// Toda ruta que `proxy.ts` deja pasar sin sesión es una puerta abierta a internet: esta prueba fija que hoy son SOLO las del
// Club CAYLA (ADR-0288 act. g) —el registro de cada tienda, la política y los términos— y que nada que se les parezca entra.
const TIENDA = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";

describe("rutas públicas: solo el registro del club, la política y los términos pasan sin sesión", () => {
  it("el registro de una tienda (y sus acciones de servidor, que viajan a la misma dirección) pasa", () => {
    expect(esRutaPublica(`/club/${TIENDA}`)).toBe(true);
    expect(esRutaPublica(`/club/${TIENDA}/`)).toBe(true);
    expect(esRutaPublica(`/club/${TIENDA.toUpperCase()}`)).toBe(true);
  });

  it("la política de privacidad y los términos pasan", () => {
    expect(esRutaPublica("/club/privacidad")).toBe(true);
    expect(esRutaPublica("/club/terminos")).toBe(true);
    expect(esRutaPublica("/club/terminos/")).toBe(true);
    expect(esRutaPublica("/api/club/nombre")).toBe(true);
  });

  it("nada más: ni el ERP, ni el club sin tienda, ni otro segmento, ni subrutas, ni rutas que solo empiezan igual", () => {
    for (const ruta of [
      "/",
      "/club",
      "/club/",
      "/clubes/abc",
      "/clientas",
      "/clientas/club",
      "/clientas/cartel",
      "/vender",
      "/login",
      "/auth/callback",
      "/api/padron",
      "/api/club/conservacion",
      "/api/club",
      "/api/club/nombre/otra",
      "/api/club/registro",
      // El token del QR personal (camino B, retirado en la tanda 1g) ya no abre nada.
      "/club/Ab3_x-9QwErTyUiO",
      "/club/cualquier-cosa",
      "/club/admin",
      `/club/${TIENDA}/otra`,
      `/club/${TIENDA}x`,
      `/club/x${TIENDA}`,
      "/club/privacidad/otra",
      "/club/privacidades",
      `/club/${TIENDA}/../../vender`,
      `/x/club/${TIENDA}`,
      "/x/club/privacidad",
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
