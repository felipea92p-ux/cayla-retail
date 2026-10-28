import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Las piezas que dibujan «Cuadrar el piso» (ADR-0328), por dentro: las reglas de la casa que una prueba de conducta no ve. Lo que
// muestran (cifras, listas, antes → después, textos) sale de `cuadre-piso-reglas.ts` y se prueba allí; aquí, que las piezas no se
// salgan de la paleta, del vocabulario ni de los controles del sistema, y que no calculen la cuenta por su lado.
const carpeta = join(__dirname, "../components/cuadre-piso");
const fuentes = readdirSync(carpeta).map((a) => [a, readFileSync(join(carpeta, a), "utf8")] as const);
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("las piezas del cuadre del piso, por dentro", () => {
  it("son tres: el formulario, la revisión y el resultado", () => {
    expect(fuentes.map(([a]) => a).sort()).toEqual(["CuadrarPisoForm.tsx", "ResultadoCuadre.tsx", "RevisarCuadre.tsx"]);
  });

  it("ningún color suelto: solo tokens de globals.css (ADR-0169)", () => {
    for (const [a, f] of fuentes) {
      const s = sinComentarios(f);
      expect(s, a).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(s, a).not.toMatch(/\b(?:rgb|rgba|hsl|oklch)\(/);
      expect(s, a).not.toMatch(/(?:text|bg|border|outline|ring|fill|stroke)-\[#/);
    }
  });

  it("ni el vocabulario prohibido ni un <select> del navegador", () => {
    for (const [a, f] of fuentes) {
      expect(f, a).not.toMatch(/\b(clientas?|socias?|vendedoras?|empleados?|jefes?|sucursal(es)?)\b/i);
      expect(f, a).not.toMatch(/<select\b/);
    }
  });

  it("la cuenta no se hace aquí: ninguna pieza escribe la fórmula (la decide la base; el espejo vive en cuadre-piso-reglas.ts)", () => {
    for (const [a, f] of fuentes) {
      const s = sinComentarios(f);
      expect(s, a).not.toMatch(/Math\.(max|min)\(\s*0\s*,/);
      expect(s, a).not.toMatch(/cuentaDeLaPrenda\(/);
    }
  });

  it("confirmar va a la base con marca y firma, y espera su respuesta (nada optimista en stock)", () => {
    const form = fuentes.find(([a]) => a === "CuadrarPisoForm.tsx")![1];
    expect(form).toContain("RPC_CUADRAR as never");
    expect(form).toContain("p_token: token.current");
    expect(form).toContain("responsable.firma()");
    // El resultado se pinta con lo que devolvió la base (`leerRespuestaCuadre(data)`), nunca con la previsualización.
    expect(form).toMatch(/const r = leerRespuestaCuadre\(data\);/);
  });
});
