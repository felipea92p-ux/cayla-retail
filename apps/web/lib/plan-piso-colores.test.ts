import { describe, expect, it } from "vitest";
import {
  coloresDeLasPerchas,
  coloresDelIcono,
  MAX_COLORES_DEL_ICONO,
  MAX_COLORES_EN_TEXTO,
  OTROS_COLORES,
  ordenarColores,
  sumarColor,
  textoDeColores,
  type ColorDelGrupo,
} from "./plan-piso-colores";

const NEGRO = { clave: "NEG", nombre: "Negro", hex: "#1a1a1a" };
const BLANCO = { clave: "BLA", nombre: "Blanco", hex: "#ffffff" };
const BEIGE = { clave: "BEI", nombre: "Beige", hex: "#d9c7a5" };
const ROJO = { clave: "ROJ", nombre: "Rojo", hex: "#b3261e" };
const color = (c: { clave: string; nombre: string; hex: string | null }, prendas: number): ColorDelGrupo => ({ ...c, prendas });

describe("de qué colores es lo que cuelga: se suma por color y la cuenta es la de «colgadas»", () => {
  const talla = (colorCodigo: string | null, colorNombre: string | null, colorHex: string | null, pisoLibre: number) => ({ colorCodigo, color: colorNombre, colorHex, pisoLibre });

  it("varias tallas del mismo color suman en una sola entrada", () => {
    const acum = new Map<string, ColorDelGrupo>();
    sumarColor(acum, talla("NEG", "Negro", "#1A1A1A", 10));
    sumarColor(acum, talla("NEG", "Negro", "#1a1a1a", 7));
    sumarColor(acum, talla("BLA", "Blanco", "#ffffff", 3));
    expect(ordenarColores(acum)).toEqual([color(NEGRO, 17), color(BLANCO, 3)]);
  });

  it("lo que no es una cuenta (cero, negativo, NaN) no suma ni crea el color", () => {
    const acum = new Map<string, ColorDelGrupo>();
    sumarColor(acum, talla("NEG", "Negro", "#1a1a1a", 0));
    sumarColor(acum, talla("BLA", "Blanco", "#ffffff", -4));
    sumarColor(acum, talla("BEI", "Beige", "#d9c7a5", Number.NaN));
    expect(acum.size).toBe(0);
  });

  it("un hex mal escrito o ausente deja el color sin hex (nunca se pinta algo inventado)", () => {
    const acum = new Map<string, ColorDelGrupo>();
    sumarColor(acum, talla("EST", "Estampado", null, 4));
    sumarColor(acum, talla("MUL", "Multicolor", "rojo", 2));
    sumarColor(acum, talla("ROJ", "Rojo", "#b3261", 1));
    expect(ordenarColores(acum).map((c) => c.hex)).toEqual([null, null, null]);
  });

  it("un color sin código se junta por su nombre, y uno sin nada cae en «Sin color»", () => {
    const acum = new Map<string, ColorDelGrupo>();
    sumarColor(acum, talla(null, "Verde", "#2e7d32", 2));
    sumarColor(acum, talla(null, " verde ", "#2e7d32", 3));
    sumarColor(acum, talla(null, null, null, 1));
    const m = ordenarColores(acum);
    expect(m.map((c) => [c.nombre, c.prendas])).toEqual([["Verde", 5], ["Sin color", 1]]);
  });

  it("si un color llega primero sin hex y después con él, se queda con el hex", () => {
    const acum = new Map<string, ColorDelGrupo>();
    sumarColor(acum, talla("NEG", "Negro", null, 1));
    sumarColor(acum, talla("NEG", "Negro", "#1a1a1a", 1));
    expect(ordenarColores(acum)[0]!.hex).toBe("#1a1a1a");
  });

  it("el orden es del que más cuelga al que menos, y a igual cantidad por nombre (no depende de cómo llegó la lectura)", () => {
    const a = new Map<string, ColorDelGrupo>();
    const b = new Map<string, ColorDelGrupo>();
    for (const t of [talla("B", "Beige", "#d9c7a5", 5), talla("A", "Azul", "#1d4ed8", 5), talla("N", "Negro", "#1a1a1a", 9)]) sumarColor(a, t);
    for (const t of [talla("N", "Negro", "#1a1a1a", 9), talla("A", "Azul", "#1d4ed8", 5), talla("B", "Beige", "#d9c7a5", 5)]) sumarColor(b, t);
    expect(ordenarColores(a).map((c) => c.nombre)).toEqual(["Negro", "Azul", "Beige"]);
    expect(ordenarColores(b)).toEqual(ordenarColores(a));
    expect(ordenarColores(undefined)).toEqual([]);
  });
});

describe("el color de cada percha: una percha, un color, en proporción a lo que cuelga", () => {
  const hexDe = (xs: ReturnType<typeof coloresDeLasPerchas>) => xs.map((c) => c?.nombre ?? null);

  it("150 polos (60 negros, 48 blancos, 42 beige) = 7,5 perchas, 8 lugares → 3 negras, 3 blancas y 2 beige", () => {
    const r = coloresDeLasPerchas([color(NEGRO, 60), color(BLANCO, 48), color(BEIGE, 42)], 7, 0.5);
    expect(hexDe(r)).toEqual(["Negro", "Negro", "Negro", "Blanco", "Blanco", "Blanco", "Beige", "Beige"]);
  });

  it("siempre sale una percha por lugar: ni una más ni una menos, aunque los colores no den cuenta redonda", () => {
    const mezcla = [color(NEGRO, 37), color(BLANCO, 29), color(BEIGE, 23), color(ROJO, 11)];
    for (const [llenas, resto] of [[0, 0.1], [1, 0], [3, 0.4], [7, 0.5], [18, 0.25], [36, 0]] as const) {
      expect(coloresDeLasPerchas(mezcla, llenas, resto)).toHaveLength(llenas + (resto > 0 ? 1 : 0));
    }
  });

  it("los colores del mismo tono quedan juntos: nunca negro, blanco, negro", () => {
    const r = hexDe(coloresDeLasPerchas([color(NEGRO, 90), color(BLANCO, 60), color(BEIGE, 30)], 9, 0));
    const cambios = r.filter((c, i) => i > 0 && c !== r[i - 1]).length;
    expect(cambios).toBe(2);
  });

  it("un color que no llega a media percha no gana una: se junta en «Otros colores»", () => {
    // 150 prendas en 7,5 perchas: el rojo (5) pesa 0,25 de percha.
    const r = coloresDeLasPerchas([color(NEGRO, 120), color(ROJO, 5), color(BEIGE, 25)], 7, 0.5);
    expect(r.map((c) => c?.clave)).not.toContain("ROJ");
    expect(r.filter((c) => c === null)).toHaveLength(0);
    // …pero la cuenta de «otros» no se pierde: el rojo suma a lo que queda de otros colores (aquí 5 de 150 no llega a una percha: puede no verse, nunca se inventa otro color).
    expect(r.every((c) => ["NEG", "BEI", "otros"].includes(c!.clave))).toBe(true);
  });

  it("varios colores chicos que juntos sí llenan percha aparecen como «Otros colores»", () => {
    const chicos = [color({ clave: "A", nombre: "Azul", hex: "#1d4ed8" }, 7), color({ clave: "V", nombre: "Verde", hex: "#2e7d32" }, 7), color({ clave: "M", nombre: "Mostaza", hex: "#c9a227" }, 7), color(ROJO, 7)];
    const r = coloresDeLasPerchas([color(NEGRO, 122), ...chicos], 7, 0.5);
    // 150 prendas: cada chico pesa 0,35 de percha (no gana una), los cuatro juntos 1,4.
    expect(r.filter((c) => c?.clave === "otros").length).toBeGreaterThanOrEqual(1);
    expect(OTROS_COLORES.hex).toBeNull();
  });

  it("un color que no es un color (Estampado, sin hex) nunca tiene percha propia: va a «Otros colores»", () => {
    const r = coloresDeLasPerchas([color(NEGRO, 50), { clave: "EST", nombre: "Estampado", hex: null, prendas: 100 }], 7, 0.5);
    expect(r.some((c) => c?.clave === "EST")).toBe(false);
    expect(r.filter((c) => c?.clave === "otros").length).toBeGreaterThan(0);
  });

  it("un color con al menos media percha tiene SIEMPRE la suya, aunque el redondeo se la quitara", () => {
    // 200 prendas en 8 lugares: dos colores de 90 (3,6 lugares cada uno), un verde de 15 (0,6) y 5 de un estampado. El verde pierde el reparto por resto y la toma de un grande.
    const verde = { clave: "VER", nombre: "Verde", hex: "#2e7d32" };
    const r = coloresDeLasPerchas([color(NEGRO, 90), color(BLANCO, 90), color(verde, 15), { clave: "EST", nombre: "Estampado", hex: null, prendas: 5 }], 7, 0.5);
    expect(r).toHaveLength(8);
    expect(r.filter((c) => c?.clave === "VER")).toHaveLength(1);
  });

  it("la garantía no inventa lugares: con menos lugares que colores, los más abundantes son los que se ven", () => {
    const r = coloresDeLasPerchas([color(NEGRO, 40), color(BLANCO, 30), color(BEIGE, 20), color(ROJO, 10)], 2, 0);
    expect(r).toHaveLength(2);
    expect(r.map((c) => c?.nombre)).toEqual(["Negro", "Blanco"]);
  });

  it("un solo color pinta todas las perchas, también la angosta", () => {
    expect(hexDe(coloresDeLasPerchas([color(NEGRO, 30)], 1, 0.5))).toEqual(["Negro", "Negro"]);
  });

  it("sin colores conocidos, todas quedan en null: se dibujan del color del grupo, como antes", () => {
    expect(coloresDeLasPerchas([], 2, 0.5)).toEqual([null, null, null]);
    expect(coloresDeLasPerchas([color(NEGRO, 0)], 1, 0)).toEqual([null]);
  });

  it("sin perchas no hay nada que pintar, y lo que no es una cuenta no rompe", () => {
    expect(coloresDeLasPerchas([color(NEGRO, 10)], 0, 0)).toEqual([]);
    expect(coloresDeLasPerchas([color(NEGRO, 10)], Number.NaN, Number.NaN)).toEqual([]);
    expect(coloresDeLasPerchas([color(NEGRO, 10)], -3, -1)).toEqual([]);
  });

  it("es estable: la misma mezcla da siempre las mismas perchas, sin azar, y un empate lo decide el nombre", () => {
    const m = [color(NEGRO, 60), color(BLANCO, 45), color(BEIGE, 45)];
    expect(coloresDeLasPerchas(m, 7, 0.5)).toEqual(coloresDeLasPerchas([...m].reverse(), 7, 0.5));
    // Blanco y Beige empatan: Beige va primero (orden alfabético) y se lleva la percha que sobra: 3 negras, 3 beige y 2 blancas.
    expect(hexDe(coloresDeLasPerchas(m, 7, 0.5))).toEqual(["Negro", "Negro", "Negro", "Beige", "Beige", "Beige", "Blanco", "Blanco"]);
  });

  it("una sola percha entera toma el color que cubre su centro (el dominante si pasa de la mitad)", () => {
    expect(hexDe(coloresDeLasPerchas([color(NEGRO, 6), color(BLANCO, 4)], 1, 0))).toEqual(["Negro"]);
    expect(hexDe(coloresDeLasPerchas([color(NEGRO, 4), color(BLANCO, 6)], 1, 0))).toEqual(["Blanco"]);
  });
});

describe("el ícono de un grupo en las fichas: hasta tres prendas, una por color principal", () => {
  it("sin colores conocidos no hay colores: el ícono queda del color del grupo", () => {
    expect(coloresDelIcono([])).toEqual([]);
    expect(coloresDelIcono([{ clave: "EST", nombre: "Estampado", hex: null, prendas: 9 }])).toEqual([]);
  });

  it("un solo color es una sola prenda", () => {
    expect(coloresDelIcono([color(NEGRO, 40)])).toEqual([NEGRO.hex]);
  });

  it("toma los tres colores principales, del que más cuelga al que menos", () => {
    const c = coloresDelIcono([color(BEIGE, 30), color(NEGRO, 60), color(ROJO, 15), color(BLANCO, 45)]);
    expect(c).toHaveLength(MAX_COLORES_DEL_ICONO);
    expect(c).toEqual([NEGRO.hex, BLANCO.hex, BEIGE.hex]);
  });

  it("un color sin hex entre los principales se salta: solo se dibujan colores de verdad, y uno repetido no ocupa dos lugares", () => {
    const c = coloresDelIcono([{ clave: "EST", nombre: "Estampado", hex: null, prendas: 99 }, color(NEGRO, 10), color({ clave: "NEG2", nombre: "Negro mate", hex: NEGRO.hex }, 8), color(BLANCO, 5)]);
    expect(c).toEqual([NEGRO.hex, BLANCO.hex]);
  });

  it("un color sin prendas no cuenta", () => {
    expect(coloresDelIcono([color(NEGRO, 0), color(BLANCO, 3)])).toEqual([BLANCO.hex]);
  });
});

describe("lo que dice el tramo al pasar por él", () => {
  it("nombra los colores con sus prendas y junta el resto", () => {
    const m = [color(NEGRO, 60), color(BLANCO, 45), color(BEIGE, 30), color(ROJO, 10), color({ clave: "V", nombre: "Verde", hex: "#2e7d32" }, 5), color({ clave: "A", nombre: "Azul", hex: "#1d4ed8" }, 2)];
    expect(MAX_COLORES_EN_TEXTO).toBe(4);
    expect(textoDeColores(m)).toBe("Negro 60 · Blanco 45 · Beige 30 · Rojo 10 · otros colores 7");
  });

  it("con pocos colores no inventa «otros colores»", () => {
    expect(textoDeColores([color(NEGRO, 1), color(BLANCO, 1)])).toBe("Negro 1 · Blanco 1");
  });

  it("sin colores, vacío", () => {
    expect(textoDeColores([])).toBe("");
    expect(textoDeColores([color(NEGRO, 0)])).toBe("");
  });
});
