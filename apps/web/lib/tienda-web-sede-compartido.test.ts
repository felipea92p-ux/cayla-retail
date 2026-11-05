import { describe, expect, it } from "vitest";
import { enlaceMapaValido, LARGO_MAXIMO_ENLACE_MAPA } from "@cayla-retail/shared/tienda-web-sede";

// La misma lista que prueba la base (`scripts/pruebas/tienda_web_conf.mjs`, «El mapa de cada tienda»): la regla de aquí dice ANTES lo que
// la base dirá después, y las dos no pueden discrepar (si discrepan, el ERP promete un guardado que la base rechaza, o al revés).
describe("el enlace de mapa de una tienda", () => {
  it.each([
    "https://maps.app.goo.gl/AbC123xyz",
    "https://www.google.com/maps/place/Jr.+Pizarro+512,+Trujillo/@-8.1117,-79.0288,17z",
    "https://google.com/maps?q=-8.1117,-79.0288",
    "https://maps.google.com/?q=Trujillo",
    "https://goo.gl/maps/abc123",
    "HTTPS://WWW.GOOGLE.COM/MAPS/place/X",
  ])("%s sirve", (url) => {
    expect(enlaceMapaValido(url)).toBe(true);
  });

  it.each([
    ["http://maps.app.goo.gl/AbC123", "sin https"],
    ["https://www.google.com.evil.com/maps/x", "otro sitio con google.com en el nombre"],
    ["https://evil.com/?https://www.google.com/maps", "otro sitio"],
    ["javascript:alert(1)", "un javascript:"],
    ["https://maps.app.goo.gl/ab cd", "con un espacio"],
    ["https://www.google.com/mapsx/abc", "otra carpeta que empieza igual"],
    [`https://maps.app.goo.gl/${"a".repeat(LARGO_MAXIMO_ENLACE_MAPA)}`, "más de 400 letras"],
    ["https://www.facebook.com/tienda", "una red social"],
    ["", "vacío"],
    [" https://maps.app.goo.gl/AbC123", "con espacio al principio"],
  ])("%s no sirve (%s)", (url) => {
    expect(enlaceMapaValido(url)).toBe(false);
  });

  it("sin dato no es un enlace malo: simplemente no hay", () => {
    expect(enlaceMapaValido(null)).toBe(false);
    expect(enlaceMapaValido(undefined)).toBe(false);
  });
});
