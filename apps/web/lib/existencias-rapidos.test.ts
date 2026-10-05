import { describe, expect, it } from "vitest";
import { ATAJOS_RAPIDOS, atajoElegido, CLAVES_RAPIDAS, cuentaDeAtajo, rotuloDeAtajo } from "./existencias-rapidos";
import { consultaConCambios, filtrosDeUrl } from "./existencias-filtros";
import { TEXTO_HOY } from "./existencias-hoy";

describe("atajos de filtro de Existencias", () => {
  it("hay un atajo por clave, en el orden de la fila", () => {
    expect(ATAJOS_RAPIDOS.map((a) => a.clave)).toEqual([...CLAVES_RAPIDAS]);
  });

  it("cada atajo, escrito en la URL y leído de nuevo, se enciende a sí mismo (y a ningún otro)", () => {
    for (const a of ATAJOS_RAPIDOS) {
      // Partiendo de un «Hoy» y una «Condición» ya puestos: elegir un atajo reemplaza todo, no se suma.
      const url = consultaConCambios("hoy=mantener&condicion=danadas&q=polo", a.cambios);
      const leidos = filtrosDeUrl(url, { separa: true });
      expect(atajoElegido(leidos)).toBe(a.clave);
      expect(leidos.q).toBe("polo"); // lo escrito en el buscador no se pierde
    }
  });

  it("usa los nombres de la píldora «Hoy», no unos propios", () => {
    expect(ATAJOS_RAPIDOS.find((a) => a.clave === "por_colgar")?.texto).toBe(TEXTO_HOY.por_colgar);
    expect(ATAJOS_RAPIDOS.find((a) => a.clave === "sin_stock_atras")?.texto).toBe(TEXTO_HOY.sin_stock_atras);
  });

  it("no afirma lo que no es: «Mantener», o un «Hoy» con una «Condición», no encienden ningún botón", () => {
    expect(atajoElegido({ hoy: "mantener", condicion: null })).toBeNull();
    expect(atajoElegido({ hoy: "por_colgar", condicion: "danadas" })).toBeNull();
    expect(atajoElegido({ hoy: null, condicion: null })).toBe("todo");
  });

  it("las cifras salen de la misma cuenta de las píldoras; lo que no está cuenta 0 y «Todo» no lleva cifra", () => {
    const conteos = { hoy: { por_colgar: 13 }, condicion: { danadas: 1 } };
    expect(cuentaDeAtajo("por_colgar", conteos)).toBe(13);
    expect(cuentaDeAtajo("sin_stock_atras", conteos)).toBe(0);
    expect(cuentaDeAtajo("apartadas", conteos)).toBe(0);
    expect(cuentaDeAtajo("danadas", conteos)).toBe(1);
    expect(cuentaDeAtajo("se_acaban", { hoy: {}, condicion: { se_acaban: 4 } })).toBe(4);
    expect(cuentaDeAtajo("sin_ventas", conteos)).toBe(0);
    expect(cuentaDeAtajo("todo", conteos)).toBeNull();
    const por = ATAJOS_RAPIDOS[1];
    expect(rotuloDeAtajo(por, 13)).toBe("Por colgar · 13");
    expect(rotuloDeAtajo(ATAJOS_RAPIDOS[0], null)).toBe("Todo");
  });
});
