import { describe, expect, it } from "vitest";
import { codigosParaReintentar, motivoDeFalla, segundaOpcionDelDibujo, sumarFotoUnaVez } from "./fotos-y-colores-reglas";

// Los tres hallazgos de /chaos en «Fotos y colores» (2026-11-14, semilla 663), hechos prueba para que no vuelvan.

describe("sumarFotoUnaVez — un clic repetido no suma la misma foto dos veces (/chaos #2)", () => {
  const foto = (clave: string, colorCodigo: string) => ({ clave, colorCodigo });

  it("tres clics en «Usar Negro» dejan una sola foto", () => {
    let fotos: { clave: string; colorCodigo: string }[] = [];
    for (let i = 0; i < 3; i++) fotos = sumarFotoUnaVez(fotos, foto("a", "NEG"));
    expect(fotos).toEqual([foto("a", "NEG")]);
  });

  it("dos fotos distintas del mismo color sí entran las dos (la espalda)", () => {
    const fotos = sumarFotoUnaVez(sumarFotoUnaVez([], foto("a", "NEG")), foto("b", "NEG"));
    expect(fotos.map((f) => f.clave)).toEqual(["a", "b"]);
  });

  it("no cambia la lista cuando la foto ya estaba (React no vuelve a pintar por nada)", () => {
    const fotos = [foto("a", "NEG")];
    expect(sumarFotoUnaVez(fotos, foto("a", "NEG"))).toBe(fotos);
  });
});

describe("codigosParaReintentar — «Volver a intentar» repite TODA la mezcla, no solo el primer color (/chaos #1)", () => {
  it("una mezcla de dos colores se reintenta con los dos", () => {
    expect(codigosParaReintentar(["AZM", "MOS"])).toEqual(["AZM", "MOS"]);
  });

  it("un color solo se reintenta solo", () => {
    expect(codigosParaReintentar(["NEG"])).toEqual(["NEG"]);
  });

  it("una parte sin contestar no se reintenta: falta elegirla", () => {
    expect(codigosParaReintentar(["AZM", null])).toBeNull();
    expect(codigosParaReintentar([])).toBeNull();
    expect(codigosParaReintentar(undefined)).toBeNull();
  });
});

describe("motivoDeFalla — sin red se dice en palabras de tienda, nunca «Failed to fetch» (/chaos #3)", () => {
  const sinRed = "No hay conexión. Revisa el internet y vuelve a intentar.";

  it("el error de red del navegador (Chrome, Safari, Firefox)", () => {
    expect(motivoDeFalla(new TypeError("Failed to fetch"), "No se pudo armar la mezcla.")).toBe(sinRed);
    expect(motivoDeFalla(new TypeError("Load failed"), "No se pudo armar la mezcla.")).toBe(sinRed);
    expect(motivoDeFalla(new TypeError("NetworkError when attempting to fetch resource."), "x")).toBe(sinRed);
  });

  it("el mensaje que manda la base se respeta", () => {
    expect(motivoDeFalla(new Error("Ya existe una mezcla con esos colores."), "x")).toBe("Ya existe una mezcla con esos colores.");
  });

  it("sin mensaje, el de respaldo", () => {
    expect(motivoDeFalla("raro", "No se pudo armar la mezcla.")).toBe("No se pudo armar la mezcla.");
    expect(motivoDeFalla(new Error(""), "No se pudo armar la mezcla.")).toBe("No se pudo armar la mezcla.");
  });
});

describe("segundaOpcionDelDibujo — «Elegir el estampado» solo si hay estampados en la lista", () => {
  it("sin estampados (como producción hoy) dice «Elegir otro color»", () => {
    expect(segundaOpcionDelDibujo([{ tipo: "solido" }, { tipo: "textura" }, { tipo: null }, {}])).toBe("Elegir otro color");
    expect(segundaOpcionDelDibujo([])).toBe("Elegir otro color");
  });

  it("con al menos un estampado, lo ofrece", () => {
    expect(segundaOpcionDelDibujo([{ tipo: "solido" }, { tipo: "estampado" }])).toBe("Elegir el estampado");
  });
});
