import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// El escáner de `pnpm tema:esquinas` es la ÚNICA definición de «esquina suelta» y de la escala: la prueba lo importa en vez de copiarlo.
import { ESCALA, PILDORA, PISO, escalon, escanearEsquinas, esquinasDe } from "../tema/esquina-suelta.mjs";
import { DEUDA_ESQUINA_HOY, ESQUINA_A_MANO, ESQUINA_FIJA } from "./esquina-suelta-archivos";

// REGLA (ADR-0698; Felipe 2026-11-19, al ver la lámina de las ocho mejoras: «cuatro radios, y concéntricas»): las esquinas del ERP salen de
// UNA escala —6 `rounded-sm` · 10 `rounded-md` · 14 `rounded-campo` · 22 `rounded-tarjeta` en una pantalla; 28 y 32 para el cajón y la
// hoja, que flotan— que vive en el `@theme` de `app/globals.css`. El 2026-11-23 se pintaban 20 medidas distintas (hasta 12 en una sola
// pantalla) porque 659 esquinas estaban escritas a mano. Una esquina suelta NUEVA falla aquí y la deuda de antes solo baja.

const cuenta = (texto: string, tipo: "ts" | "css" = "ts") => esquinasDe(texto, tipo).cuenta;
const sinComentar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const globals = sinComentar(readFileSync("app/globals.css", "utf8"));
const px = (token: string) => Number(new RegExp(`--radius-${token}:\\s*(\\d+)px;`).exec(globals)?.[1]);

describe("la escala de esquinas — a qué escalón va cada radio", () => {
  it("va al escalón más cercano y, en empate, al mayor", () => {
    const a = (n: number) => escalon(n).px;
    expect([4, 5, 6, 7].map(a)).toEqual([6, 6, 6, 6]);
    expect([8, 9, 10, 11].map(a)).toEqual([10, 10, 10, 10]);
    expect([12, 13, 14, 16, 17].map(a)).toEqual([14, 14, 14, 14, 14]);
    expect([18, 20, 22, 24].map(a)).toEqual([22, 22, 22, 22]);
    expect([26, 28].map(a)).toEqual([28, 28]);
    expect([30, 32, 34].map(a)).toEqual([32, 32, 32]);
  });

  it("los tokens de `globals.css` son la escala, escalón por escalón", () => {
    for (const e of ESCALA) expect(px(e.token), `--radius-${e.token}`).toBe(e.px);
  });

  it("los otros nombres de Tailwind apuntan a la escala: no hay un quinto radio escondido", () => {
    expect(globals).toMatch(/--radius-lg:\s*var\(--radius-md\);/);
    expect(globals).toMatch(/--radius-xl:\s*var\(--radius-campo\);/);
    expect(globals).toMatch(/--radius-2xl:\s*var\(--radius-tarjeta\);/);
  });

  it("en una pantalla hay cuatro, y cada uno es otro menos 4 u 8 px: por eso lo de adentro cae solo en la escala", () => {
    const pantalla: number[] = ESCALA.filter((e) => !e.flota).map((e) => e.px);
    expect(pantalla).toHaveLength(4);
    // Con el espacio en múltiplos de 4, «adentro = afuera − separación» da otro escalón: 22 − 8 = 14, 22 − 12 = 10, 14 − 4 = 10, 14 − 8 = 6…
    for (const afuera of pantalla.slice(1)) {
      const adentro = [4, 8, 12, 16].map((separa) => afuera - separa).filter((r) => r >= pantalla[0]);
      expect(adentro.some((r) => pantalla.includes(r)), `desde ${afuera} px`).toBe(true);
    }
    expect(pantalla.slice(1).every((r, i) => [4, 8].includes(r - pantalla[i]))).toBe(true);
  });

  it("los cuatro grandes son los del contrato de familia con Dynamic", () => {
    const contrato = JSON.parse(readFileSync("../../docs/familia/contrato.json", "utf8")) as { marca: { radios: { funcion: string; px: number }[] } };
    for (const funcion of ["campo", "tarjeta", "cajon", "hoja"]) {
      expect(ESCALA.find((e) => e.token === funcion)?.px, funcion).toBe(contrato.marca.radios.find((r) => r.funcion === funcion)?.px);
    }
  });
});

describe("escáner de la esquina suelta — qué cuenta y qué no", () => {
  it("cuenta el radio arbitrario de una clase, con cualquier variante y cualquier lado", () => {
    expect(cuenta('<span className="rounded-[9px] border" />')).toBe(1);
    expect(cuenta('<span className="sm:rounded-t-[12px] hover:rounded-bl-[0.6rem] !rounded-[11px]" />')).toBe(3);
  });

  it("cuenta `rounded` a secas (4 px fijos) y los nombres de Tailwind de 24 px o más", () => {
    expect(cuenta('<kbd className="rounded border border-sand px-1.5" />')).toBe(1);
    expect(cuenta('<div className="rounded-3xl" /> <div className="lg:rounded-4xl" />')).toBe(2);
  });

  it("cuenta el radio de un `style` y el de una hoja de estilos; una declaración con varios valores cuenta una vez", () => {
    expect(cuenta("style={{ borderRadius: 20, color: x }}")).toBe(1);
    expect(cuenta('style={{ borderRadius: "9px" }}')).toBe(1);
    expect(cuenta(".a { border-radius: 9px; }", "css")).toBe(1);
    expect(cuenta(".a { border-radius: 0.75rem; }", "css")).toBe(1);
    expect(cuenta(".a { border-radius: 0 0 12px 12px; }", "css")).toBe(1);
    expect(cuenta(".a { border-top-left-radius: 18px; border-end-end-radius: 18px; }", "css")).toBe(2);
  });

  it("también cuenta un radio que coincide con un escalón, si está escrito a mano", () => {
    expect(cuenta('<span className="rounded-[14px]" />')).toBe(1);
    expect(cuenta(".a { border-radius: 22px; }", "css")).toBe(1);
  });

  it("NO cuenta la escala, lo que apunta a ella ni lo concéntrico", () => {
    expect(cuenta('<i className="rounded-sm rounded-md rounded-campo rounded-tarjeta rounded-t-cajon rounded-hoja sm:rounded-md" />')).toBe(0);
    expect(cuenta('<i className="rounded-lg rounded-xl rounded-2xl" />')).toBe(0);
    expect(cuenta('<i className="rounded-[calc(var(--radius-tarjeta)-12px)] rounded-[inherit] rounded-[var(--radius-campo)]" />')).toBe(0);
    expect(cuenta(".a { border-radius: var(--radius-campo); } .b { border-radius: calc(var(--radius-tarjeta) - 9px); } .c { border-radius: inherit; }", "css")).toBe(0);
    expect(cuenta('style={{ borderRadius: "var(--radius-md)" }}')).toBe(0);
  });

  it("NO cuenta la píldora, el círculo, lo recto ni el remate de un trazo", () => {
    expect(cuenta('<i className="rounded-full rounded-none rounded-[3px] rounded-b-[2px]" />')).toBe(0);
    expect(cuenta(`.a { border-radius: 999px; } .b { border-radius: 50%; } .c { border-radius: 0; } .d { border-radius: ${PILDORA}px; } .e { border-radius: 2px 2px 0 0; }`, "css")).toBe(0);
    expect(cuenta(`.a { border-radius: ${PISO - 1}px; }`, "css")).toBe(0);
    expect(cuenta(`.a { border-radius: ${PISO}px; }`, "css")).toBe(1);
    expect(cuenta('<img className="rounded-[1mm]" />')).toBe(0); // el papel se mide en milímetros
  });

  it("ignora lo que está en un comentario", () => {
    expect(cuenta("// antes era rounded-[9px]\nconst x = 1;")).toBe(0);
    expect(cuenta("/* border-radius: 9px */\n.a { color: red; }", "css")).toBe(0);
  });

  it("`esquina-fija:` exime esa línea, pero solo con un motivo de verdad", () => {
    expect(cuenta('<span className="rounded-[9px]" /> {/* esquina-fija: la forma del talón, que no es un rectángulo */}')).toBe(0);
    expect(cuenta(".h { border-radius: 26px 26px 0 0; } /* esquina-fija: en el celular lo que flota va a 26 px */", "css")).toBe(0);
    expect(cuenta('<span className="rounded-[9px]" /> // esquina-fija: sí')).toBe(1);
  });
});

describe("las esquinas salen de la escala: cada esquina suelta está declarada y la deuda solo baja", () => {
  const real = escanearEsquinas();

  it("el escáner mira la web de verdad", () => {
    expect(Object.keys(real).length).toBeGreaterThan(0);
    expect(real["lib/esquina-suelta-archivos.ts"]).toBeUndefined();
  });

  it("ningún archivo tiene una esquina suelta sin estar declarado: un archivo nuevo nace con la escala", () => {
    const sinDeclarar = Object.entries(real)
      .filter(([archivo]) => ESQUINA_A_MANO[archivo] === undefined && ESQUINA_FIJA[archivo] === undefined)
      .map(([archivo, r]) => `${archivo}: ${r.lineas.slice(0, 3).map((l: { n: number; px: number; a: string }) => `L${l.n} ${l.px} px → rounded-${l.a}`).join(" | ")}`);
    expect(
      sinDeclarar,
      "Las esquinas salen de la escala (ADR-0698): `rounded-sm` 6 · `rounded-md` 10 · `rounded-campo` 14 · `rounded-tarjeta` 22; en una hoja " +
        "de estilos, `var(--radius-sm)`… Una pieza pegada al borde de otra: `calc(var(--radius-tarjeta) - <separación>)`. Si de verdad no es " +
        "una esquina de la interfaz (un papel, un dibujo), anótalo con `esquina-fija: <por qué>` en un comentario de esa línea.",
    ).toEqual([]);
  });

  it("ningún archivo de la lista tiene MÁS esquinas sueltas que las declaradas (si bajó, `pnpm --filter web tema:esquinas:registro`)", () => {
    const subieron = Object.entries(ESQUINA_A_MANO)
      .filter(([archivo, declarado]) => real[archivo] && real[archivo].cuenta > declarado)
      .map(([archivo, declarado]) => `${archivo}: declarado ${declarado}, hay ${real[archivo].cuenta}`);
    expect(subieron).toEqual([]);
  });

  it("cada archivo permanente dice su motivo", () => {
    for (const [archivo, motivo] of Object.entries(ESQUINA_FIJA)) expect(motivo.length, archivo).toBeGreaterThanOrEqual(20);
  });

  it("la deuda de las esquinas sueltas: solo baja (cuenta exacta de lo declarado)", () => {
    // Al llevar una pieza a la escala baja este número. Si SUBE, alguien declaró deuda nueva: una pantalla nueva no puede nacer con una esquina suelta.
    expect(Object.values(ESQUINA_A_MANO).reduce((s, n) => s + n, 0)).toBe(DEUDA_ESQUINA_HOY);
    expect(DEUDA_ESQUINA_HOY).toBeLessThanOrEqual(434);
  });
});
