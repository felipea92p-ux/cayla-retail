import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COOKIE_CAMBIO_DE_CUENTA, DESTINO_SI_NO_SE, destinoDeLaRespuesta, saleDelLogin } from "./login-aterrizaje";

describe("el login entra directo a la pantalla de la cuenta (Felipe 2026-10-13, «se ve el inicio»)", () => {
  it("con una respuesta clara, va a la pantalla que dice", () => {
    expect(destinoDeLaRespuesta({ destino: "/inventario" })).toBe("/inventario");
    expect(destinoDeLaRespuesta({ destino: "/vender" })).toBe("/vender");
    expect(destinoDeLaRespuesta({ destino: "/global" })).toBe("/global");
    expect(destinoDeLaRespuesta({ destino: "/" })).toBe("/");
    expect(destinoDeLaRespuesta({ destino: "/global/elige-sede?desde=/inventario" })).toBe("/global/elige-sede?desde=/inventario");
  });

  it("sin respuesta o con una que no se entiende, va al Inicio, el camino de siempre", () => {
    for (const cuerpo of [null, undefined, "", "/inventario", 42, [], {}, { destino: null }, { destino: 7 }, { destino: "" }, { destino: "inventario" }]) {
      expect(destinoDeLaRespuesta(cuerpo), JSON.stringify(cuerpo)).toBe(DESTINO_SI_NO_SE);
    }
  });

  it("nunca lleva a otro sitio, aunque la respuesta lo pida", () => {
    for (const destino of ["//otro.com", "//otro.com/vender", "/\\otro.com", "https://otro.com", "javascript:alert(1)", " /vender", "/ven der", "/vender\n"]) {
      expect(destinoDeLaRespuesta({ destino }), destino).toBe(DESTINO_SI_NO_SE);
    }
  });

  it("si no sabe a dónde, el destino es el Inicio, que decide solo", () => {
    expect(DESTINO_SI_NO_SE).toBe("/");
  });
});

// 2026-11-16: «salí de la cuenta de Felipe, entré con una terminal y se quedó cargando». Next había anotado, sin sesión, que «/» lleva al login
// y el login navegaba con esa nota: nunca le preguntaba al servidor. El porqué completo, en `COOKIE_CAMBIO_DE_CUENTA`.
describe("al entrar, el navegador olvida lo que aprendió antes de esta cuenta", () => {
  const fuente = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
  const login = fuente("app/login/page.tsx");
  const accion = fuente("app/actions/entrada.ts");

  it("la Server Action cambia una cookie (lo que hace que Next vacíe la caché del router) y no guarda nada", () => {
    expect(accion.startsWith('"use server"')).toBe(true);
    expect(accion).toMatch(/\(await cookies\(\)\)\.delete\(COOKIE_CAMBIO_DE_CUENTA\)/);
    expect(COOKIE_CAMBIO_DE_CUENTA).toMatch(/^cayla_/);
  });

  it("el login la espera ANTES de navegar a la pantalla de la cuenta, y sin ella entra con la página completa", () => {
    const olvida = login.indexOf("await Promise.all([olvidarLoDeAntes(), pedirAterrizaje()])");
    const navega = login.indexOf("router.replace(destino)");
    expect(olvida, "el login ya no pide olvidar lo de antes").toBeGreaterThan(-1);
    expect(navega, "el login ya no navega con router.replace(destino)").toBeGreaterThan(olvida);
    expect(login.slice(olvida, navega)).toContain("window.location.replace(destino)");
    // Una sola navegación al entrar: ninguna otra `router.replace(`/`router.push(` que pudiera usar una nota vieja.
    expect(login.match(/router\.(replace|push)\(/g)).toHaveLength(1);
  });
});

describe("el proxy saca del login a quien ya tiene sesión solo al abrir la página", () => {
  it("al abrir /login con sesión, va al Inicio; con un motivo en la dirección, se queda", () => {
    expect(saleDelLogin({ haySesion: true, metodo: "GET", tieneError: false })).toBe(true);
    expect(saleDelLogin({ haySesion: true, metodo: "HEAD", tieneError: false })).toBe(true);
    expect(saleDelLogin({ haySesion: true, metodo: "GET", tieneError: true })).toBe(false);
    expect(saleDelLogin({ haySesion: false, metodo: "GET", tieneError: false })).toBe(false);
  });

  it("nunca redirige el POST de la Server Action del login, que viaja con la sesión recién abierta", () => {
    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(saleDelLogin({ haySesion: true, metodo, tieneError: false }), metodo).toBe(false);
    }
  });
});
