import { describe, expect, it } from "vitest";
import { avisoDeIAQueNoPudo, codigosParaReintentar, fotosParaLaIAAlEncender, lugarDeLasFotosNuevas, pendientesParaLaIAAlEncender, motivoDeFalla, segundaOpcionDelDibujo, sumarFotoUnaVez } from "./fotos-y-colores-reglas";

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

  it("un error del navegador al abrir una foto no sale en inglés (Chaleco Dad, 2026-11-16)", () => {
    // Safari: `InvalidStateError`; Chrome: `InvalidStateError`/`EncodingError`. Son `DOMException`, que también es `Error`.
    const safari = new DOMException("An error occured reading the Blob argument to createImageBitmap", "InvalidStateError");
    const chrome = new DOMException("The source image could not be decoded.", "InvalidStateError");
    expect(motivoDeFalla(safari, "No se pudo leer esta foto.")).toBe("No se pudo leer esta foto.");
    expect(motivoDeFalla(chrome, "No se pudo leer esta foto.")).toBe("No se pudo leer esta foto.");
    expect(motivoDeFalla(new RangeError("Invalid array length"), "No se pudo leer esta foto.")).toBe("No se pudo leer esta foto.");
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

describe("lugarDeLasFotosNuevas — sumar fotos a una prenda que ya existe no le cambia la principal", () => {
  it("una prenda sin fotos: desde 0 y la primera es la principal", () => {
    expect(lugarDeLasFotosNuevas([])).toEqual({ desde: 0, primeraEsPrincipal: true });
  });

  it("una prenda con fotos: detrás de la última y la principal sigue siendo la suya", () => {
    expect(
      lugarDeLasFotosNuevas([
        { orden: 0, es_principal: true },
        { orden: 3, es_principal: false },
      ]),
    ).toEqual({ desde: 4, primeraEsPrincipal: false });
  });

  it("con fotos pero ninguna principal: la primera nueva lo es", () => {
    expect(lugarDeLasFotosNuevas([{ orden: 1, es_principal: false }])).toEqual({ desde: 2, primeraEsPrincipal: true });
  });
});

describe("encender la IA con fotos ya subidas no obliga a quitarlas y subirlas de nuevo (Felipe 2026-11-16)", () => {
  const foto = (clave: string, colorCodigo: string | null, ia?: unknown) => ({ clave, colorCodigo, ia });

  it("prepara la PRIMERA foto de cada color (la de frente); la espalda no se paga", () => {
    const r = fotosParaLaIAAlEncender([foto("a", "AZU"), foto("a2", "AZU"), foto("b", "ROJ")], new Set());
    expect(r.map((f) => f.clave)).toEqual(["a", "b"]);
  });

  it("no paga dos veces: la que ya tiene su versión de IA no se vuelve a pedir, ni pasa la posta a la espalda", () => {
    expect(fotosParaLaIAAlEncender([foto("a", "AZU", { usar: false }), foto("a2", "AZU")], new Set())).toEqual([]);
  });

  it("apagar y encender rápido no repite la que ya se pidió (en camino o recién llegada)", () => {
    expect(fotosParaLaIAAlEncender([foto("a", "AZU"), foto("b", "ROJ")], new Set(["a"])).map((f) => f.clave)).toEqual(["b"]);
  });

  it("de las que esperan su color, vuelven a la IA solo las que preguntan y no la tienen; las demás ya van por su camino", () => {
    const p = (clave: string, estado: string, ia?: unknown) => ({ clave, estado, ia });
    const r = pendientesParaLaIAAlEncender([p("a", "pregunta"), p("b", "pregunta", {}), p("c", "abriendo"), p("d", "ia"), p("e", "leyendo"), p("f", "armando")]);
    expect(r.map((x) => x.clave)).toEqual(["a"]);
  });

  it("la que ya tiene su respuesta completa (la mezcla falló por la red) no se reinicia: se perdería lo que se contestó", () => {
    const p = (clave: string, eleccion?: (string | null)[]) => ({ clave, estado: "pregunta", eleccion });
    const r = pendientesParaLaIAAlEncender([p("respondida", ["AZM", "MOS"]), p("a-medias", ["AZM", null]), p("sin-leer")]);
    expect(r.map((x) => x.clave)).toEqual(["a-medias", "sin-leer"]);
  });
});

describe("avisoDeIAQueNoPudo — UN aviso por tanda, que dice cuántas y cuáles (revisión 2026-11-16)", () => {
  it("sin fallas no hay aviso", () => {
    expect(avisoDeIAQueNoPudo([], 0)).toBeNull();
  });

  it("una sola: en singular, con su color", () => {
    expect(avisoDeIAQueNoPudo(["Azul"], 0)).toEqual({ titulo: "La IA no pudo con una foto: quedó como la subiste.", detalle: "Azul" });
  });

  it("varias: cuenta todas, nombra cada color una vez y suma las que esperan su color", () => {
    expect(avisoDeIAQueNoPudo(["Azul", "Rojo", "Azul"], 2)).toEqual({
      titulo: "La IA no pudo con 5 fotos: quedaron como las subiste.",
      detalle: "Azul · Rojo · 2 que esperan su color",
    });
    expect(avisoDeIAQueNoPudo([], 1)?.detalle).toBe("una que espera su color");
  });
});
