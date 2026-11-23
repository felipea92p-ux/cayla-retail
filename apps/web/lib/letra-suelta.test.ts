import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// El escáner de `pnpm tema:letra` es la ÚNICA definición de «letra suelta» y de la escala: la prueba lo importa en vez de copiarlo.
import { ESCALA, TECHO, clasesArbitrariasDeLaWeb, escalon, escanearLetra, letraDe } from "../tema/letra-suelta.mjs";
import { DEUDA_LETRA_HOY, LETRA_A_MANO, LETRA_FIJA } from "./letra-suelta-archivos";

// REGLA (ADR-0691; Felipe 2026-11-19: «hay cosas con fuente demasiado pequeña y son imposibles de leer»): la letra del ERP sale de UNA
// escala —13 `text-xs` · 14 `text-detalle` · 16 `text-sm` · 18 `text-lg` · 21 `text-xl`— que vive en el `@theme` de `app/globals.css`.
// Ya se había subido el piso desde los tokens el 2026-09-08 y la queja volvió, porque 2.583 tamaños escritos a mano no pasaban por
// ellos. Una letra suelta NUEVA falla aquí y la deuda de antes solo baja.

const cuenta = (texto: string, tipo: "ts" | "css" = "ts") => letraDe(texto, tipo).cuenta;
const sinComentar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("la escala de letra — a qué escalón va cada tamaño", () => {
  it("lo más chico sube al piso y lo demás va al escalón más cercano; en empate, al mayor", () => {
    const a = (px: number) => escalon(px).px;
    expect([8, 9.5, 10, 11, 12, 12.5, 13].map(a)).toEqual([13, 13, 13, 13, 13, 13, 13]);
    expect([13.5, 14, 14.5].map(a)).toEqual([14, 14, 14]);
    expect([15, 15.5, 16].map(a)).toEqual([16, 16, 16]);
    expect([17, 17.5, 18, 19].map(a)).toEqual([18, 18, 18, 18]);
    expect([20, 21, 21.5].map(a)).toEqual([21, 21, 21]);
  });

  it("los tokens de `globals.css` son la escala, escalón por escalón", () => {
    const globals = sinComentar(readFileSync("app/globals.css", "utf8"));
    for (const e of ESCALA) expect(globals, `--text-${e.token} = ${e.px} px`).toMatch(new RegExp(`--text-${e.token}:\\s*${e.px / 16}rem;`));
  });
});

describe("escáner de la letra suelta — qué cuenta y qué no", () => {
  it("cuenta el tamaño arbitrario de una clase, con cualquier variante", () => {
    expect(cuenta('<span className="text-[11px] uppercase" />')).toBe(1);
    expect(cuenta('<span className="text-[10.5px] sm:text-[12.5px] @min-[560px]:text-[15px] !text-[9px]" />')).toBe(4);
    expect(cuenta('<span className="text-[0.7rem]" />')).toBe(1);
  });

  it("cuenta el tamaño de un `style` y el de una hoja de estilos, también en la forma corta", () => {
    expect(cuenta("style={{ fontSize: 11, color: x }}")).toBe(1);
    expect(cuenta('style={{ fontSize: "12.5px" }}')).toBe(1);
    expect(cuenta(".a { font-size: 11px; }", "css")).toBe(1);
    expect(cuenta(".a { font-size: 0.75rem; }", "css")).toBe(1);
    expect(cuenta(".a { font: 600 11px/1 var(--font-sans); }", "css")).toBe(1);
  });

  it("también cuenta un tamaño que coincide con un escalón, si está escrito a mano", () => {
    expect(cuenta('<span className="text-[13px]" />')).toBe(1);
    expect(cuenta(".a { font-size: 14px; }", "css")).toBe(1);
  });

  it("NO cuenta la escala, lo relativo, lo de exhibición ni lo que no es un tamaño", () => {
    expect(cuenta('<span className="text-xs text-detalle text-sm text-lg text-xl sm:text-xs" />')).toBe(0);
    expect(cuenta(".a { font-size: var(--text-xs); } .b { font-size: 0.85em; } .c { font-size: inherit; } .d { font-size: 90%; }", "css")).toBe(0);
    expect(cuenta(`<h1 className="text-[46px]" /> <b className="text-[${TECHO}px]" />`)).toBe(0);
    expect(cuenta(".a { font-size: 28px; }", "css")).toBe(0);
    expect(cuenta('<span className="text-[color:var(--x)] text-[var(--y)] text-tinta" />')).toBe(0);
    expect(cuenta('<text fontSize={10} fontSize="10" />')).toBe(0); // el atributo de un dibujo SVG
  });

  it("ignora lo que está en un comentario", () => {
    expect(cuenta("// antes era text-[11px]\nconst x = 1;")).toBe(0);
    expect(cuenta("/* font-size: 11px */\n.a { color: red; }", "css")).toBe(0);
  });

  it("`letra-fija:` exime esa línea, pero solo con un motivo de verdad", () => {
    expect(cuenta('<span className="text-[8px]" /> {/* letra-fija: el ticket se imprime a 58 mm */}')).toBe(0);
    expect(cuenta(".ini { font-size: 10.5px; } /* letra-fija: iniciales dentro de un círculo de 24 px */", "css")).toBe(0);
    expect(cuenta('<span className="text-[8px]" /> // letra-fija: sí')).toBe(1);
  });
});

describe("el puente: mientras se migra, cada `text-[Npx]` ya se ve en su escalón", () => {
  const puente = sinComentar(readFileSync("app/estilos/letra.css", "utf8"));
  /** Cada bloque del puente: sus clases y el token que les pone. */
  const bloques = [...puente.matchAll(/:where\(([^{}]*?)\)\s*\{\s*font-size:\s*var\(--text-([a-z]+)\);\s*\}/g)].map((m) => ({
    clases: [...m[1].matchAll(/\[class~="([^"]+)"\]/g)].map((c) => c[1]),
    token: m[2],
  }));

  it("la web no usa un tamaño arbitrario con variante: ahí va la utilidad de la escala (`sm:text-xs`)", () => {
    // El puente no puede repetir la condición de cada variante (un ancho, un contenedor): esas se escriben bien de entrada.
    expect(clasesArbitrariasDeLaWeb().filter((c) => c.variante).map((c) => c.clase)).toEqual([]);
  });

  it("cubre cada tamaño arbitrario que usa la web y lo lleva a SU escalón", () => {
    const fuera = clasesArbitrariasDeLaWeb()
      .filter((c) => !c.variante && escalon(c.px).px !== c.px)
      .filter((c) => !bloques.some((b) => b.token === escalon(c.px).token && b.clases.includes(c.clase)))
      .map((c) => `${c.clase} → text-${escalon(c.px).token}`);
    expect(fuera, "Falta en app/estilos/letra.css. Mejor aún: escribe la utilidad de la escala en vez del tamaño a mano.").toEqual([]);
  });

  it("no toca el papel que se imprime ni lo que se marcó como letra fija, y solo vale en pantalla", () => {
    expect(puente).toMatch(/@media screen\s*\{/);
    for (const b of puente.matchAll(/:where\(([^{}]*?)\)\s*\{/g)) {
      expect(b[1]).toContain(".papel-fijo *");
      expect(b[1]).toContain("[data-papel] *");
      expect(b[1]).toContain("[data-letra-fija]");
      expect(b[1]).toContain("svg *");
    }
    expect(bloques.length).toBeGreaterThanOrEqual(4);
  });

  it("se importa en `globals.css`", () => {
    expect(readFileSync("app/globals.css", "utf8")).toContain('@import "./estilos/letra.css"');
  });
});

describe("la letra sale de la escala: cada letra suelta está declarada y la deuda solo baja", () => {
  const real = escanearLetra();

  it("el escáner mira la web de verdad", () => {
    expect(Object.keys(real).length).toBeGreaterThan(0);
    expect(real["app/estilos/letra.css"]).toBeUndefined();
  });

  it("ningún archivo tiene letra suelta sin estar declarado: un archivo nuevo nace con la escala", () => {
    const sinDeclarar = Object.entries(real)
      .filter(([archivo]) => LETRA_A_MANO[archivo] === undefined && LETRA_FIJA[archivo] === undefined)
      .map(([archivo, r]) => `${archivo}: ${r.lineas.slice(0, 3).map((l: { n: number; px: number; a: string }) => `L${l.n} ${l.px} px → text-${l.a}`).join(" | ")}`);
    expect(
      sinDeclarar,
      "La letra sale de la escala (ADR-0691): `text-xs` 13 · `text-detalle` 14 · `text-sm` 16 · `text-lg` 18 · `text-xl` 21; en una hoja de " +
        "estilos, `var(--text-xs)`… Nada por debajo de 13 px. Si de verdad no es letra de la interfaz (papel que se imprime, iniciales en " +
        "un círculo), anótalo con `letra-fija: <por qué>` en un comentario de esa línea.",
    ).toEqual([]);
  });

  it("ningún archivo de la lista tiene MÁS letra suelta que la declarada (si bajó, `pnpm --filter web tema:letra:registro`)", () => {
    const subieron = Object.entries(LETRA_A_MANO)
      .filter(([archivo, declarado]) => real[archivo] && real[archivo].cuenta > declarado)
      .map(([archivo, declarado]) => `${archivo}: declarado ${declarado}, hay ${real[archivo].cuenta}`);
    expect(subieron).toEqual([]);
  });

  it("cada archivo permanente dice su motivo", () => {
    for (const [archivo, motivo] of Object.entries(LETRA_FIJA)) expect(motivo.length, archivo).toBeGreaterThanOrEqual(20);
  });

  it("la deuda de la letra suelta: solo baja (cuenta exacta de lo declarado)", () => {
    // Al migrar un módulo baja este número. Si SUBE, alguien declaró deuda nueva: una pantalla nueva no puede nacer con letra suelta.
    expect(Object.values(LETRA_A_MANO).reduce((s, n) => s + n, 0)).toBe(DEUDA_LETRA_HOY);
    expect(DEUDA_LETRA_HOY).toBeLessThanOrEqual(2583);
  });
});
