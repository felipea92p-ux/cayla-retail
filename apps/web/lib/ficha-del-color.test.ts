import { describe, expect, it } from "vitest";
import { MAX_COMBINA_CON } from "./color-referencias";
import { fichaDelColor, primeraFrase, unidadesPorColor, type ColorConFicha } from "./ficha-del-color";

function color(codigo: string, extra: Partial<ColorConFicha> = {}): ColorConFicha {
  return { codigo, nombre: `Nombre ${codigo}`, hex: "#123456", familiaColor: "neutro", tipo: "solido", ...extra };
}

const VOCABULARIO = new Map<string, ColorConFicha>(
  [
    color("BEI", { nombre: "Beige", descripcion: "Neutro cálido y versátil que transmite calma. Base de los looks de oficina.", combinaCon: ["BLA", "NEG", "AZM", "CHO", "VOL", "TER"] }),
    color("BLA", { nombre: "Blanco" }),
    color("NEG", { nombre: "Negro" }),
    color("AZM", { nombre: "Azul marino" }),
    color("CHO", { nombre: "Chocolate" }),
    color("VOL", { nombre: "Verde oliva" }),
    color("TER", { nombre: "Terracota" }),
    // Sin ficha: creado a mano, sin descripción ni compañeros.
    color("AZA", { nombre: "Azul acero", descripcion: null, combinaCon: [] }),
    // Solo descripción.
    color("PER", { nombre: "Perla", descripcion: "Gris perlado muy claro.", combinaCon: [] }),
  ].map((c) => [c.codigo, c] as const)
);

describe("fichaDelColor", () => {
  it("un color desconocido o sin ficha no dibuja nada", () => {
    expect(fichaDelColor("ZZZ", VOCABULARIO)).toBeNull();
    expect(fichaDelColor(null, VOCABULARIO)).toBeNull();
    expect(fichaDelColor("AZA", VOCABULARIO)).toBeNull();
  });

  it("devuelve la descripción, su primera frase y los compañeros en el orden guardado", () => {
    const f = fichaDelColor("BEI", VOCABULARIO)!;
    expect(f.descripcion).toBe("Neutro cálido y versátil que transmite calma. Base de los looks de oficina.");
    expect(f.primeraFrase).toBe("Neutro cálido y versátil que transmite calma.");
    expect(f.companeros.map((c) => c.nombre)).toEqual(["Blanco", "Negro", "Azul marino", "Chocolate", "Verde oliva", "Terracota"]);
    // Sin stock a la vista, nadie sabe cuántas hay.
    expect(f.companeros.every((c) => c.aqui === null)).toBe(true);
  });

  it("solo descripción también es ficha", () => {
    const f = fichaDelColor("PER", VOCABULARIO)!;
    expect(f.companeros).toEqual([]);
    expect(f.primeraFrase).toBe("Gris perlado muy claro.");
  });

  it("omite el propio color, los repetidos y los que ya no están en el vocabulario (desactivados)", () => {
    const voc = new Map(VOCABULARIO);
    voc.set("BEI", color("BEI", { combinaCon: ["BEI", "BLA", "BLA", "XXX", "NEG"] }));
    expect(fichaDelColor("BEI", voc)!.companeros.map((c) => c.codigo)).toEqual(["BLA", "NEG"]);
  });

  it("nunca pasa del tope de la base", () => {
    const voc = new Map(VOCABULARIO);
    const muchos = Array.from({ length: 12 }, (_, i) => `C${String(i).padStart(2, "0")}`);
    for (const c of muchos) voc.set(c, color(c));
    voc.set("BEI", color("BEI", { combinaCon: muchos }));
    expect(fichaDelColor("BEI", voc)!.companeros).toHaveLength(MAX_COMBINA_CON);
  });

  it("con el stock de la sede, los que cuelgan aquí van primero y cada uno sabe cuántas unidades hay", () => {
    const unidadesAqui = new Map([
      ["AZM", 23],
      ["TER", 3],
      ["BLA", 0],
    ]);
    const f = fichaDelColor("BEI", VOCABULARIO, { unidadesAqui })!;
    expect(f.companeros.map((c) => [c.codigo, c.aqui])).toEqual([
      ["AZM", 23],
      ["TER", 3],
      ["BLA", 0],
      ["NEG", 0],
      ["CHO", 0],
      ["VOL", 0],
    ]);
  });

  it("es estable: la misma entrada da la misma salida", () => {
    const a = JSON.stringify(fichaDelColor("BEI", VOCABULARIO));
    const b = JSON.stringify(fichaDelColor("BEI", VOCABULARIO));
    expect(a).toBe(b);
  });
});

describe("unidadesPorColor", () => {
  it("suma el piso cobrable por color e ignora lo sin color o sin piso", () => {
    const m = unidadesPorColor([
      { colorCodigo: "AZM", stockAqui: 2 },
      { colorCodigo: "AZM", stockAqui: 3 },
      { colorCodigo: "NEG", stockAqui: 0 },
      { colorCodigo: null, stockAqui: 9 },
      { stockAqui: 4 },
    ]);
    expect([...m]).toEqual([["AZM", 5]]);
  });
});

describe("primeraFrase", () => {
  it("corta en el primer punto seguido de espacio y conserva el punto", () => {
    expect(primeraFrase("Una frase. Otra frase.")).toBe("Una frase.");
    expect(primeraFrase("Sin punto seguido")).toBe("Sin punto seguido");
    expect(primeraFrase("Con punto y coma; sigue")).toBe("Con punto y coma;");
    expect(primeraFrase("")).toBeNull();
    expect(primeraFrase(null)).toBeNull();
  });
});

// Caos 2026-10-10 (TEC-01): el Tab no pasaba del primer círculo porque, al perder el foco, el renglón del nombre del compañero se
// vaciaba y React quitaba su nodo de texto justo con el foco en tránsito; la trampa de foco del diálogo (Radix) devuelve el foco al
// contenedor al ver esa mutación y Chrome cancela el salto al siguiente control. El renglón SIEMPRE tiene texto.
describe("el renglón del compañero señalado nunca se vacía", () => {
  it("sin señalado deja un espacio duro, nunca una cadena vacía ni null", async () => {
    const { textoDelSenalado, SIN_SENALADO } = await import("./ficha-del-color");
    expect(textoDelSenalado(null)).toBe(SIN_SENALADO);
    expect(SIN_SENALADO.length).toBeGreaterThan(0);
    expect(SIN_SENALADO.trim()).toBe(""); // no se lee: es un hueco, no un texto
    expect(textoDelSenalado("Negro · hay en el piso")).toBe("Negro · hay en el piso");
  });
  it("el componente pinta ese texto en el renglón, sin un `: null` que quite el nodo", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fuente = readFileSync(join(__dirname, "..", "components", "ui", "FichaDelColor.tsx"), "utf8");
    expect(fuente).toContain("textoDelSenalado(");
    const renglon = fuente.slice(fuente.indexOf('aria-live="polite"'), fuente.indexOf("</span>", fuente.indexOf('aria-live="polite"')));
    // El hijo del renglón es SIEMPRE `textoDelSenalado(…)` (una cadena), nunca una expresión que pueda dar null.
    expect(renglon).toMatch(/>\s*\{textoDelSenalado\(/);
  });
});
