import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del modo oscuro (ADR-0336). Los tokens de color viven en TRES lugares que tienen que decir lo mismo:
//   · el `@theme` de globals.css (el claro, la fuente),
//   · el bloque `:root[data-tema="oscuro"]` de estilos/tema.css (el oscuro),
//   · `.papel-fijo` de estilos/tema.css (el claro otra vez, para el papel físico).
// Sin este test, agregar un token a uno y olvidarlo en otro se ve solo en una pantalla concreta, de noche, meses después.
// Además mide el contraste (WCAG 2.1) de cada texto sobre cada superficie oscura: el número vive aquí, no en un ADR.

const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const globals = leer("app/globals.css");
const tema = leer("app/estilos/tema.css");

/** El texto entre las llaves del bloque que empieza con `cabecera` (sin llaves anidadas: un bloque de declaraciones). */
function cuerpoDe(css: string, cabecera: string): string {
  const i = css.indexOf(cabecera);
  if (i < 0) throw new Error(`no encontré «${cabecera}»`);
  const ini = css.indexOf("{", i);
  return css.slice(ini + 1, css.indexOf("}", ini));
}

/** Todas las declaraciones `--color-*` de un texto, como nombre → valor. */
function colores(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const m of texto.matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;]+);/g)) salida[m[1]] = m[2].trim();
  return salida;
}

// Todos los bloques `@theme` de globals.css (hay tres: la paleta, el puente shadcn y el movimiento).
function bloquesTheme(css: string): string[] {
  const bloques: string[] = [];
  let desde = 0;
  for (;;) {
    const i = css.indexOf("@theme", desde);
    if (i < 0) return bloques;
    const ini = css.indexOf("{", i);
    let hondo = 1;
    let j = ini + 1;
    while (hondo > 0 && j < css.length) {
      if (css[j] === "{") hondo++;
      else if (css[j] === "}") hondo--;
      j++;
    }
    bloques.push(css.slice(ini + 1, j - 1));
    desde = j;
  }
}

const claro = colores(bloquesTheme(globals).join("\n"));
const oscuro = colores(cuerpoDe(tema, ':root[data-tema="oscuro"]'));
// Los tokens FIJOS valen lo mismo en los dos temas (para texto sobre un color de dato): no se redefinen en el bloque oscuro.
const FIJOS = ["tinta-fija", "crema-fija"];
const fijo = colores(cuerpoDe(tema, ".papel-fijo"));

const esHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
const hexClaros = Object.entries(claro).filter(([, v]) => esHex(v)).map(([n]) => n).filter((n) => !FIJOS.includes(n));

describe("tokens de color: claro, oscuro y papel fijo dicen lo mismo", () => {
  it("el detector sí encuentra tokens (que no pase en vacío por estar mal escrito)", () => {
    expect(hexClaros.length).toBeGreaterThan(20);
    expect(Object.keys(oscuro).length).toBeGreaterThan(20);
    expect(Object.keys(fijo).length).toBeGreaterThan(40);
  });

  it("todo token de color con valor propio tiene su versión oscura, y el oscuro no inventa nombres", () => {
    expect(Object.keys(oscuro).sort()).toEqual([...hexClaros].sort());
  });

  it("los valores oscuros son hex literales (nada de alias: un alias se resuelve en la raíz)", () => {
    for (const [n, v] of Object.entries(oscuro)) expect(esHex(v), `--color-${n}: ${v}`).toBe(true);
  });

  it("`.papel-fijo` re-declara TODOS los colores del claro —alias del puente incluidos— con el mismo valor", () => {
    expect(fijo).toEqual(claro);
  });

  it("los tokens fijos existen, valen la tinta y la crema DEL CLARO y NO se redefinen en oscuro", () => {
    expect(claro["tinta-fija"]).toBe(claro.tinta);
    expect(claro["crema-fija"]).toBe(claro.crema);
    for (const n of FIJOS) expect(oscuro[n], `--color-${n} no va en el bloque oscuro`).toBeUndefined();
  });

  it("el oscuro es el claro con `tinta` y `crema` intercambiadas (la idea que hace que 5.600 usos se inviertan solos)", () => {
    expect(oscuro.crema).toBe(claro.tinta); // el fondo es la tinta de siempre: #1a1a18, la que aprobó Felipe en el Observatorio
    expect(oscuro.tinta).toBe(claro.crema); // y el texto, la crema
  });

  it("las superficies oscuras suben en orden: crema < papel < hueso < sand (elevado = más claro)", () => {
    const l = (h: string) => luminancia(h);
    expect(l(oscuro.crema)).toBeLessThan(l(oscuro.papel));
    expect(l(oscuro.papel)).toBeLessThan(l(oscuro.hueso));
    expect(l(oscuro.hueso)).toBeLessThan(l(oscuro.sand));
  });
});

describe("tokens de brillo y variante dark", () => {
  // Tokens que no son `--color-*` pero cambian por tema: llevan alfa propia (un filo blanco al 95 % sería un neón en oscuro).
  const OTROS = ["brillo-superior", "luz-especular"];
  const otros = (texto: string) => Object.fromEntries(OTROS.map((n) => [n, new RegExp(`--${n}\\s*:\\s*([^;]+);`).exec(texto)?.[1]?.trim()]));

  it("cada uno existe en el claro y en el oscuro, y no son iguales", () => {
    const l = otros(bloquesTheme(globals).join("\n"));
    const o = otros(cuerpoDe(tema, ':root[data-tema="oscuro"]'));
    for (const n of OTROS) {
      expect(l[n], `claro --${n}`).toBeTruthy();
      expect(o[n], `oscuro --${n}`).toBeTruthy();
      expect(o[n]).not.toBe(l[n]);
    }
  });

  it("`dark:` de Tailwind sigue al atributo del botón, no al modo del sistema operativo", () => {
    expect(globals).toMatch(/@custom-variant dark \(&:where\(\[data-tema="oscuro"\], \[data-tema="oscuro"\] \*\)\);/);
  });

  it("el custom-variant va después de todos los @import (un @import tardío se ignora)", () => {
    const iVariante = globals.indexOf("@custom-variant");
    const ultimoImport = globals.lastIndexOf("@import");
    expect(iVariante).toBeGreaterThan(ultimoImport);
  });
});

describe("los tokens existen en ejecución", () => {
  it("la paleta es `@theme static`: Tailwind v4 NO emite un token que solo se usa desde TSX (la variable no existía y el texto caía al color heredado)", () => {
    const sinComentarios = readFileSync(join(__dirname, "../app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sinComentarios).toMatch(/@theme static\s*\{\s*--color-rojo:/);
  });

  // Recorre `app`, `components` y `lib` (sin pruebas) y junta cada `var(--color-NOMBRE)` que el código usa.
  function referencias(): Map<string, string[]> {
    const raiz = join(__dirname, "..");
    const salida = new Map<string, string[]>();
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && !e.name.startsWith(".")) recorrer(ruta);
        } else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const texto = readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
          for (const m of texto.matchAll(/var\(\s*--color-([a-z0-9-]*)/g)) salida.set(m[1], [...(salida.get(m[1]) ?? []), ruta.slice(raiz.length + 1)]);
        }
      }
    };
    for (const c of ["app", "components", "lib"]) recorrer(join(raiz, c));
    return salida;
  }

  it("todo `var(--color-…)` que usa el código es un token que existe (un nombre mal escrito no avisa de nada: simplemente no pinta)", () => {
    const definidos = new Set(Object.keys(claro));
    const inexistentes: string[] = [];
    for (const [nombre, archivos] of referencias()) {
      // Un nombre armado con plantilla (`var(--color-metodo-${m})`) llega como prefijo con guion final: basta que algún token lo empiece.
      const existe = nombre.endsWith("-") || nombre === "" ? [...definidos].some((d) => d.startsWith(nombre)) : definidos.has(nombre);
      if (!existe) inexistentes.push(`--color-${nombre}  ←  ${[...new Set(archivos)].slice(0, 3).join(", ")}`);
    }
    expect(inexistentes).toEqual([]);
  });
});

// ---------- Contraste (WCAG 2.1) ----------
function canal(c: number) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function luminancia(h: string) {
  const [r, g, b] = rgb(h).map(canal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function mezcla(frente: string, fondo: string, alfa: number) {
  const f = rgb(frente);
  const g = rgb(fondo);
  return "#" + f.map((c, i) => Math.round(c * alfa + g[i] * (1 - alfa)).toString(16).padStart(2, "0")).join("");
}
function lab(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map(canal);
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

describe("modo oscuro: contraste medido", () => {
  const superficies = ["crema", "papel", "hueso"] as const;
  // Los colores que se usan como TEXTO. Sobre `sand` (cabecera de tabla, hover) solo se leen tinta y taupe; el rojo, el plomo y
  // el azul sobre sand quedan en 4.0–4.4, el mismo caso raro que ya tiene el claro (rojo sobre sand: 4.18).
  const textos = [
    "tinta", "tinta-60", "taupe", "taupe-profundo", "rojo", "rojo-profundo", "verde", "verde-profundo", "ambar", "ambar-profundo",
    "pizarra", "metodo-efectivo-tinta", "metodo-tarjeta", "metodo-yape", "metodo-plin", "metodo-transferencia",
  ];

  for (const t of textos) {
    for (const s of superficies) {
      it(`${t} sobre ${s}: ≥ 4.5`, () => {
        expect(contraste(oscuro[t], oscuro[s])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("el texto de un chip sobre su propio tinte (12 % sobre papel): ≥ 4.5", () => {
    const sobreTinte = ["rojo", "rojo-profundo", "verde", "verde-profundo", "ambar", "ambar-profundo", "pizarra", "taupe", "metodo-efectivo-tinta"];
    for (const t of sobreTinte) {
      const fondo = mezcla(oscuro[t], oscuro.papel, 0.12);
      expect(contraste(oscuro[t], fondo), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("tinta y taupe se leen sobre sand (cabecera de tabla): ≥ 4.5", () => {
    expect(contraste(oscuro.tinta, oscuro.sand)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(oscuro.taupe, oscuro.sand)).toBeGreaterThanOrEqual(4.5);
  });

  it("botón primario (fondo tinta, texto crema) y acento (fondo rojo, texto crema): ≥ 4.5", () => {
    expect(contraste(oscuro.tinta, oscuro.crema)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(oscuro.rojo, oscuro.crema)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(oscuro["rojo-profundo"], oscuro.crema)).toBeGreaterThanOrEqual(4.5);
  });

  it("las marcas de gráfico (relleno) se ven sobre papel (≥ 3:1) y no se confunden entre sí (ΔE ≥ 17)", () => {
    const g = [oscuro["grafico-alza"], oscuro["grafico-neutro"], oscuro["grafico-baja"]];
    for (const c of [...g, oscuro["metodo-efectivo"]]) expect(contraste(c, oscuro.papel)).toBeGreaterThanOrEqual(3);
    expect(deltaE(g[0], g[1])).toBeGreaterThanOrEqual(17);
    expect(deltaE(g[0], g[2])).toBeGreaterThanOrEqual(17);
    expect(deltaE(g[1], g[2])).toBeGreaterThanOrEqual(17);
  });

  it("la línea de una tarjeta (sand sobre papel) se ve pero no grita: entre 1.2 y 1.8", () => {
    const c = contraste(oscuro.sand, oscuro.papel);
    expect(c).toBeGreaterThan(1.2);
    expect(c).toBeLessThan(1.8);
  });
});
