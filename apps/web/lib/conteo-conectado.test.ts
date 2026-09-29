import { describe, it, expect } from "vitest";
import { HUECO_MINIMO_MS, PATRON_SONIDO, debeContarLectura, sonidoDeLectura } from "./conteo-conectado";

describe("debeContarLectura (cámara en ráfaga)", () => {
  const ultima = { codigo: "CMS-0001-NEG-M", en: 1000 };

  it("la primera lectura y un código distinto siempre suman", () => {
    expect(debeContarLectura("CMS-0001-NEG-M", null, { huboHueco: false, ahora: 1000 })).toBe(true);
    expect(debeContarLectura("CMS-0001-NEG-S", ultima, { huboHueco: false, ahora: 1010 })).toBe(true);
  });

  it("la misma etiqueta quieta frente a la cámara NO suma sola, por más que pase el tiempo", () => {
    expect(debeContarLectura("CMS-0001-NEG-M", ultima, { huboHueco: false, ahora: 60_000 })).toBe(false);
  });

  it("el mismo código vuelve a sumar cuando la etiqueta salió del cuadro (la prenda siguiente de la pila)", () => {
    expect(debeContarLectura("CMS-0001-NEG-M", ultima, { huboHueco: true, ahora: 1000 + HUECO_MINIMO_MS })).toBe(true);
  });

  it("un cuadro perdido un instante no cuenta como otra prenda", () => {
    expect(debeContarLectura("CMS-0001-NEG-M", ultima, { huboHueco: true, ahora: 1000 + HUECO_MINIMO_MS - 1 })).toBe(false);
  });

  it("un código vacío nunca suma", () => {
    expect(debeContarLectura("", null, { huboHueco: true, ahora: 0 })).toBe(false);
  });
});

describe("sonidoDeLectura", () => {
  it("distingue otra unidad, la primera unidad y un código que no existe", () => {
    expect(sonidoDeLectura({ encontrada: true, yaContada: true })).toBe("suma");
    expect(sonidoDeLectura({ encontrada: true, yaContada: false })).toBe("nueva");
    expect(sonidoDeLectura({ encontrada: false, yaContada: false })).toBe("desconocida");
  });

  it("cada sonido tiene su patrón: agudo y corto = bien, grave y largo = mira la pantalla", () => {
    expect(Object.keys(PATRON_SONIDO).sort()).toEqual(["desconocida", "nueva", "suma"]);
    const duracion = (s: keyof typeof PATRON_SONIDO) => PATRON_SONIDO[s].tonos.reduce((acc, [, ms]) => acc + ms, 0);
    expect(duracion("desconocida")).toBeGreaterThan(duracion("suma"));
  });
});
