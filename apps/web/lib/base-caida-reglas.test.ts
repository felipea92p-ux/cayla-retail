import { describe, expect, it } from "vitest";
import { direccionDeSinBase, esFalloDeAuth, esFalloDeLaBase, msHastaReintentar, rutaDeVuelta } from "./base-caida-reglas";

describe("esFalloDeLaBase: la base no respondió ≠ la cuenta no tiene acceso", () => {
  it("sin error, nunca es un fallo", () => {
    expect(esFalloDeLaBase({ error: null, status: 200 })).toBe(false);
    expect(esFalloDeLaBase({ error: null })).toBe(false);
  });

  it("un fetch que ni llegó (status 0, «Failed to fetch») es la base caída", () => {
    expect(esFalloDeLaBase({ error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 })).toBe(true);
  });

  it("un error del servidor (500 o más) o «demasiadas peticiones» es la base caída, traiga o no código", () => {
    for (const status of [500, 502, 503, 504, 429]) {
      expect(esFalloDeLaBase({ error: { message: "x", code: "" }, status })).toBe(true);
    }
  });

  it("los códigos de conexión, falta de recursos y consulta cancelada (aunque el status falte) son la base caída", () => {
    for (const code of ["08006", "08001", "53300", "57014", "57P01", "57P03", "PGRST000", "PGRST001", "PGRST002", "PGRST003"]) {
      expect(esFalloDeLaBase({ error: { code } })).toBe(true);
    }
  });

  it("una respuesta de la base que niega algo NO es un fallo: sigue tratándose como antes (falla cerrado)", () => {
    expect(esFalloDeLaBase({ error: { code: "42501", message: "permission denied" }, status: 403 })).toBe(false);
    expect(esFalloDeLaBase({ error: { code: "42883", message: "function does not exist" }, status: 404 })).toBe(false);
    expect(esFalloDeLaBase({ error: { code: "PGRST202" }, status: 404 })).toBe(false);
    expect(esFalloDeLaBase({ error: { code: "P0001", message: "Elige quién hace esta operación" }, status: 400 })).toBe(false);
    expect(esFalloDeLaBase({ error: { code: "PGRST116" }, status: 406 })).toBe(false);
  });

  it("un error sin código ni status no se toma por caída (solo con evidencia)", () => {
    expect(esFalloDeLaBase({ error: { message: "algo" } })).toBe(false);
    expect(esFalloDeLaBase({ error: { code: null, message: null }, status: null })).toBe(false);
  });
});

describe("esFalloDeAuth: el servicio no respondió ≠ la contraseña está mal", () => {
  it("un fetch que no llegó o un error del servidor es «no respondió»", () => {
    expect(esFalloDeAuth({ name: "AuthRetryableFetchError", status: 0 })).toBe(true);
    expect(esFalloDeAuth({ name: "AuthRetryableFetchError" })).toBe(true);
    expect(esFalloDeAuth({ name: "AuthApiError", status: 500 })).toBe(true);
    expect(esFalloDeAuth({ name: "AuthApiError", status: 503 })).toBe(true);
    expect(esFalloDeAuth({ status: 0 })).toBe(true);
  });

  it("credenciales inválidas, demasiados intentos y lo demás siguen diciendo lo que dicen", () => {
    expect(esFalloDeAuth({ name: "AuthApiError", status: 400 })).toBe(false);
    expect(esFalloDeAuth({ name: "AuthApiError", status: 401 })).toBe(false);
    expect(esFalloDeAuth({ name: "AuthApiError", status: 422 })).toBe(false);
    expect(esFalloDeAuth({ name: "AuthApiError", status: 429 })).toBe(false);
    expect(esFalloDeAuth({})).toBe(false);
    expect(esFalloDeAuth({ name: null, status: null })).toBe(false);
  });
});

describe("rutaDeVuelta: solo una ruta del propio ERP", () => {
  it("deja pasar una ruta con su búsqueda", () => {
    expect(rutaDeVuelta("/vender")).toBe("/vender");
    expect(rutaDeVuelta("/caja?dia=2026-10-17")).toBe("/caja?dia=2026-10-17");
    expect(rutaDeVuelta("/inventario/traslados/abc#fila")).toBe("/inventario/traslados/abc#fila");
  });

  it("lo que no es una ruta propia cae al inicio", () => {
    for (const desde of [null, undefined, "", "   ", "vender", "https://malo.example/", "//malo.example", "/\\malo.example", "javascript:alert(1)", "/a\u0000b", "/a\nb"]) {
      expect(rutaDeVuelta(desde)).toBe("/");
    }
  });

  it("no vuelve a su propio aviso ni al login (sería un bucle)", () => {
    for (const desde of ["/sin-base", "/sin-base/", "/sin-base?desde=/vender", "/login", "/login?error=sin_persona", "/auth/callback"]) {
      expect(rutaDeVuelta(desde)).toBe("/");
    }
  });
});

describe("direccionDeSinBase", () => {
  it("lleva la ruta codificada para que su «?» no se mezcle con el de la dirección", () => {
    expect(direccionDeSinBase("/caja?dia=2026-10-17&x=1")).toBe("/sin-base?desde=%2Fcaja%3Fdia%3D2026-10-17%26x%3D1");
  });

  it("sin ruta que recordar, va sola", () => {
    expect(direccionDeSinBase(null)).toBe("/sin-base");
    expect(direccionDeSinBase("/")).toBe("/sin-base");
    expect(direccionDeSinBase("https://malo.example")).toBe("/sin-base");
  });
});

describe("msHastaReintentar: crece, tiene tope y no deja que todos pregunten a la vez", () => {
  it("el primer intento ronda los 8 s y cada uno espera más hasta el tope de un minuto", () => {
    const esperas = [0, 1, 2, 3, 4, 5, 6, 10].map((i) => msHastaReintentar(i, 0.5));
    expect(esperas[0]).toBe(8_000);
    for (let i = 1; i < esperas.length; i++) expect(esperas[i]).toBeGreaterThanOrEqual(esperas[i - 1]);
    expect(esperas.at(-1)).toBe(60_000);
  });

  it("el margen al azar es de ±25 %, y un azar fuera de rango no lo rompe", () => {
    expect(msHastaReintentar(0, 0)).toBe(6_000);
    expect(msHastaReintentar(0, 1)).toBe(10_000);
    expect(msHastaReintentar(0, -5)).toBe(6_000);
    expect(msHastaReintentar(0, 9)).toBe(10_000);
    expect(msHastaReintentar(-3, 0.5)).toBe(8_000);
  });

  it("dos aparatos con azar distinto no preguntan en el mismo instante", () => {
    expect(msHastaReintentar(2, 0.1)).not.toBe(msHastaReintentar(2, 0.9));
  });
});
