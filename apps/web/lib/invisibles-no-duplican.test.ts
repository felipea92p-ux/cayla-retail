import { describe, expect, it } from "vitest";
import { claveTexto } from "./nombres-parecidos";

// Un invisible pegado de la web creaba dos veces la misma cosa (/chaos: Catálogo ▸ Atributos el 30-oct y «Nuevo avío»
// el 31-oct; Felipe pidió cerrarlo). Copiar un nombre de una página web, de un WhatsApp o de un PDF arrastra caracteres
// que no se ven —el espacio de ancho cero, el guion suave, el BOM— y la clave de comparación los tomaba por parte del
// nombre. «Botón ZW» y «Botón​ ZW» quedaban como dos fichas, con el stock partido, y el índice único no decía nada:
// para la base son dos claves distintas.
//
// Esta prueba cuida la mitad de la web. La otra mitad es `retail.fn_clave_texto`, y las DOS tienen que decir lo mismo:
// la de aquí existe para anticipar lo que la base va a aceptar o rechazar (`scripts/pruebas/clave_texto_invisibles.mjs`
// corre los mismos casos contra Postgres).

/** Los que de verdad llegan de un copiar y pegar. */
const INVISIBLES: [string, string][] = [
  ["​", "espacio de ancho cero (el que más viaja: web y WhatsApp)"],
  ["‌", "no-unidor de ancho cero"],
  ["‍", "unidor de ancho cero"],
  ["‎", "marca de izquierda a derecha"],
  ["‏", "marca de derecha a izquierda"],
  ["⁠", "unidor de palabras"],
  ["﻿", "BOM"],
  ["­", "guion suave (lo mete un PDF al cortar una palabra)"],
];

describe("un carácter invisible no crea dos veces la misma cosa", () => {
  for (const [c, nombre] of INVISIBLES) {
    it(`el ${nombre} no cambia la clave`, () => {
      expect(claveTexto(`Verde${c} Olivo`)).toBe(claveTexto("Verde Olivo"));
      expect(claveTexto(`${c}Verde Olivo`)).toBe(claveTexto("Verde Olivo"));
      expect(claveTexto(`Verde Olivo${c}`)).toBe(claveTexto("Verde Olivo"));
      expect(claveTexto(`Ver${c}de Olivo`)).toBe(claveTexto("Verde Olivo")); // partiendo una palabra
    });
  }
  it("un invisible ENTRE dos espacios no deja un espacio doble: se quita antes de juntarlos", () => {
    expect(claveTexto("Verde ​ Olivo")).toBe("verde olivo");
    expect(claveTexto("Verde ​ Olivo")).toBe("verde olivo"); // con los no-rompibles de la web
  });
  it("un nombre hecho solo de invisibles es vacío, no un nombre nuevo", () => {
    expect(claveTexto("​﻿­")).toBe("");
  });
  it("y lo que la clave ya hacía no cambia", () => {
    expect(claveTexto("  Verde   OLIVO  ")).toBe("verde olivo");
    expect(claveTexto("Añil")).toBe("anil");
    expect(claveTexto("Façon")).toBe("façon"); // la ç sigue siendo ç, como en la base
    expect(claveTexto("S.A.C.")).toBe("s.a.c."); // los puntos tampoco se tocan
  });
});
