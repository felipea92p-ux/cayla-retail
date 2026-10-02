// El dibujo que el sistema propone para un tejido o un patrón a partir de una frase corta (ADR-0256, «Actualización:
// dibujo generado»). Lógica pura, sin IA ni red: lee la frase con palabras clave y arma un dibujo con los colores REALES
// del catálogo (`colores.hex`, con sus sinónimos). «Rayas azul marino finas sobre crudo» → rayas finas con el hex de
// Azul marino sobre el de Crudo.
//
// POR QUÉ SIN IA (Felipe, 2026-09-28): una muestra de tela es geometría que se repite —rayas, cuadros, lunares, sarga—,
// justo lo que se puede describir con parámetros. Así es instantáneo, gratis, no depende de una API que puede estar
// caída, y el color sale del catálogo en vez de lo que un modelo interprete por «azul». Lo que pagamos: solo sabe dibujar
// las familias de abajo; «flores con loros» sale como floral en esos colores, sin loros. Por eso la pantalla dice qué
// entendió («Entendí: Floral · Verde sobre Crudo»): quien lo usa ve el límite y corrige la frase.
//
// Todo es determinista (el «azar» sale de una semilla): el mismo texto da el mismo dibujo en cualquier navegador.

import { familiaDePatron, normalizarNombre, type FamiliaPatron } from "./patron-visual";
import { familiaDeTejido, type FamiliaTejido } from "./tejido-visual";

export type ColorDibujo = { nombre: string; hex: string; sinonimos?: readonly string[] };

export type TexturaTejido = "tafetan" | "lino" | "sarga" | "punto" | "canale" | "pique" | "pelo" | "brillo";
export type Orientacion = "vertical" | "horizontal" | "diagonal";

/** Un color ya elegido: su nombre (para decir qué se entendió) y su hex. */
type Tono = { nombre: string; hex: string };

export type RecetaPatron = {
  tipo: "patron";
  familia: FamiliaPatron;
  fondo: Tono;
  tinta: Tono;
  acento: Tono;
  escala: number;
  orientacion: Orientacion;
  semilla: number;
};
export type RecetaTejido = { tipo: "tejido"; textura: TexturaTejido; base: Tono; escala: number; semilla: number };
export type Receta = RecetaPatron | RecetaTejido;

/** Lo que se entendió de la frase, antes de armar las variantes. */
export type Lectura = {
  receta: Receta;
  /** Qué parte vino de la frase: la escala y la orientación solo se varían si la frase no las fijó. */
  fijo: { escala: boolean; orientacion: boolean; fondo: boolean };
  /** «Rayas · Azul marino sobre Crudo · finas». */
  entendido: string;
  /** `false` si no se reconoció el dibujo y se usó uno genérico (la pantalla lo dice). */
  reconocido: boolean;
};

// ---------------------------------------------------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------------------------------------------------

/** Palabras de color de uso diario que quizás no estén en el catálogo con ese nombre exacto. El catálogo manda. */
const COLORES_BASICOS: readonly ColorDibujo[] = [
  { nombre: "Blanco", hex: "#F4F4F0" },
  { nombre: "Negro", hex: "#1A1A18" },
  { nombre: "Crema", hex: "#EFE8DA" },
  { nombre: "Beige", hex: "#D5BA98" },
  { nombre: "Gris", hex: "#8A8A88" },
  { nombre: "Rojo", hex: "#B8412D" },
  { nombre: "Azul", hex: "#2F4F8F" },
  { nombre: "Celeste", hex: "#A9CADA" },
  { nombre: "Verde", hex: "#487D49" },
  { nombre: "Amarillo", hex: "#F0C05A" },
  { nombre: "Naranja", hex: "#E8703A" },
  { nombre: "Rosado", hex: "#F0A1BF", sinonimos: ["rosa"] },
  { nombre: "Morado", hex: "#563474", sinonimos: ["lila"] },
  { nombre: "Marrón", hex: "#6B4A32", sinonimos: ["cafe", "chocolate"] },
  { nombre: "Dorado", hex: "#C9A54A", sinonimos: ["oro"] },
  { nombre: "Plateado", hex: "#BFC3C7", sinonimos: ["plata"] },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Solo un `#rrggbb` llega al dibujo: el SVG se arma con texto, y nada raro de la base puede colarse en él. */
function hexSeguro(hex: string | null | undefined, respaldo: string): string {
  return hex && HEX.test(hex) ? hex.toUpperCase() : respaldo;
}

/** «negro» también encuentra «negra», «negros», «negras»; «azul», «azules». */
function patronDePalabra(termino: string): string {
  const escapado = termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/o$/.test(escapado)) return `${escapado.slice(0, -1)}(?:o|a|os|as)`;
  if (/[aeiou]$/.test(escapado)) return `${escapado}s?`;
  return `${escapado}(?:es)?`;
}

type Encontrado = { tono: Tono; desde: number; hasta: number };

/** Los colores de la frase, en el orden en que aparecen, sin solaparse: «azul marino» gana sobre «azul». */
export function coloresEnTexto(texto: string, catalogo: readonly ColorDibujo[]): Encontrado[] {
  const limpio = normalizarNombre(texto);
  const vistos = new Set<string>();
  const candidatos: { termino: string; tono: Tono }[] = [];
  for (const c of [...catalogo, ...COLORES_BASICOS]) {
    const tono = { nombre: c.nombre, hex: hexSeguro(c.hex, "#8A8A88") };
    for (const t of [c.nombre, ...(c.sinonimos ?? [])]) {
      const termino = normalizarNombre(t);
      if (!termino || vistos.has(termino)) continue; // el catálogo va primero: su «Rojo» gana al básico
      vistos.add(termino);
      candidatos.push({ termino, tono });
    }
  }
  candidatos.sort((a, b) => b.termino.length - a.termino.length);
  const tomados: Encontrado[] = [];
  for (const { termino, tono } of candidatos) {
    const regla = new RegExp(`(^|[^a-z0-9ñ])(${patronDePalabra(termino)})(?=$|[^a-z0-9ñ])`, "g");
    for (const m of limpio.matchAll(regla)) {
      // «topos» son lunares, no el color Topo en plural.
      if (m[2] === "topos") continue;
      const desde = (m.index ?? 0) + m[1].length;
      const hasta = desde + m[2].length;
      if (tomados.some((t) => desde < t.hasta && t.desde < hasta)) continue;
      tomados.push({ tono, desde, hasta });
    }
  }
  return tomados.sort((a, b) => a.desde - b.desde);
}

// ---------------------------------------------------------------------------------------------------------------------
// Lectura de la frase
// ---------------------------------------------------------------------------------------------------------------------

const FINO = /\b(fin[oa]s?|delgad[oa]s?|pequen[oa]s?|chic[oa]s?|mini|micro|menud[oa]s?|estrech[oa]s?)\b/;
const ANCHO = /\b(anch[oa]s?|grues[oa]s?|grandes?|maxi|enormes?|marcad[oa]s?)\b/;

const TEXTURA_DE_FAMILIA: Record<FamiliaTejido, TexturaTejido> = {
  algodon: "tafetan",
  pima: "tafetan",
  popelina: "tafetan",
  oxford: "tafetan",
  gasa: "tafetan",
  tela: "tafetan",
  lino: "lino",
  macrame: "lino",
  denim: "sarga",
  drill: "sarga",
  gabardina: "sarga",
  sastre: "sarga",
  jersey: "punto",
  licra: "punto",
  suplex: "punto",
  hilo: "punto",
  rib: "canale",
  pana: "canale",
  seersucker: "canale",
  pique: "pique",
  polar: "pelo",
  alpaca: "pelo",
  franela: "pelo",
  terciopelo: "pelo",
  seda: "brillo",
  poliester: "brillo",
  viscosa: "brillo",
  mojado: "brillo",
};

/** El color de cada tela cuando la frase no dice ninguno: el de la tela real (el denim es índigo). */
const COLOR_DE_TEXTURA: Record<TexturaTejido, Tono> = {
  tafetan: { nombre: "Crudo", hex: "#F1EADB" },
  lino: { nombre: "Beige", hex: "#D9C9A8" },
  sarga: { nombre: "Azul denim", hex: "#4A6A94" },
  punto: { nombre: "Gris melange", hex: "#A2A2A1" },
  canale: { nombre: "Topo", hex: "#9C8B78" },
  pique: { nombre: "Blanco", hex: "#EDEBE4" },
  pelo: { nombre: "Camel", hex: "#CDB48C" },
  brillo: { nombre: "Palo rosa", hex: "#D9A6A1" },
};

// Palabras de textura que no son un nombre de tela: «sarga», «de punto», «satinado».
const TEXTURA_POR_PALABRA: ReadonlyArray<readonly [TexturaTejido, RegExp]> = [
  ["sarga", /\b(sarga|twill|diagonal)\b/],
  ["canale", /\b(canale|acanalad[oa]|costillas?)\b/],
  ["punto", /\b(punto|tejido de punto|elastic[oa])\b/],
  ["brillo", /\b(satinad[oa]|brillante|brillos?|sedos[oa])\b/],
  ["pelo", /\b(peludo|afelpad[oa]|felpa|chiporro|lanud[oa])\b/],
  ["pique", /\b(panal|nido de abeja)\b/],
];

const NOMBRE_FAMILIA: Record<FamiliaPatron, string> = {
  liso: "Liso",
  rayas: "Rayas",
  cuadros: "Cuadros",
  lunares: "Lunares",
  floral: "Floral",
  animal: "Animal print",
  estampado: "Estampado",
};
const NOMBRE_TEXTURA: Record<TexturaTejido, string> = {
  tafetan: "Trama lisa",
  lino: "Trama de lino",
  sarga: "Sarga",
  punto: "Punto",
  canale: "Canalé",
  pique: "Piqué",
  pelo: "Pelo",
  brillo: "Satinado",
};

const CREMA: Tono = { nombre: "Crema", hex: "#EFE8DA" };
const TINTA: Tono = { nombre: "Negro", hex: "#1A1A18" };

/** Mezcla dos colores (`t` = cuánto del segundo). */
export function mezclar(a: string, b: string, t: number): string {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Lee la frase (y el nombre, si la frase no alcanza) y arma la receta base.
 * - Patrón: la familia sale de la frase o del nombre; el primer color es el del dibujo, el segundo el fondo, el tercero
 *   un acento. Un color precedido de «sobre», «fondo» o «base» es el fondo, esté donde esté.
 * - Tejido: la textura sale de la frase o del nombre; el primer color es el de la tela.
 */
export function leerDescripcion(tipo: "tejido" | "patron", nombre: string, descripcion: string, catalogo: readonly ColorDibujo[]): Lectura {
  const texto = normalizarNombre(descripcion);
  const colores = coloresEnTexto(descripcion, catalogo);
  const escala = FINO.test(texto) ? 0.6 : ANCHO.test(texto) ? 1.6 : 1;
  const palabraEscala = escala < 1 ? "finas" : escala > 1 ? "anchas" : null;

  if (tipo === "tejido") {
    const familia = familiaDeTejido(descripcion) ?? familiaDeTejido(nombre);
    const porPalabra = TEXTURA_POR_PALABRA.find(([, r]) => r.test(texto))?.[0] ?? null;
    const textura = familia ? TEXTURA_DE_FAMILIA[familia] : porPalabra ?? "tafetan";
    const base = colores[0]?.tono ?? COLOR_DE_TEXTURA[textura];
    return {
      receta: { tipo: "tejido", textura, base, escala, semilla: 0 },
      fijo: { escala: escala !== 1, orientacion: false, fondo: false },
      entendido: [NOMBRE_TEXTURA[textura], base.nombre, palabraEscala === "finas" ? "fino" : palabraEscala === "anchas" ? "grueso" : null]
        .filter(Boolean)
        .join(" · "),
      reconocido: Boolean(familia ?? porPalabra),
    };
  }

  const familiaLeida = familiaDePatron(descripcion) ?? familiaDePatron(nombre);
  const familia = familiaLeida ?? "estampado";
  const esFondo = (e: Encontrado) => /\b(sobre|fondo|base)\s+(de\s+)?(color\s+)?$/.test(normalizarNombre(descripcion).slice(Math.max(0, e.desde - 22), e.desde));
  const fondoMarcado = colores.find(esFondo);
  const resto = colores.filter((c) => c !== fondoMarcado).map((c) => c.tono);
  let tinta: Tono;
  let fondo: Tono;
  if (familia === "liso") {
    // Liso: el color nombrado ES la tela.
    tinta = fondoMarcado?.tono ?? resto[0] ?? { nombre: "Arena", hex: "#D9CFBC" };
    fondo = tinta;
  } else {
    tinta = resto[0] ?? TINTA;
    fondo = fondoMarcado?.tono ?? resto[1] ?? CREMA;
    if (tinta.hex === fondo.hex) fondo = tinta.hex === CREMA.hex ? TINTA : CREMA;
  }
  const acentoLeido = familia === "liso" ? undefined : fondoMarcado ? resto[1] : resto[2];
  const acento = acentoLeido ?? { nombre: tinta.nombre, hex: mezclar(tinta.hex, fondo.hex, 0.45) };
  const orientacion: Orientacion = /\bhorizontal(es)?\b/.test(texto) ? "horizontal" : /\b(diagonal(es)?|sesgad[oa]s?)\b/.test(texto) ? "diagonal" : "vertical";
  const fijaOrientacion = /\b(horizontal(es)?|vertical(es)?|diagonal(es)?|sesgad[oa]s?)\b/.test(texto);
  const colorTexto = familia === "liso" ? tinta.nombre : `${tinta.nombre} sobre ${fondo.nombre}${acentoLeido ? ` con ${acentoLeido.nombre}` : ""}`;
  return {
    receta: { tipo: "patron", familia, fondo, tinta, acento, escala, orientacion, semilla: 0 },
    fijo: { escala: escala !== 1, orientacion: fijaOrientacion, fondo: Boolean(fondoMarcado) },
    entendido: [NOMBRE_FAMILIA[familia], colorTexto, familia === "rayas" && fijaOrientacion ? orientacion.replace(/l$/, "les") : null, palabraEscala]
      .filter(Boolean)
      .join(" · "),
    reconocido: familiaLeida !== null,
  };
}

/**
 * Tres propuestas a partir de la lectura. Cambia solo lo que la frase NO fijó: la escala (fina, media, ancha), y en
 * cada ronda de «Otra variante» la semilla (dónde caen las flores, las manchas), la orientación de las rayas y, si la
 * frase no dijo cuál es el fondo, se invierten dibujo y fondo.
 */
export function variantes(lectura: Lectura, ronda: number): Receta[] {
  const base = lectura.receta;
  const escalas = lectura.fijo.escala ? [base.escala * 0.8, base.escala, base.escala * 1.25] : [0.65, 1, 1.5];
  return escalas.map((escala, i) => {
    const semilla = ronda * 3 + i + 1;
    if (base.tipo === "tejido") return { ...base, escala, semilla };
    const orientaciones: Orientacion[] = ["vertical", "horizontal", "diagonal"];
    const orientacion = lectura.fijo.orientacion ? base.orientacion : orientaciones[ronda % 3];
    const invertir = !lectura.fijo.fondo && base.familia !== "liso" && ronda % 2 === 1;
    return {
      ...base,
      escala,
      semilla,
      orientacion,
      tinta: invertir ? base.fondo : base.tinta,
      fondo: invertir ? base.tinta : base.fondo,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Dibujo (SVG en texto: sirve para la vista previa y para pasarlo a JPG)
// ---------------------------------------------------------------------------------------------------------------------

/** El lienzo: 2:1, como la muestra grande del detalle (la tarjeta, 3:1, recorta al centro). */
export const ANCHO_DIBUJO = 240;
export const ALTO_DIBUJO = 120;

function azar(semilla: number): () => number {
  let s = (Math.abs(Math.floor(semilla)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

function rango(desde: number, hasta: number, paso: number): number[] {
  const r: number[] = [];
  for (let v = desde; v < hasta; v += paso) r.push(v);
  return r;
}

function dibujoPatron(r: RecetaPatron): string {
  const W = ANCHO_DIBUJO;
  const H = ALTO_DIBUJO;
  const s = r.escala;
  const rnd = azar(r.semilla);
  const { tinta, fondo, acento } = { tinta: r.tinta.hex, fondo: r.fondo.hex, acento: r.acento.hex };
  switch (r.familia) {
    case "liso":
      return `<rect width="${W}" height="${H}" fill="${tinta}"/>`;
    case "rayas": {
      const p = 18 * s;
      const w = p * 0.42;
      const giro = r.orientacion === "horizontal" ? 90 : r.orientacion === "diagonal" ? 45 : 0;
      const rayas = rango(-W, 2 * W, p)
        .map((x) => `<rect x="${f(x)}" y="${-W}" width="${f(w)}" height="${3 * W}" fill="${tinta}"/>` + `<rect x="${f(x + w + p * 0.14)}" y="${-W}" width="${f(p * 0.06)}" height="${3 * W}" fill="${acento}"/>`)
        .join("");
      return `<g transform="rotate(${giro} ${W / 2} ${H / 2})">${rayas}</g>`;
    }
    case "cuadros": {
      const p = 28 * s;
      const b = p / 2;
      const verticales = rango(0, W, p).map((x) => `<rect x="${f(x)}" y="0" width="${f(b)}" height="${H}" fill="${tinta}" opacity="0.42"/>`);
      const horizontales = rango(0, H, p).map((y) => `<rect x="0" y="${f(y)}" width="${W}" height="${f(b)}" fill="${tinta}" opacity="0.42"/>`);
      const lineas = rango(b + b / 2, W, p).map((x) => `<rect x="${f(x)}" y="0" width="${f(Math.max(0.8, p * 0.04))}" height="${H}" fill="${acento}" opacity="0.8"/>`);
      return [...verticales, ...horizontales, ...lineas].join("");
    }
    case "lunares": {
      const p = 22 * s;
      const radio = p * 0.2;
      return rango(0, H + p, p)
        .flatMap((y, fila) => rango(fila % 2 ? p / 2 : 0, W + p, p).map((x) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(radio)}" fill="${tinta}"/>`))
        .join("");
    }
    case "floral": {
      const p = 46 * s;
      const flores: string[] = [];
      for (const y of rango(-p / 2, H + p, p)) {
        for (const x of rango(-p / 2, W + p, p)) {
          const cx = x + (rnd() - 0.5) * p * 0.5;
          const cy = y + (rnd() - 0.5) * p * 0.5;
          const rp = p * (0.11 + rnd() * 0.04);
          const giro = rnd() * 72;
          const petalos = [0, 72, 144, 216, 288]
            .map((a) => {
              const rad = ((a + giro) * Math.PI) / 180;
              return `<circle cx="${f(cx + Math.cos(rad) * rp * 1.15)}" cy="${f(cy + Math.sin(rad) * rp * 1.15)}" r="${f(rp)}" fill="${tinta}"/>`;
            })
            .join("");
          const hoja = `<ellipse cx="${f(cx + rp * 2.6)}" cy="${f(cy + rp * 2.2)}" rx="${f(rp * 1.3)}" ry="${f(rp * 0.55)}" fill="${acento}" transform="rotate(${f(30 + giro)} ${f(cx + rp * 2.6)} ${f(cy + rp * 2.2)})"/>`;
          flores.push(hoja + petalos + `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rp * 0.6)}" fill="${fondo}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rp * 0.35)}" fill="${acento}"/>`);
        }
      }
      return flores.join("");
    }
    case "animal": {
      const p = 26 * s;
      const manchas: string[] = [];
      for (const y of rango(-p / 2, H + p, p)) {
        for (const x of rango(-p / 2, W + p, p)) {
          const cx = x + (rnd() - 0.5) * p * 0.6;
          const cy = y + (rnd() - 0.5) * p * 0.6;
          const rx = p * (0.22 + rnd() * 0.12);
          const ry = rx * (0.65 + rnd() * 0.3);
          const giro = f(rnd() * 180);
          manchas.push(
            `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${acento}" transform="rotate(${giro} ${f(cx)} ${f(cy)})"/>` +
              `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="none" stroke="${tinta}" stroke-width="${f(p * 0.09)}" stroke-dasharray="${f(rx * 1.4)} ${f(rx * 0.7)}" stroke-linecap="round" transform="rotate(${giro} ${f(cx)} ${f(cy)})"/>`,
          );
        }
      }
      return manchas.join("");
    }
    case "estampado": {
      const p = 34 * s;
      const formas: string[] = [];
      let i = 0;
      for (const y of rango(-p / 2, H + p, p)) {
        for (const x of rango(-p / 2, W + p, p)) {
          const cx = x + (rnd() - 0.5) * p * 0.4;
          const cy = y + (rnd() - 0.5) * p * 0.4;
          const t = p * 0.22;
          const color = i % 2 ? acento : tinta;
          const cual = (i + Math.floor(rnd() * 3)) % 3;
          formas.push(
            cual === 0
              ? `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(t)}" fill="${color}"/>`
              : cual === 1
                ? `<path d="M${f(cx)} ${f(cy - t)} L${f(cx + t)} ${f(cy + t)} L${f(cx - t)} ${f(cy + t)} Z" fill="${color}"/>`
                : `<path d="M${f(cx - t * 1.4)} ${f(cy)} q${f(t * 0.7)} ${f(-t)} ${f(t * 1.4)} 0 t${f(t * 1.4)} 0" fill="none" stroke="${color}" stroke-width="${f(t * 0.35)}" stroke-linecap="round"/>`,
          );
          i++;
        }
      }
      return formas.join("");
    }
  }
}

function dibujoTejido(r: RecetaTejido): string {
  const W = ANCHO_DIBUJO;
  const H = ALTO_DIBUJO;
  const s = r.escala;
  const rnd = azar(r.semilla);
  const base = r.base.hex;
  const oscuro = mezclar(base, "#000000", 0.35);
  const claro = mezclar(base, "#FFFFFF", 0.4);
  switch (r.textura) {
    case "tafetan":
    case "lino": {
      const p = 5 * s;
      const hilos = [
        ...rango(0, W, p).map((x) => `<rect x="${f(x)}" y="0" width="${f(p * 0.45)}" height="${H}" fill="${oscuro}" opacity="0.16"/>`),
        ...rango(0, H, p).map((y) => `<rect x="0" y="${f(y)}" width="${W}" height="${f(p * 0.45)}" fill="${oscuro}" opacity="0.16"/>`),
      ];
      // El lino tiene «slubs»: engrosamientos cortos del hilo, al azar.
      const slubs =
        r.textura === "lino"
          ? Array.from({ length: Math.round(70 / s) }, () => {
              const horizontal = rnd() > 0.5;
              const x = rnd() * W;
              const y = rnd() * H;
              const largo = (8 + rnd() * 18) * s;
              return horizontal
                ? `<rect x="${f(x)}" y="${f(y)}" width="${f(largo)}" height="${f(p * 0.55)}" fill="${oscuro}" opacity="0.18"/>`
                : `<rect x="${f(x)}" y="${f(y)}" width="${f(p * 0.55)}" height="${f(largo)}" fill="${claro}" opacity="0.32"/>`;
            })
          : [];
      return [...hilos, ...slubs].join("");
    }
    case "sarga": {
      const p = 6 * s;
      return (
        `<g transform="rotate(-35 ${W / 2} ${H / 2})">` +
        rango(-W, 2 * W, p)
          .map((x) => `<rect x="${f(x)}" y="${-W}" width="${f(p * 0.4)}" height="${3 * W}" fill="${oscuro}" opacity="0.35"/><rect x="${f(x + p * 0.55)}" y="${-W}" width="${f(p * 0.15)}" height="${3 * W}" fill="${claro}" opacity="0.4"/>`)
          .join("") +
        `</g>`
      );
    }
    case "punto": {
      const ancho = 7 * s;
      const alto = 5 * s;
      return rango(0, H + alto, alto)
        .flatMap((y) =>
          rango(0, W + ancho, ancho).map(
            (x) =>
              `<path d="M${f(x)} ${f(y)} L${f(x + ancho / 2)} ${f(y + alto * 0.8)} L${f(x + ancho)} ${f(y)}" fill="none" stroke="${oscuro}" stroke-width="${f(Math.max(0.6, s * 0.9))}" opacity="0.4"/>`,
          ),
        )
        .join("");
    }
    case "canale": {
      const p = 9 * s;
      return rango(0, W + p, p)
        .map((x) => `<rect x="${f(x)}" y="0" width="${f(p * 0.45)}" height="${H}" fill="${oscuro}" opacity="0.3"/><rect x="${f(x + p * 0.55)}" y="0" width="${f(p * 0.15)}" height="${H}" fill="${claro}" opacity="0.55"/>`)
        .join("");
    }
    case "pique": {
      const p = 8 * s;
      return rango(0, H + p, p * 0.87)
        .flatMap((y, fila) =>
          rango(fila % 2 ? p / 2 : 0, W + p, p).map((x) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(p * 0.3)}" fill="none" stroke="${oscuro}" stroke-width="${f(Math.max(0.6, p * 0.12))}" opacity="0.45"/>`),
        )
        .join("");
    }
    case "pelo": {
      return Array.from({ length: Math.round(900 / s) }, (_, i) => {
        const x = rnd() * W;
        const y = rnd() * H;
        const largo = (4 + rnd() * 7) * s;
        const a = rnd() * Math.PI * 2;
        const color = i % 2 ? claro : oscuro;
        return `<path d="M${f(x)} ${f(y)} q${f(Math.cos(a + 1) * largo * 0.6)} ${f(Math.sin(a + 1) * largo * 0.6)} ${f(Math.cos(a) * largo)} ${f(Math.sin(a) * largo)}" fill="none" stroke="${color}" stroke-width="${f(Math.max(0.5, s * 0.8))}" stroke-linecap="round" opacity="0.5"/>`;
      }).join("");
    }
    case "brillo": {
      const p = 60 * s;
      const bandas = rango(-W, 2 * W, p).map((x) => `<polygon points="${f(x)},0 ${f(x + p * 0.35)},0 ${f(x + p * 0.35 - H * 0.6)},${H} ${f(x - H * 0.6)},${H}" fill="${claro}" opacity="0.35"/>`);
      const flujo = rango(4, H, 7 * s).map((y) => `<path d="M0 ${f(y)} C${f(W * 0.3)} ${f(y - 5 * s)}, ${f(W * 0.6)} ${f(y + 5 * s)}, ${W} ${f(y)}" fill="none" stroke="${oscuro}" stroke-width="0.6" opacity="0.18"/>`);
      return [...bandas, ...flujo].join("");
    }
  }
}

/** El SVG completo de una receta: sin scripts, sin enlaces, solo formas y colores `#rrggbb`. */
export function svgDeReceta(receta: Receta): string {
  const fondo = receta.tipo === "patron" ? receta.fondo.hex : receta.base.hex;
  const formas = receta.tipo === "patron" ? dibujoPatron(receta) : dibujoTejido(receta);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO_DIBUJO} ${ALTO_DIBUJO}" width="${ANCHO_DIBUJO * 5}" height="${ALTO_DIBUJO * 5}" preserveAspectRatio="xMidYMid slice">` +
    `<rect width="${ANCHO_DIBUJO}" height="${ALTO_DIBUJO}" fill="${fondo}"/>${formas}</svg>`
  );
}

/** Para una `<img>`: el SVG como `data:` (nunca se inyecta como HTML). */
export function urlDeSvg(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
