import { describe, expect, it } from "vitest";
import { traducirError } from "./error-escritura";

// Los hints de las reglas del Conteo (rediseño 2026-09-29): cada uno se lee con su frase, sin «Código:» ni jerga.
// El archivo es aparte de `error-escritura.test.ts` a propósito: el rediseño del Conteo se construyó en paralelo y no
// debía tocar archivos de otra pieza.

const error = (hint: string, message = "mensaje de la base", code = "P0001") => ({ message, code, hint });

describe("traducirError · hints del Conteo", () => {
  const casos: [string, RegExp][] = [
    ["cantidad_invalida", /no puede ser negativa.*escribe 0/i],
    ["fuera_de_alcance", /no pertenece al conteo actual/i],
    ["recontar_no_aplica", /volver a contar.*tiene diferencia/i],
    ["confirmar_no_aplica", /confirmar.*tiene diferencia/i],
    ["conteo_vacio", /ninguna variante verificada.*cancélalo/i],
    ["sububicacion_requerida", /elige dónde vas a contar/i],
    ["sububicacion_invalida", /piso de venta o el almacén de tienda/i],
    ["conteo_cerrado", /ya se cerró o se canceló/i],
  ];

  it.each(casos)("«%s» dice qué pasó y qué hacer, sin exponer el mensaje crudo", (hint, esperado) => {
    const frase = traducirError(error(hint, "texto crudo de postgres"), "seguir con el conteo");
    expect(frase).toMatch(esperado);
    expect(frase).not.toContain("texto crudo de postgres");
    expect(frase).not.toContain("Código:");
  });

  it("los dos que traen una cuenta usan el mensaje de la base (esa cifra solo la sabe ella)", () => {
    const pendientes = "Faltan 3 variantes por contar. Vuelve a contar o cierra como conteo parcial.";
    const sinConfirmar = "Hay 2 variantes con diferencia sin confirmar. Confirma o vuelve a contar cada una antes de cerrar.";
    expect(traducirError(error("conteo_pendientes", pendientes), "cerrar el conteo")).toBe(pendientes);
    expect(traducirError(error("diferencias_sin_confirmar", sinConfirmar), "cerrar el conteo")).toBe(sinConfirmar);
  });

  it("y si el mensaje no llega, dicen su frase de respaldo", () => {
    expect(traducirError(error("conteo_pendientes", ""), "cerrar el conteo")).toMatch(/quedan variantes sin contar.*conteo parcial/i);
    expect(traducirError(error("diferencias_sin_confirmar", ""), "cerrar el conteo")).toMatch(/diferencias sin confirmar.*antes de cerrar/i);
  });

  it("un hint que no es del Conteo sigue por su camino de siempre", () => {
    expect(traducirError(error("otra_cosa", "Ya hay un conteo abierto en esta ubicación"), "abrir el conteo")).toBe("Ya hay un conteo abierto en esta ubicación");
    // Un nombre del prototipo no se confunde con un hint (el mapa no hereda `constructor` ni `toString`).
    expect(traducirError(error("constructor", "Otro mensaje"), "abrir el conteo")).toBe("Otro mensaje");
  });

  it("la frase no se apoya en el código del error: el permiso llega con 42501 y se lee igual", () => {
    expect(traducirError(error("sububicacion_requerida", "x", "42501"), "abrir el conteo")).toMatch(/elige dónde vas a contar/i);
  });
});
