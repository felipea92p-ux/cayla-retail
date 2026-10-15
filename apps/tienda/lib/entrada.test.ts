import { describe, expect, it } from "vitest";
import { debeAnotarEntrada, leerAnotacion, leerUsuariosPorBorrar, marcaDeEntrada } from "./entrada";

// La entrada a la tienda cuenta como actividad del Club (Felipe 2026-10-14): se anota al iniciar sesión y, como mucho, una vez al
// día por sesión. Aquí, sin red: cuándo hace falta anotarla y cómo se lee lo que contesta la base.

const ANA = "0b6a1d7e-1111-4222-8333-444455556666";
const BEA = "0b6a1d7e-1111-4222-8333-777788889999";
// 2026-10-14 a las 22:30 de Lima (03:30 UTC del 15): el día es el de Lima, no el del servidor.
const NOCHE_LIMA = new Date("2026-10-15T03:30:00Z");
const MANANA_LIMA = new Date("2026-10-15T13:00:00Z");

describe("la entrada del día", () => {
  it("la marca es el día de Lima y de quién es la sesión", () => {
    expect(marcaDeEntrada(ANA, NOCHE_LIMA)).toBe(`2026-10-14.${ANA}`);
    expect(marcaDeEntrada(ANA, MANANA_LIMA)).toBe(`2026-10-15.${ANA}`);
  });

  it("sin marca, con la de otro día o con la de otra cuenta, se anota; con la de hoy y suya, no", () => {
    expect(debeAnotarEntrada(undefined, ANA, NOCHE_LIMA)).toBe(true);
    expect(debeAnotarEntrada(null, ANA, NOCHE_LIMA)).toBe(true);
    expect(debeAnotarEntrada(marcaDeEntrada(ANA, NOCHE_LIMA), ANA, NOCHE_LIMA)).toBe(false);
    // Al día siguiente (en Lima), otra vez: la entrada es «una vez al día por sesión».
    expect(debeAnotarEntrada(marcaDeEntrada(ANA, NOCHE_LIMA), ANA, MANANA_LIMA)).toBe(true);
    // En el mismo aparato entra otra cuenta: la suya se anota aunque el aparato ya tenga la marca de hoy.
    expect(debeAnotarEntrada(marcaDeEntrada(ANA, NOCHE_LIMA), BEA, NOCHE_LIMA)).toBe(true);
    expect(debeAnotarEntrada("cualquier cosa", ANA, NOCHE_LIMA)).toBe(true);
  });

  it("lo que contesta tienda_anotar_entrada: anotada, cerrada, sin_cuenta; lo demás, sin respuesta", () => {
    expect(leerAnotacion({ estado: "anotada" })).toBe("anotada");
    expect(leerAnotacion({ estado: "cerrada" })).toBe("cerrada");
    expect(leerAnotacion({ estado: "sin_cuenta" })).toBe("sin_cuenta");
    expect(leerAnotacion({ estado: "otra" })).toBe("sin_respuesta");
    expect(leerAnotacion(null)).toBe("sin_respuesta");
    expect(leerAnotacion("anotada")).toBe("sin_respuesta");
  });

  it("lo que contesta tienda_usuarios_por_borrar: solo ids de usuario; si no se entiende, ninguno (nunca se borra a ciegas)", () => {
    expect(leerUsuariosPorBorrar({ usuarios: [ANA, BEA] })).toEqual([ANA, BEA]);
    expect(leerUsuariosPorBorrar({ usuarios: [] })).toEqual([]);
    expect(leerUsuariosPorBorrar({ usuarios: [ANA, "no-es-un-id"] })).toEqual([]);
    expect(leerUsuariosPorBorrar(null)).toEqual([]);
  });
});
