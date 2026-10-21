import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La regla (`base-caida-reglas.ts`) está probada aparte; esto vigila que SIGA conectada donde importa (ADR-0450). El 2026-10-17 la base
// se cayó y a todos los sacó al login con «pide a un Líder que te dé de alta»: bastaba que alguien quitara estas líneas para que vuelva a pasar.
const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

describe("«la base no respondió» nunca se toma por «sin acceso»", () => {
  const persona = leer("./persona-actual.ts");

  it("persona-actual.ts mira si falló la base ANTES de mandar a /login con «sin_persona»", () => {
    const falloDeLaBase = persona.indexOf("esFalloDeLaBase({ error, status: estadoDelResumen })");
    const aLogin = persona.indexOf("redirect(`/login?error=${await motivoSinAcceso");
    expect(falloDeLaBase).toBeGreaterThan(0);
    expect(aLogin).toBeGreaterThan(0);
    expect(falloDeLaBase).toBeLessThan(aLogin);
    expect(persona).toContain("redirect(await direccionSinBase())");
  });

  it("persona-actual.ts no manda a /login a quien solo no pudo comprobar su sesión (Auth sin responder)", () => {
    expect(persona).toMatch(/isAuthRetryableFetchError\(errorDeSesion\) \? await direccionSinBase\(\) : "\/login"/);
  });

  const proxy = leer("../proxy.ts");

  it("proxy.ts distingue «no pude comprobar» de «no hay sesión» ANTES del redirect a /login", () => {
    const noSe = proxy.indexOf("if (noSePudoComprobar && !isLoginPage && !isAuthCallback)");
    const aLogin = proxy.indexOf("if (!haySesion && !isLoginPage && !isAuthCallback)");
    expect(noSe).toBeGreaterThan(0);
    expect(aLogin).toBeGreaterThan(0);
    expect(noSe).toBeLessThan(aLogin);
    expect(proxy).toContain("isAuthRetryableFetchError(errorDeSesion)");
  });

  it("proxy.ts responde 503 (no 401) a una API, y pasa de largo una acción de servidor", () => {
    const bloque = proxy.slice(proxy.indexOf("if (noSePudoComprobar"), proxy.indexOf("if (!haySesion && !isLoginPage"));
    expect(bloque).toContain("status: 503");
    expect(bloque).not.toContain("status: 401");
    expect(bloque).toContain('request.method === "GET" || request.method === "HEAD"');
  });

  it("proxy.ts anota la pantalla pedida en x-cayla-ruta y persona-actual.ts la lee con el mismo nombre", () => {
    expect(proxy).toContain('request.headers.set("x-cayla-ruta"');
    expect(persona).toContain('get("x-cayla-ruta")');
  });

  it("el login no dice «contraseña incorrecta» cuando el servicio no respondió", () => {
    const login = leer("../app/login/page.tsx");
    const sinRespuesta = login.indexOf("esFalloDeAuth(error)");
    const incorrectos = login.indexOf("Correo o contraseña incorrectos");
    expect(sinRespuesta).toBeGreaterThan(0);
    expect(sinRespuesta).toBeLessThan(incorrectos);
  });
});
