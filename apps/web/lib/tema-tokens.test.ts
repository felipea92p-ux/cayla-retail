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

  it("el oscuro invierte los papeles del claro: el texto es la crema y el fondo ocupa el lugar de la tinta (la idea que hace que 5.600 usos se inviertan solos)", () => {
    expect(oscuro.tinta).toBe(claro.crema); // el texto, la crema
    // El fondo era la tinta de siempre (#1a1a18, la que aprobó Felipe en el Observatorio). Desde el 2026-10-26 (P1 de la familia CAYLA,
    // opción C) es un negro cálido con la MISMA claridad: no se distingue de la tinta por luminancia, solo por el matiz.
    expect(Math.abs(luminancia(oscuro.crema) - luminancia(claro.tinta))).toBeLessThan(0.002);
    expect(oscuro.crema).not.toBe(claro.tinta);
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
    // `taupe-profundo` ya no es un hex: desde ADR-0694 es la tinta al 80 % (lo mide «los tres tonos del texto», al final).
    "tinta", "tinta-60", "taupe", "rojo", "rojo-profundo", "verde", "verde-profundo", "ambar", "ambar-profundo",
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
    for (const c of [...g, oscuro["metodo-efectivo"], oscuro.naranja]) expect(contraste(c, oscuro.papel)).toBeGreaterThanOrEqual(3);
    expect(deltaE(g[0], g[1])).toBeGreaterThanOrEqual(17);
    expect(deltaE(g[0], g[2])).toBeGreaterThanOrEqual(17);
    expect(deltaE(g[1], g[2])).toBeGreaterThanOrEqual(17);
  });

  it("el naranja del tramo donde se pierde la gente (Tráfico, 2026-10-31) se ve como línea y como relleno sobre papel en claro: ≥ 3:1", () => {
    expect(contraste(claro.naranja, claro.papel)).toBeGreaterThanOrEqual(3);
  });

  it("la línea de una tarjeta (sand sobre papel) se ve pero no grita: entre 1.2 y 1.8", () => {
    const c = contraste(oscuro.sand, oscuro.papel);
    expect(c).toBeGreaterThan(1.2);
    expect(c).toBeLessThan(1.8);
  });
});

// El fondo Lienzo (ADR-0706, `.marco-lienzo` en estilos/vidrio/marco.css; antes Seda, ADR-0681). Sobre el fondo va texto directo: la línea
// de sede de la cabecera, una bajada, un enlace rojo. Sus dos tonos (arriba y abajo del degradado) tienen que dejar leer todo color de
// texto, en los dos temas: entre los dos extremos de un degradado no hay nada más oscuro ni más claro que ellos.
describe("el fondo Lienzo: todo color de texto se lee sobre cada uno de sus tonos (≥ 4.5), en claro y en oscuro", () => {
  const marco = leer("app/estilos/vidrio/marco.css");
  const TONOS = ["alto", "bajo"];
  // `taupe-profundo` ya no es un hex (ADR-0694: es la tinta al 80 %); él y los dos tonos del texto se miden abajo, mezclados sobre cada tono.
  const textos = [
    "tinta", "tinta-60", "taupe", "rojo", "rojo-profundo", "verde", "verde-profundo", "ambar", "ambar-profundo",
    "pizarra", "metodo-efectivo-tinta", "metodo-tarjeta", "metodo-yape", "metodo-plin", "metodo-transferencia",
  ];
  /** Cuánta tinta lleva un tono del texto (`secundario`, `tenue`), leído de su token en globals.css. */
  const tintaDe = (token: string) => Number((claro[token] ?? "").match(/var\(--color-tinta\)\s+(\d+(?:\.\d+)?)%/)?.[1] ?? 0) / 100;
  /** Un tono del Lienzo es un token, o la mezcla de dos tokens. Otra forma no se sabe medir: mejor que falle a que pase sin mirar. */
  function resolver(valor: string, paleta: Record<string, string>): string {
    const mix = valor.match(/^color-mix\(in srgb, var\(--color-([a-z0-9-]+)\) (\d+)%, var\(--color-([a-z0-9-]+)\)\)$/);
    if (mix) return mezcla(paleta[mix[1]], paleta[mix[3]], Number(mix[2]) / 100);
    const uno = valor.match(/^var\(--color-([a-z0-9-]+)\)$/);
    if (uno) return paleta[uno[1]];
    throw new Error(`El Lienzo usa un valor que esta prueba no sabe medir: «${valor}»`);
  }
  function tonos(cabecera: string, paleta: Record<string, string>): [string, string][] {
    const cuerpo = cuerpoDe(marco, cabecera);
    return TONOS.map((t) => {
      const m = cuerpo.match(new RegExp(`--lienzo-${t}:\\s*([^;]+);`));
      if (!m) throw new Error(`«${cabecera}» no declara --lienzo-${t}`);
      return [t, resolver(m[1].trim(), paleta)];
    });
  }
  const temas: [string, Record<string, string>, [string, string][]][] = [
    ["claro", claro, tonos(".marco-lienzo {", claro)],
    ["oscuro", oscuro, tonos(':root[data-tema="oscuro"] .marco-lienzo {', oscuro)],
  ];

  for (const [nombre, paleta, lista] of temas) {
    it(`${nombre}: los dos tonos se resuelven a un color`, () => {
      expect(lista.map(([, hex]) => esHex(hex))).toEqual([true, true]);
    });
    for (const [tono, hex] of lista) {
      it(`${nombre}: todo texto sobre el tono ${tono} del Lienzo`, () => {
        for (const t of textos) expect(contraste(paleta[t], hex), `${t} sobre ${tono} (${hex})`).toBeGreaterThanOrEqual(4.5);
        for (const t of ["secundario", "tenue"]) {
          expect(tintaDe(t), `no pude leer cuánta tinta lleva «${t}»`).toBeGreaterThan(0);
          expect(contraste(mezcla(paleta.tinta, hex, tintaDe(t)), hex), `${t} sobre ${tono} (${hex})`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it("no dibuja formas: un solo degradado recto, sin curvas ni imágenes (ADR-0706: detrás del vidrio se veían como manchas)", () => {
    const cuerpo = cuerpoDe(marco, ".marco-lienzo {");
    expect(cuerpo).toMatch(/background:\s*linear-gradient\(180deg, var\(--lienzo-alto\), var\(--lienzo-bajo\)\);/);
    expect(cuerpo).not.toMatch(/radial-gradient|conic-gradient|url\(/);
  });

  it("no lleva `filter`: (ADR-0623, lo que está fijo detrás de todo no se desenfoca)", () => {
    expect(cuerpoDe(marco, ".marco-lienzo {")).not.toMatch(/(^|[;\s])filter\s*:/);
  });
});

// P2 de la familia CAYLA (2026-10-26, Felipe eligió la opción C): el borde de lo que se toca o se escribe tiene que identificar al control
// (WCAG 1.4.11: 3:1 contra lo que lo rodea), y la línea decorativa (`sand`) no. Se mide sobre las tres superficies donde vive un campo, en los dos temas.
describe("el borde de un control (`borde-control`): 3:1 sobre crema, papel y hueso, en claro y en oscuro", () => {
  for (const [nombre, t] of [["claro", claro], ["oscuro", oscuro]] as const) {
    for (const s of ["crema", "papel", "hueso"] as const) {
      it(`${nombre}: borde-control sobre ${s}: ≥ 3`, () => {
        expect(contraste(t["borde-control"], t[s])).toBeGreaterThanOrEqual(3);
      });
    }
    it(`${nombre}: la línea decorativa (sand) NO identifica un control: < 3 sobre papel, y borde-control es otro color`, () => {
      expect(contraste(t.sand, t.papel)).toBeLessThan(3);
      expect(t["borde-control"]).not.toBe(t.sand);
    });
  }
});

describe("texto hecho de tinta en los CSS: por debajo del 64 % dice qué es y sobre qué fondo vive, y se mide", () => {
  // Nació el 2026-10-14: la nota de <TituloGrupo> y otros 18 textos escritos a mano en un CSS (`color: color-mix(in srgb,
  // var(--color-tinta) N%, transparent)`) no llegaban al mínimo y nada los medía, porque el piso del texto tenue de `tema.css` solo sube
  // las clases de Tailwind (`text-tinta/45`). Desde el 64 % un texto de tinta pasa 4.5:1 sobre crema, papel, hueso y sand en los dos temas.
  // Por debajo, la línea lleva su etiqueta y aquí se mide sobre cada fondo que nombra, en claro y en oscuro:
  //   /* contraste: texto sobre papel, crema */            → 4.5:1
  //   /* contraste: texto grande sobre hueso */            → 3:1 (24 px, o 18.7 px en negrita)
  //   /* contraste: gráfico sobre hueso, papel */          → 3:1 (un ícono o una flecha, WCAG 1.4.11)
  //   /* contraste: no aplica — <por qué, en 10 letras o más> */   (deshabilitado, adorno, sin uso, transitorio)
  // Vale igual para una variable (`--vr-t45: color-mix(…)`, las escalas propias de Vista rápida, Historial, Observatorio…), y una línea que
  // vive en un bloque `[data-tema="oscuro"]` se mide solo en oscuro. `tema.css` queda fuera: son los dos pisos, que se miden abajo. El
  // navegador compone la mezcla en sRGB y redondea a 8 bits, como `mezcla`.
  const raiz = join(__dirname, "..");
  const hojas: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (e.name.endsWith(".css") && !ruta.endsWith(join("estilos", "tema.css"))) hojas.push(ruta);
    }
  };
  recorrer(join(raiz, "app"));

  // `color: …` o una variable `--nombre: …` hecha de tinta y transparente.
  const TINTA = /(?:(?<![\w-])color|(?<![\w-])--[\w-]+):\s*color-mix\(in (?:srgb|oklab),\s*var\(--color-tinta\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g;
  const lineas: { donde: string; p: number; etiqueta: string | null; temas: ("claro" | "oscuro")[] }[] = [];
  for (const hoja of hojas) {
    const css = readFileSync(hoja, "utf8");
    // Los comentarios se borran con espacios (mismo largo): así el selector de cada regla se busca sin que un «{» de un comentario engañe.
    const limpio = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    for (const m of limpio.matchAll(TINTA)) {
      const i = m.index ?? 0;
      const p = Number(m[1]);
      if (p >= 64) continue;
      const fin = css.indexOf("\n", i);
      const linea = css.slice(css.lastIndexOf("\n", i) + 1, fin < 0 ? undefined : fin);
      const etiqueta = linea.match(/\/\*\s*contraste:\s*([\s\S]+?)\s*\*\//)?.[1] ?? null;
      const llave = limpio.lastIndexOf("{", i);
      const selector = limpio.slice(Math.max(limpio.lastIndexOf("}", llave), limpio.lastIndexOf("{", llave - 1), limpio.lastIndexOf(";", llave)) + 1, llave);
      const temas: ("claro" | "oscuro")[] = /data-tema=["']oscuro["']/.test(selector) ? ["oscuro"] : ["claro", "oscuro"];
      lineas.push({ donde: `${hoja.slice(raiz.length + 1)}:${css.slice(0, i).split("\n").length}`, p, etiqueta, temas });
    }
  }

  it("encuentra las líneas que mide (si cambia cómo se escriben, esta prueba tiene que seguirlo)", () => {
    expect(lineas.length).toBeGreaterThan(0);
  });

  it("desde el 64 % la tinta pasa 4.5:1 sobre crema, papel, hueso y sand en los dos temas (por eso ahí no pide etiqueta)", () => {
    for (const [tema, t] of [["claro", claro], ["oscuro", oscuro]] as const) {
      for (const f of ["crema", "papel", "hueso", "sand"]) expect(contraste(mezcla(t.tinta, t[f], 0.64), t[f]), `${tema}, sobre ${f}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("toda línea por debajo del 64 % lleva su etiqueta `/* contraste: … */` en la misma línea", () => {
    const sinEtiqueta = lineas.filter((l) => !l.etiqueta).map((l) => `${l.donde} (tinta al ${l.p} %)`);
    expect(sinEtiqueta, "ponle /* contraste: texto sobre <fondos> */ (o «texto grande …», «gráfico …», «no aplica — <motivo>») o sube el tono").toEqual([]);
  });

  const UMBRAL = { texto: 4.5, "texto grande": 3, gráfico: 3 } as const;
  const FONDOS = ["crema", "papel", "hueso", "sand"];
  for (const l of lineas.filter((x) => x.etiqueta !== null)) {
    it(`${l.donde} · tinta al ${l.p} %${l.temas.length === 1 ? " (solo oscuro)" : ""} · ${l.etiqueta}`, () => {
      const e = l.etiqueta ?? "";
      if (e.startsWith("no aplica")) {
        expect(e.replace(/^no aplica\s*[—–-]?\s*/, "").length, "el motivo de «no aplica»").toBeGreaterThanOrEqual(10);
        return;
      }
      const m = e.match(/^(texto grande|texto|gráfico) sobre (.+)$/);
      expect(m, `etiqueta que no se entiende: «${e}»`).not.toBeNull();
      const umbral = UMBRAL[(m?.[1] ?? "texto") as keyof typeof UMBRAL];
      const fondos = (m?.[2] ?? "").split(/\s*,\s*/);
      for (const f of fondos) expect(FONDOS, `fondo «${f}»`).toContain(f);
      for (const tema of l.temas) {
        const t = tema === "claro" ? claro : oscuro;
        for (const f of fondos) expect(contraste(mezcla(t.tinta, t[f], l.p / 100), t[f]), `${tema}, sobre ${f}`).toBeGreaterThanOrEqual(umbral);
      }
    });
  }
});

describe("los tres tonos del texto (ADR-0694) se leen y alcanzan a todas las clases de antes", () => {
  // Felipe eligió mirando la «B · Tinta en tres tonos» (2026-11-23): el dato en `tinta`, lo que acompaña en `secundario` y lo más tenue en
  // `tenue`, en los dos temas, y el café fuera del texto. `estilos/tema.css` traduce en un solo lugar las 13 opacidades de antes
  // (`text-tinta/35` … `/85`) y el café (`text-taupe`): si una regla pierde una clase o el porcentaje baja, cientos de textos vuelven a su
  // tono de antes sin que ninguna otra prueba lo note.
  const FONDOS = ["crema", "papel", "hueso", "sand"];
  const pct = (token: string) => {
    const m = (claro[token] ?? "").match(/^color-mix\(in oklab,\s*var\(--color-tinta\)\s+(\d+(?:\.\d+)?)%,\s*(transparent|var\(--color-crema\))\)$/);
    return m ? Number(m[1]) : null;
  };
  const regla = (token: string) => {
    const m = tema.match(new RegExp(`((?::where\\(:root\\) [^,{]+,\\s*)*:where\\(:root\\) [^,{]+)\\{\\s*color:\\s*var\\(--color-${token}\\);`));
    return m ? m[1] : null;
  };

  it("`secundario` y `tenue` son la tinta al 80 % y al 64 %, y `taupe-profundo` vale lo mismo que `secundario`", () => {
    expect(pct("secundario")).toBe(80);
    expect(pct("tenue")).toBe(64);
    expect(pct("taupe-profundo")).toBe(80);
  });

  it("en los dos temas, `secundario` y `tenue` pasan 4.5:1 sobre crema, papel, hueso y arena", () => {
    for (const [nombre, t] of [["claro", claro], ["oscuro", oscuro]] as const) {
      for (const token of ["secundario", "tenue"]) {
        for (const f of FONDOS) {
          expect(contraste(mezcla(t.tinta, t[f], (pct(token) ?? 0) / 100), t[f]), `${token} en ${nombre}, sobre ${f}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("`text-tinta/35` a `/65` y su marcador (`/35` a `/60`) pasan a `tenue`", () => {
    const sel = regla("tenue");
    expect(sel, "no encontré la regla de `tenue` en tema.css").not.toBeNull();
    for (const n of [35, 40, 45, 50, 55, 60, 65]) expect(sel).toContain(`.text-tinta\\/${n}`);
    for (const n of [35, 40, 45, 50, 55, 60]) expect(sel).toContain(`.placeholder\\:text-tinta\\/${n}::placeholder`);
  });

  it("`text-tinta/70` a `/85`, `text-taupe` y `text-taupe/50` a `/80` pasan a `secundario`", () => {
    const sel = regla("secundario");
    expect(sel, "no encontré la regla de `secundario` en tema.css").not.toBeNull();
    for (const n of [70, 75, 80, 85]) expect(sel).toContain(`.text-tinta\\/${n}`);
    expect(sel).toMatch(/\.text-taupe(,|\s|$)/);
    for (const n of [50, 60, 70, 80]) expect(sel).toContain(`.text-taupe\\/${n}`);
  });

  it("los fantasmas (`/25`, `/30`) no se tocan", () => {
    for (const token of ["secundario", "tenue"]) for (const n of [25, 30]) expect(regla(token)).not.toContain(`.text-tinta\\/${n},`);
  });
});
