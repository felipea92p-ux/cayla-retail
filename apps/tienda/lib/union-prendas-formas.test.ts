import { describe, expect, it } from "vitest";
import { cajasDeLaFigura, huecoDeLaUnion, perfilDePixeles, type PrendaParaAuditar } from "./union-auditoria-pixeles";
import { alturaQueCubreLaPretina, CIMA_DE_LA_PRETINA, contornoDe, FRANJAS_DEL_CONTORNO, medidaDesdeDato, medirRecorte, SOLAPE_DE_LA_UNION } from "./union-prendas";

// La unión por FORMAS (ADR-0449, act. 2026-11-17): siluetas inventadas que cubren cada forma de bajo y de pretina que un catálogo de ropa puede traer. Si mañana
// llega una prenda con un bajo que nadie imaginó, la regla ya no se parcha caso por caso: esta prueba dice en píxeles si dejó aire. Complementa a
// `union-prendas-reales.test.ts` (prendas del catálogo de verdad).

const T = 128;
type Forma = (x: number, y: number) => boolean;
const imagen = (ancho: number, alto: number, prenda: Forma) => {
  const d = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) d[(y * ancho + x) * 4 + 3] = prenda(x, y) ? 255 : 0;
  return d;
};

// Bajos de la prenda de arriba: el cuerpo va de x 16 a 112 y el bajo es lo que cambia.
const BAJOS: Record<string, Forma> = {
  recto: (x, y) => x >= 16 && x < 112 && y < 100,
  enV: (x, y) => x >= 16 && x < 112 && y < 66 + 34 * (1 - Math.abs(x - 64) / 48),
  diagonal: (x, y) => x >= 16 && x < 112 && y < 70 + (30 * (x - 16)) / 96,
  hundido: (x, y) => x >= 16 && x < 112 && y < 76 + 24 * Math.cos(((x - 64) / 48) * (Math.PI / 2)),
  conVuelo: (x, y) => (x >= 16 && x < 112 && y < 70) || (y >= 70 && y < 100 && Math.abs(x - 64) < 48 + (y - 70) * 0.5),
  enPunta: (x, y) => x >= 16 && x < 112 && y < 100 - (Math.abs(x - 64) / 48) ** 2 * 40,
  // Un bajo con escalón: recto en el centro y 20 filas más alto en los últimos 6 px de cada lado (los costados abiertos de una camisa).
  conEscalon: (x, y) => x >= 16 && x < 112 && y < (Math.abs(x - 64) < 42 ? 100 : 80),
  conMangasLargas: (x, y) => (x >= 28 && x < 100 && y < 80) || (x < 20 && y < 118) || (x >= 108 && y < 118),
};

// Pretinas de la prenda de abajo: una imagen de 100×128; lo que cambia es cómo empieza arriba.
const PRETINAS: Record<string, Forma> = {
  plana: (x, y) => Math.abs(x - 50) <= 30 + 15 * Math.min(1, y / 30) && !(y > 60 && Math.abs(x - 50) < 6),
  esquinasRedondas: (x, y) => Math.abs(x - 50) <= Math.min(30 + 15 * Math.min(1, y / 30), 22 + y * 1.5) && !(y > 60 && Math.abs(x - 50) < 6),
  caderaMarcada: (x, y) => Math.abs(x - 50) <= 24 + 21 * Math.min(1, y / 14) && !(y > 60 && Math.abs(x - 50) < 6),
  inclinada: (x, y) => y >= (x - 20) * 0.08 && Math.abs(x - 50) <= 30 + 15 * Math.min(1, y / 30) && !(y > 70 && Math.abs(x - 50) < 6),
};

const medir = (rgba: Uint8ClampedArray, ancho: number, alto: number) => ({ medida: medirRecorte(rgba, ancho, alto), perfil: perfilDePixeles(rgba, ancho, alto) });
const arriba = (f: Forma): PrendaParaAuditar & ReturnType<typeof medir> => ({ largo: 50, proporcion: 1, porTorso: false, ...medir(imagen(T, T, f), T, T) });
const abajo = (f: Forma, falda = false): PrendaParaAuditar & ReturnType<typeof medir> => ({ largo: 100, proporcion: 100 / 128, falda, ...medir(imagen(100, 128, f), 100, 128) });

describe("la pretina queda cubierta por el bajo de arriba, sea cual sea la forma de los dos", () => {
  for (const [nombreBajo, bajo] of Object.entries(BAJOS)) {
    for (const [nombrePretina, pretina] of Object.entries(PRETINAS)) {
      for (const falda of [false, true]) {
        it(`bajo ${nombreBajo} con pretina ${nombrePretina}${falda ? " (falda)" : ""}`, () => {
          const a = arriba(bajo);
          const b = abajo(pretina, falda);
          const cajas = cajasDeLaFigura(a, a.medida, b, b.medida);
          expect(cajas).not.toBeNull();
          if (!cajas) return;
          const r = huecoDeLaUnion({ caja: cajas.arriba, perfil: a.perfil }, { caja: cajas.abajo, perfil: b.perfil });
          expect(r.maxHueco).toBeLessThanOrEqual(2);
        });
      }
    }
  }
  // Que el detector no está ciego se prueba con prendas reales (`union-prendas-reales.test.ts`): con estas siluetas simples la estimación de antes también acertaba.
});

describe("contornoDe: el contorno fino es conservador, para que cubrir con él sea cubrir en todos los píxeles", () => {
  it("tiene una franja por cada pedazo del ancho, con el bajo más ALTO y el inicio más BAJO de sus columnas", () => {
    const c = contornoDe(imagen(T, T, BAJOS.diagonal), T, T);
    expect(c?.fondo).toHaveLength(FRANJAS_DEL_CONTORNO);
    // En una diagonal el bajo de cada franja es el de su columna más alta (la de la izquierda), nunca más bajo que el de ninguna columna suya.
    const fondo = c?.fondo ?? [];
    for (let i = 1; i < fondo.length; i++) {
      const antes = fondo[i - 1];
      const ahora = fondo[i];
      if (antes != null && ahora != null) expect(ahora).toBeGreaterThanOrEqual(antes - 1e-9);
    }
    const franja = Math.floor(FRANJAS_DEL_CONTORNO / 2);
    const columna = Math.floor((franja * T) / FRANJAS_DEL_CONTORNO);
    expect((fondo[franja] ?? 1) * T).toBeLessThanOrEqual(70 + (30 * (columna - 16)) / 96 + 1);
  });

  it("solo las franjas de la pretina llevan cima: la curva de la cadera no cuenta", () => {
    const c = contornoDe(imagen(100, 128, PRETINAS.caderaMarcada), 100, 128);
    const con = (c?.cima ?? []).filter((v) => v !== null);
    expect(con.length).toBeGreaterThan(0);
    const masAlta = Math.min(...con.map((v) => v ?? 1));
    for (const v of con) expect(v ?? 1).toBeLessThanOrEqual(masAlta + CIMA_DE_LA_PRETINA + 0.03);
    expect((c?.cima ?? []).some((v) => v === null)).toBe(true);
  });

  it("una imagen vacía o muy chica no tiene contorno", () => {
    expect(contornoDe(imagen(T, T, () => false), T, T)).toBeNull();
    expect(contornoDe(imagen(20, 20, () => true), 20, 20)).toBeNull();
  });

  it("se lee bien de lo que responde la tienda, y un contorno roto no tira la medida", () => {
    const m = medirRecorte(imagen(T, T, BAJOS.enV), T, T);
    const ida = medidaDesdeDato(JSON.parse(JSON.stringify(m)));
    expect(ida?.contorno).toEqual(m.contorno);
    expect(medidaDesdeDato({ ...JSON.parse(JSON.stringify(m)), contorno: { fondo: [0.5], cima: [] } })?.contorno).toBeUndefined();
    expect(medidaDesdeDato({ ...JSON.parse(JSON.stringify(m)), contorno: "x" })?.filaDelBorde).toBe(m.filaDelBorde);
  });
});

describe("alturaQueCubreLaPretina", () => {
  const franjas = (valor: number | null) => Array.from({ length: FRANJAS_DEL_CONTORNO }, () => valor);
  const caja = { x: 0, y: 100, w: 128, h: 100 };

  it("con un bajo recto y una pretina plana, la pretina entra bajo el bajo lo justo (el solape)", () => {
    const y = alturaQueCubreLaPretina(caja, { fondo: franjas(0.8), cima: franjas(0) }, 0.8, { x: 0, w: 128, h: 200 }, { fondo: franjas(1), cima: franjas(0) });
    expect(y).toBeCloseTo(100 + 0.8 * 100 - SOLAPE_DE_LA_UNION, 5);
  });

  it("una esquina que empieza más abajo hace subir la pretina lo mismo", () => {
    const cima = franjas(0);
    cima[0] = 0.05;
    const y = alturaQueCubreLaPretina(caja, { fondo: franjas(0.8), cima: franjas(null) }, 0.8, { x: 0, w: 128, h: 200 }, { fondo: franjas(1), cima });
    expect(y).toBeCloseTo(100 + 0.8 * 100 - SOLAPE_DE_LA_UNION - 0.05 * 200, 5);
  });

  it("sin contorno de alguna de las dos, o sin bajo de torso, no decide: manda la estimación", () => {
    const c = { fondo: franjas(0.8), cima: franjas(0) };
    expect(alturaQueCubreLaPretina(caja, null, 0.8, { x: 0, w: 128, h: 200 }, c)).toBeNull();
    expect(alturaQueCubreLaPretina(caja, c, 0.8, { x: 0, w: 128, h: 200 }, undefined)).toBeNull();
    expect(alturaQueCubreLaPretina(caja, c, null, { x: 0, w: 128, h: 200 }, c)).toBeNull();
  });

  it("un hueco enorme en el bajo (una franja que termina muy arriba) no sube el pantalón hasta el pecho", () => {
    const fondo = franjas(0.8);
    fondo[10] = 0.05;
    const y = alturaQueCubreLaPretina(caja, { fondo, cima: franjas(null) }, 0.8, { x: 0, w: 128, h: 200 }, { fondo: franjas(1), cima: franjas(0) });
    expect(y).toBeCloseTo(100 + 0.8 * 100 - SOLAPE_DE_LA_UNION, 5);
  });
});

describe("el ancho del cuerpo: un bajo que termina en punta no hace ver la prenda más chica de lo que es (Felipe, 2026-11-17)", () => {
  const anchoBajoDe = (forma: Forma) => medirRecorte(imagen(T, T, forma), T, T).anchoBajo ?? 0;
  const CUERPO = 96 / T; // el cuerpo de todas estas formas va de x 16 a 112

  it("con un bajo recto mide lo de siempre: el ancho del cuerpo", () => {
    expect(anchoBajoDe(BAJOS.recto)).toBeCloseTo(CUERPO, 2);
  });

  it("con un bajo en V, en punta o en diagonal mide el cuerpo, no la punta", () => {
    for (const nombre of ["enV", "enPunta", "diagonal", "hundido"]) {
      expect(anchoBajoDe(BAJOS[nombre]), nombre).toBeGreaterThan(CUERPO - 0.06);
      expect(anchoBajoDe(BAJOS[nombre]), nombre).toBeLessThanOrEqual(CUERPO + 0.01);
    }
  });

  it("un cuerpo que se ensancha apenas hacia arriba (una blusa entallada) no cuenta como bajo que se abre: mide su bajo", () => {
    // De 80 de ancho en el bajo a 96 en los hombros, parejo: 16 px en 100 filas.
    const entallada: Forma = (x, y) => y < 100 && Math.abs(x - 64) < 40 + (8 * (100 - y)) / 100;
    expect(anchoBajoDe(entallada)).toBeLessThan(80 / T + 0.03);
  });

  it("unas mangas largas que se juntan con el cuerpo más arriba no se suman: el ensanche de golpe corta la subida", () => {
    // Cuerpo de x 40 a 88 con bajo en V; mangas sueltas a los lados que se pegan al cuerpo desde la fila 60 hacia arriba.
    const conMangas: Forma = (x, y) => (x >= 40 && x < 88 && y < 70 + 30 * (1 - Math.abs(x - 64) / 24)) || ((x < 30 || x >= 98) && y < 110) || (y < 60 && x >= 8 && x < 120);
    expect(anchoBajoDe(conMangas)).toBeLessThanOrEqual(48 / T + 0.02);
  });

  it("con vuelo abajo (más ancha en el bajo que en el cuerpo) sigue midiendo el vuelo, como siempre", () => {
    expect(anchoBajoDe(BAJOS.conVuelo)).toBeGreaterThan(CUERPO);
  });
});
