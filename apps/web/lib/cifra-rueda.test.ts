import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { columnasDeCifra } from "./cifra-rueda";

const texto = (t: string) =>
  columnasDeCifra(t)
    .map((c) => c.texto)
    .join("");
const digitos = (t: string) => columnasDeCifra(t).filter((c) => c.digito !== null);

describe("columnasDeCifra", () => {
  it("no pierde ni cambia nada del texto", () => {
    for (const t of ["S/ 3,850.00", "S/ 23,480", "−S/ 41,300", "7", "0", "—", "+S/ 1,200"]) expect(texto(t)).toBe(t);
  });

  it("cada columna tiene su propia clave", () => {
    for (const t of ["S/ 12,000.00", "S/ 1,234,567", "−S/ 41,300"]) {
      const claves = columnasDeCifra(t).map((c) => c.clave);
      expect(new Set(claves).size).toBe(claves.length);
    }
  });

  it("al ganar un dígito, los de antes conservan su columna (y la coma, la suya)", () => {
    const antes = columnasDeCifra("S/ 3,850.00").map((c) => c.clave);
    const despues = new Set(columnasDeCifra("S/ 12,000.00").map((c) => c.clave));
    for (const clave of antes) expect(despues.has(clave)).toBe(true);
  });

  it("de 86 a 23,480 los dos dígitos de la derecha son las mismas columnas y giran a su valor nuevo", () => {
    const de = Object.fromEntries(digitos("S/ 86").map((c) => [c.clave, c.digito]));
    const a = Object.fromEntries(digitos("S/ 23,480").map((c) => [c.clave, c.digito]));
    expect(de).toEqual({ d1: 8, d0: 6 });
    expect(a).toMatchObject({ d1: 8, d0: 0, d4: 2 });
  });

  it("lo de antes del primer dígito va junto y no gira; sin dígitos, todo es una pieza fija", () => {
    expect(columnasDeCifra("−S/ 41,300")[0]).toEqual({ clave: "p−S/ ", digito: null, texto: "−S/ " });
    expect(columnasDeCifra("—")).toEqual([{ clave: "p", digito: null, texto: "—" }]);
    expect(columnasDeCifra("")).toEqual([]);
  });
});

// Cuentas y dinero ▸ Dónde está decía «Taller: S/ 209» con la plata de Lima (2026-10-28): la cifra guardaba el número que mostraba en su
// estado y, al pasar a 0, nadie lo actualizaba. Desde que rueda (2026-10-31) el número que se ve sale SIEMPRE del valor de ahora: cada dígito
// no guarda ningún número (el primer cuadro en 0 se pinta tocando el elemento). Quien vuelva a guardar el número en un estado reabre aquel error.
const fuente = readFileSync(join(__dirname, "..", "components", "ui", "CifraAnimada.tsx"), "utf8");

describe("CifraAnimada", () => {
  it("lo que se ve sale del valor de ahora, no de un número guardado", () => {
    expect(fuente).toMatch(/columnasDeCifra\(texto\)/);
    expect(fuente).not.toMatch(/useState/);
  });

  it("el lector de pantalla lee el valor final, nunca los dígitos que giran", () => {
    expect(fuente).toMatch(/aria-hidden className="cifra-rueda"/);
    expect(fuente).toMatch(/<span className="sr-only">\{texto\}<\/span>/);
  });
});
