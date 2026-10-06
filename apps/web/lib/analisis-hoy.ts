// Análisis v4 (ADR-0356): la pestaña «Hoy» en lógica pura (sin base ni React). La pantalla (`components/analisis/PestanaHoy.tsx`)
// solo dibuja lo que sale de aquí, con el diseño de la maqueta aprobada por Felipe (2026-10-06): cuatro tarjetas que responden
// una pregunta cada una, las tres tiendas y «Qué hacer hoy», el flujo de prendas que entran y salen de la tienda.
//
// El flujo es de ALTO FIJO (1020 × 320): el grosor de cada camino es su parte del total, así que con 1, 20 o 300 prendas el
// dibujo mide lo mismo y no empuja la página. Las cuentas son las de `queHacer()` de la maqueta, con dos topes que la maqueta
// no necesitaba con sus datos de ejemplo: el bloque «Tu tienda» nunca se sale del alto, y un hueco nunca es negativo.
//
// Ninguna regla de negocio nueva: los grupos (comprar, enviar, liquidar) salen de `grupoDe` (`analisis-reglas.ts`), igual que
// en los carriles; aquí solo se reparten en caminos y se mide el dibujo.

import type { PrendaAnalisis, ResumenSedeAnalisis, SedeAnalisis, VistaAnalisis } from "./analisis-tipos";
import { resumenDeSede } from "./analisis-armado";
import { categoriaDe, DIFERENCIA_QUE_SE_NOTA } from "./analisis-pedir";
import {
  DIAS_SE_ACABA,
  DIAS_TRES_MESES,
  GRUPOS_ACABA,
  GRUPOS_QUIETAS,
  META_SE_VENDE_LO_QUE_LLEGA,
  ordenQuietas,
  ordenSeAcaba,
  plural,
  porLlegar,
  prendasDe,
  sedeQueMasVende,
  totalEnTienda,
  type GrupoAnalisis,
} from "./analisis-reglas";

/** Los estados que usa Hoy (los mismos cinco de la maqueta: urgente, atención, va bien, para saber, todavía no). */
export type EstadoHoy = "urg" | "ate" | "bien" | "info" | "nd";

const entre0y1 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

// ───────────────────────── Las cuatro tarjetas ─────────────────────────

/** «¿Qué se acaba?»: lo que se está acabando, de lo más urgente a lo menos (la tarjeta muestra las 5 primeras). */
export function seAcabanHoy(prendas: readonly PrendaAnalisis[], liquidarDesde: number): PrendaAnalisis[] {
  return prendasDe(prendas, GRUPOS_ACABA, liquidarDesde).sort(ordenSeAcaba);
}

/** «¿Qué no se mueve?»: lo quieto desde el umbral (mandar o liquidar), de lo que más espera a lo que menos. */
export function quietasHoy(prendas: readonly PrendaAnalisis[], liquidarDesde: number): PrendaAnalisis[] {
  return prendasDe(prendas, GRUPOS_QUIETAS, liquidarDesde).sort(ordenQuietas);
}

/**
 * Lo que dice una fila de «¿Qué se acaba?»: «Ya no hay» en rojo; «Quedan N días» en ámbar si es una semana o menos, en pizarra
 * si queda más.
 */
export function textoDiasQueQuedan(dias: number): { texto: string; est: Extract<EstadoHoy, "urg" | "ate" | "info">; agotada: boolean } {
  if (dias <= 0) return { texto: "Ya no hay", est: "urg", agotada: true };
  return { texto: dias === 1 ? "Queda 1 día" : `Quedan ${dias} días`, est: dias <= 7 ? "ate" : "info", agotada: false };
}

/** Una fila de «¿Qué no se mueve?»: en rojo desde los 3 meses quieta; antes, en ámbar. */
export const estadoQuieta = (diasSinVender: number): Extract<EstadoHoy, "urg" | "ate"> => (diasSinVender >= DIAS_TRES_MESES ? "urg" : "ate");

/** «¿Se vende lo que llega?»: va bien desde la meta; si no llegó nada en 30 días no hay qué medir (solo se informa). */
export function estadoLlegadas(vendioDe10: number | null): Extract<EstadoHoy, "bien" | "ate" | "info"> {
  if (vendioDe10 === null) return "info";
  return vendioDe10 >= META_SE_VENDE_LO_QUE_LLEGA ? "bien" : "ate";
}


/** Lo que se vende y lo que hay de cada tipo de prenda, de cada 100 (la mariposa «se vende ↔ tienes»). */
export type ParteCategoria = { categoria: string; vende: number; tiene: number };

/**
 * De cada 100 ventas de los últimos 30 días y de cada 100 prendas que tiene la tienda, cuántas son de cada categoría. Vacío si no
 * se vendió nada: sin ventas no hay qué comparar. Ordenadas de la que más se vende a la que menos.
 */
export function partesPorCategoria(prendas: readonly Pick<PrendaAnalisis, "categoria" | "vendidas30" | "piso" | "almacen">[]): ParteCategoria[] {
  const ventas = new Map<string, number>();
  const unidades = new Map<string, number>();
  let totalVentas = 0;
  let totalUnidades = 0;
  for (const p of prendas) {
    const cat = categoriaDe(p);
    const v = Math.max(0, p.vendidas30);
    const u = Math.max(0, totalEnTienda(p));
    ventas.set(cat, (ventas.get(cat) ?? 0) + v);
    unidades.set(cat, (unidades.get(cat) ?? 0) + u);
    totalVentas += v;
    totalUnidades += u;
  }
  if (totalVentas <= 0) return [];
  return [...new Set([...ventas.keys(), ...unidades.keys()])]
    .map((categoria) => ({
      categoria,
      vende: Math.round(((ventas.get(categoria) ?? 0) / totalVentas) * 100),
      tiene: totalUnidades > 0 ? Math.round(((unidades.get(categoria) ?? 0) / totalUnidades) * 100) : 0,
    }))
    .filter((c) => c.vende > 0 || c.tiene > 0)
    .sort((a, b) => b.vende - a.vende || b.tiene - a.tiene || a.categoria.localeCompare(b.categoria, "es"));
}

/** Desde cuánta diferencia (de cada 100) una categoría «pide más»: la MISMA de «Qué pedir», así el ▲ de Hoy y el de su mariposa
 *  coinciden siempre (y la misma categoría «Sin categoría»: `categoriaDe`). */
export const DIFERENCIA_PIDE_MAS = DIFERENCIA_QUE_SE_NOTA;

/**
 * La mariposa chica de «¿Qué pedir?»: las 3 categorías con más diferencia entre lo que se vende y lo que hay, y las que piden más
 * (hasta 2, de la que más a la que menos), que la tarjeta dice en letras grandes. Las que piden más siempre están en el dibujo; el
 * resto se completa con las de más diferencia. Las filas van en el orden de `partes` (la que más se vende arriba). `max` es la
 * cifra más grande de las filas, para el largo de las barras.
 */
export function miniMariposa(
  partes: readonly ParteCategoria[],
  cuantas = 3,
): { filas: (ParteCategoria & { pideMas: boolean })[]; piden: string[]; max: number } {
  const dif = (c: ParteCategoria) => c.vende - c.tiene;
  const porNombre = (a: ParteCategoria, b: ParteCategoria) => a.categoria.localeCompare(b.categoria, "es");
  const piden = partes
    .filter((c) => dif(c) >= DIFERENCIA_PIDE_MAS)
    .sort((a, b) => dif(b) - dif(a) || b.vende - a.vende || porNombre(a, b))
    .slice(0, Math.min(2, cuantas));
  const elegidas = new Set(piden.map((c) => c.categoria));
  const resto = partes
    .filter((c) => !elegidas.has(c.categoria))
    .sort((a, b) => Math.abs(dif(b)) - Math.abs(dif(a)) || dif(b) - dif(a) || b.vende - a.vende || porNombre(a, b));
  for (const c of resto) {
    if (elegidas.size >= cuantas) break;
    elegidas.add(c.categoria);
  }
  const filas = partes.filter((c) => elegidas.has(c.categoria)).map((c) => ({ ...c, pideMas: dif(c) >= DIFERENCIA_PIDE_MAS }));
  return { filas, piden: piden.map((c) => c.categoria), max: Math.max(1, ...filas.flatMap((f) => [f.vende, f.tiene])) };
}

// ───────────────────────── Por tienda ─────────────────────────

/** Desde cuántas prendas que se acaban, o que no se mueven, una tienda está en «Urgente». */
export const SEDE_URGE_SE_ACABAN = 5;
export const SEDE_URGE_NO_SE_MUEVEN = 10;

/**
 * El estado de una tienda en «Por tienda»: «Todavía no» si esa tienda no puede recibir recomendaciones (ADR-0346); «Urgente» con
 * 5 o más que se acaban o 10 o más que no se mueven; «Atención» si hay alguna; «Va bien» si no hay ninguna.
 */
export function estadoSede(r: Pick<ResumenSedeAnalisis, "seAcaban" | "noSeMueven" | "puedeHablar"> | undefined): Extract<EstadoHoy, "urg" | "ate" | "bien" | "nd"> {
  if (!r || !r.puedeHablar) return "nd";
  if (r.seAcaban >= SEDE_URGE_SE_ACABAN || r.noSeMueven >= SEDE_URGE_NO_SE_MUEVEN) return "urg";
  if (r.seAcaban > 0 || r.noSeMueven > 0) return "ate";
  return "bien";
}

/** Las tres barras de cada tienda y su tope (la barra se llena al llegar al tope). */
export const BARRAS_SEDE = [
  { clave: "seAcaban", texto: "Se acaban", max: 10 },
  { clave: "noSeMueven", texto: "No se mueven", max: 15 },
  { clave: "vendioDe10", texto: "Vendió de 10", max: 10 },
] as const;

export type BarraSede = { clave: (typeof BARRAS_SEDE)[number]["clave"]; texto: string; valor: number | null; n: number };

/**
 * Las barras de una tienda: su cifra y cuánto se llena (de 0 a 1). Una tienda que todavía no puede recibir recomendaciones no
 * muestra cifras (ADR-0346: Análisis se calla donde el dato no alcanza), y «Vendió de 10» sin llegadas tampoco.
 */
export function barrasSede(r: Pick<ResumenSedeAnalisis, "seAcaban" | "noSeMueven" | "vendioDe10" | "puedeHablar"> | undefined): BarraSede[] {
  return BARRAS_SEDE.map((b) => {
    const valor = r && r.puedeHablar ? r[b.clave] : null;
    return { clave: b.clave, texto: b.texto, valor, n: valor === null ? 0 : entre0y1(valor / b.max) };
  });
}

/**
 * Mi tienda con «Liquidar desde» EN VIVO: lo que no se mueve cambia con el control (en «No se vende») antes de guardarse, y así
 * «Por tienda» dice lo mismo que la tarjeta «¿Qué no se mueve?» y la cuenta de la pestaña. Lo demás queda como lo leyó el servidor.
 */
export function resumenEnVivo(r: ResumenSedeAnalisis, prendas: readonly PrendaAnalisis[], liquidarDesde: number): ResumenSedeAnalisis {
  const vivo = resumenDeSede(r.sedeId, prendas, liquidarDesde, r.puedeHablar);
  return { ...r, seAcaban: vivo.seAcaban, noSeMueven: vivo.noSeMueven };
}

// ───────────────────────── Qué hacer hoy: los caminos ─────────────────────────

/** Un camino de «Qué hacer hoy»: un verbo, sus prendas y el grupo del carril al que lleva. */
export type CaminoHoy = {
  /** Único en el flujo: `comprar`, `manda-<sedeId>`, `liquidar`. */
  clave: string;
  /** El grupo del carril que se deja a la vista al tocarlo (`irA(vista, { foco: grupo })`). */
  grupo: Extract<GrupoAnalisis, "comprar" | "enviar" | "liquidar">;
  vista: Extract<VistaAnalisis, "acaba" | "nose">;
  verbo: string;
  icono: "caja" | "camion" | "etiqueta";
  est: Extract<EstadoHoy, "urg" | "ate">;
  prendas: PrendaAnalisis[];
  /** La segunda línea de la etiqueta: «2 agotadas · 3 por llegar». */
  motivo: string;
  /** El camino por donde empezar («empieza aquí»): el de comprar, como en la maqueta. */
  primero: boolean;
};

/** Izquierda: lo que llega a la tienda (se compra). Derecha: lo que sale a otra tienda y lo que se queda y se rebaja. */
export type CaminosHoy = { compra: CaminoHoy | null; manda: CaminoHoy[]; reb: CaminoHoy[] };

/**
 * Los caminos de hoy. «Compra»: todo lo que se acaba (el sistema no decide pedirlo a otra tienda: decisión 7). «Manda a …»: lo que
 * aquí no se vende y en otra tienda sí, un camino por tienda destino (la que más lo vendió), en el orden de `sedes`. «Liquidar»:
 * lo quieto que no se vende en ninguna; urgente si alguna lleva 3 meses o más.
 */
export function caminosDeHoy(prendas: readonly PrendaAnalisis[], liquidarDesde: number, sedes: readonly Pick<SedeAnalisis, "id" | "ciudad">[]): CaminosHoy {
  const comp = prendasDe(prendas, ["comprar"], liquidarDesde).sort(ordenSeAcaba);
  const agotadas = comp.filter((p) => totalEnTienda(p) === 0).length;
  const llegan = comp.filter((p) => porLlegar(p) > 0).length;
  const motivoCompra =
    [agotadas ? `${agotadas} ${plural(agotadas, "agotada", "agotadas")}` : "", llegan ? `${llegan} por llegar` : ""].filter(Boolean).join(" · ") ||
    `Quedan ${DIAS_SE_ACABA} días o menos`;
  const compra: CaminoHoy | null = comp.length
    ? { clave: "comprar", grupo: "comprar", vista: "acaba", verbo: "Compra", icono: "caja", est: "urg", prendas: comp, motivo: motivoCompra, primero: true }
    : null;

  const porDestino = new Map<string, PrendaAnalisis[]>();
  for (const p of prendasDe(prendas, ["enviar"], liquidarDesde).sort(ordenQuietas)) {
    const destino = sedeQueMasVende(p.otras)?.sedeId ?? "";
    porDestino.set(destino, [...(porDestino.get(destino) ?? []), p]);
  }
  const lugar = (id: string) => {
    const i = sedes.findIndex((s) => s.id === id);
    return i < 0 ? sedes.length : i;
  };
  const manda: CaminoHoy[] = [...porDestino.entries()]
    .sort(([a], [b]) => lugar(a) - lugar(b) || a.localeCompare(b))
    .map(([id, ps]) => ({
      clave: `manda-${id}`,
      grupo: "enviar",
      vista: "nose",
      verbo: `Manda a ${sedes.find((s) => s.id === id)?.ciudad ?? "otra tienda"}`,
      icono: "camion",
      est: "ate",
      prendas: ps,
      motivo: "Aquí no se venden; allá sí",
      primero: false,
    }));

  const liq = prendasDe(prendas, ["liquidar"], liquidarDesde).sort(ordenQuietas);
  const viejas = liq.filter((p) => (p.diasSinVender ?? 0) >= DIAS_TRES_MESES).length;
  const reb: CaminoHoy[] = liq.length
    ? [
        {
          clave: "liquidar",
          grupo: "liquidar",
          vista: "nose",
          verbo: "Liquidar",
          icono: "etiqueta",
          est: viejas ? "urg" : "ate",
          prendas: liq,
          motivo: viejas ? `${viejas} con más de 3 meses` : `Más de ${liquidarDesde} días quietas`,
          primero: false,
        },
      ]
    : [];
  return { compra, manda, reb };
}

/** Todos los caminos, en el orden del flujo (izquierda y luego derecha). */
export const todosLosCaminos = (c: CaminosHoy): CaminoHoy[] => [...(c.compra ? [c.compra] : []), ...c.manda, ...c.reb];

/** Los estados que de verdad aparecen en el flujo, en el orden de la leyenda (Urgente, Atención). */
export function estadosDelFlujo(c: CaminosHoy): Extract<EstadoHoy, "urg" | "ate">[] {
  const caminos = todosLosCaminos(c);
  return (["urg", "ate"] as const).filter((e) => caminos.some((x) => x.est === e));
}

/** Cuántas prendas del camino se nombran en su tooltip (el resto se cuenta: «y 12 más»). */
export const TIP_PRENDAS = 8;

/** Las prendas que se nombran en un tooltip y cuántas quedan sin nombrar. */
export function listaTip<T>(prendas: readonly T[]): { mostradas: T[]; resto: number } {
  return { mostradas: prendas.slice(0, TIP_PRENDAS), resto: Math.max(0, prendas.length - TIP_PRENDAS) };
}

/** «Repón el piso»: las que se venden, no tienen nada colgado y sí tienen en el almacén; la que más se vende primero. */
export function paraReponerPiso<T extends Pick<PrendaAnalisis, "vendidas30" | "piso" | "almacen" | "nombre">>(prendas: readonly T[]): T[] {
  return prendas.filter((p) => p.vendidas30 > 0 && p.piso <= 0 && p.almacen > 0).sort((a, b) => b.vendidas30 - a.vendidas30 || a.nombre.localeCompare(b.nombre, "es"));
}

// ───────────────────────── Qué hacer hoy: el dibujo ─────────────────────────

/**
 * Las medidas del flujo, las de la maqueta: el lienzo (W × H), dónde empiezan las columnas (TOPC), las columnas de nodos (LX a la
 * izquierda, RX a la derecha, de NW de ancho), el bloque «Tu tienda» (de CX0 a CX1), el alto mínimo de cada camino (MIN), el hueco
 * entre caminos (GAP), el alto de una franja con título (HDR) y el grosor máximo por prenda (KMAX).
 */
export const FLUJO = { W: 1020, H: 320, TOPC: 30, LX: 286, NW: 12, CX0: 486, CX1: 586, RX: 736, MIN: 30, GAP: 8, HDR: 34, KMAX: 14 } as const;
/** El alto útil de las columnas. */
export const ALTO_COLUMNA = FLUJO.H - FLUJO.TOPC - 4;
/** Lo que el bloque «Tu tienda» suma alrededor de sus cintas (14 arriba y 14 abajo) y su alto mínimo de cintas. */
const BORDE_CENTRO = 28;
const MIN_CENTRO = 40;
/** Cuánto puede crecer de más un hueco cuando sobra lugar. */
const HUECO_EXTRA_MAX = 22;

/** La franja que separa «Se quedan en tu tienda» de «Mándalas» en la columna derecha. */
export const CAB_SE_QUEDAN = "SE QUEDAN EN TU TIENDA";

/** Una entrada de una columna: un título de franja o un camino con su cantidad de prendas. */
export type EntradaColumna<T> = { cab: string } | { camino: T; n: number };

const esCab = <T>(e: EntradaColumna<T> | undefined): e is { cab: string } => e !== undefined && "cab" in e;

/** Las columnas del flujo: a la izquierda «Compra»; a la derecha «Manda a …» y, si hay de los dos, la franja y «Liquidar». */
export function columnasFlujo(c: CaminosHoy): { izq: EntradaColumna<CaminoHoy>[]; der: EntradaColumna<CaminoHoy>[] } {
  const entrada = (x: CaminoHoy): EntradaColumna<CaminoHoy> => ({ camino: x, n: x.prendas.length });
  const izq = c.compra ? [entrada(c.compra)] : [];
  const der: EntradaColumna<CaminoHoy>[] = [...c.manda.map(entrada), ...(c.reb.length && c.manda.length ? [{ cab: CAB_SE_QUEDAN }] : []), ...c.reb.map(entrada)];
  return { izq, der };
}

/** Los títulos de arriba de cada columna (null si la columna está vacía: no se nombra lo que no hay). */
export function titulosFlujo(c: CaminosHoy): { izq: string | null; der: string | null } {
  return { izq: c.compra ? "CÓMPRALAS" : null, der: c.manda.length ? "MÁNDALAS A OTRA TIENDA" : c.reb.length ? CAB_SE_QUEDAN : null };
}

/** Cuánto alto pide una columna si cada prenda mide `k`: cada camino al menos MIN, los huecos entre caminos y las franjas. */
export function altoNecesario<T>(col: readonly EntradaColumna<T>[], k: number): number {
  return col.reduce((acc, e, i) => {
    if (esCab(e)) return acc + FLUJO.HDR;
    const siguiente = col[i + 1];
    return acc + Math.max(FLUJO.MIN, k * e.n) + (siguiente !== undefined && !esCab(siguiente) ? FLUJO.GAP : 0);
  }, 0);
}

/** Un camino ya ubicado: su banda en la columna (y0–y1), el centro y el fondo de su lugar (cy, yb) y dónde entra al centro (c0–c1). */
export type BandaFlujo<T> = { camino: T; n: number; y0: number; y1: number; cy: number; yb: number; c0: number; c1: number };

export type GeometriaFlujo<T> = {
  /** El grosor de cada prenda. */
  k: number;
  izq: BandaFlujo<T>[];
  der: BandaFlujo<T>[];
  /** El fondo de la franja con título (de su título al último camino de la columna); null si la columna no tiene. */
  franjaIzq: { texto: string; y: number; alto: number } | null;
  franjaDer: { texto: string; y: number; alto: number } | null;
  /** El bloque «Tu tienda». */
  centro: { y: number; alto: number };
};

/**
 * Ubica el flujo (la cuenta de `queHacer()` de la maqueta). El grosor por prenda `k` es el más grande con que las dos columnas y
 * el bloque «Tu tienda» caben en el alto fijo, y nunca más de KMAX: pocas prendas no se vuelven una mancha. Lo que sobra se reparte
 * en los huecos (hasta 22 de más cada uno) y la columna queda centrada.
 */
export function geometriaFlujo<T>(izq: readonly EntradaColumna<T>[], der: readonly EntradaColumna<T>[]): GeometriaFlujo<T> {
  const suma = (col: readonly EntradaColumna<T>[]) => col.reduce((s, e) => s + (esCab(e) ? 0 : e.n), 0);
  const nL = suma(izq);
  const nR = suma(der);
  const cabe = (k: number) =>
    altoNecesario(izq, k) <= ALTO_COLUMNA && altoNecesario(der, k) <= ALTO_COLUMNA && Math.max(k * nL, k * nR, MIN_CENTRO) + BORDE_CENTRO <= ALTO_COLUMNA;
  let lo = 0;
  let hi = 400;
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    const m = (lo + hi) / 2;
    if (cabe(m)) lo = m;
    else hi = m;
  }
  const k = Math.min(lo, FLUJO.KMAX);

  const ubicar = (col: readonly EntradaColumna<T>[]) => {
    const esHueco = (i: number) => !esCab(col[i]) && i < col.length - 1 && !esCab(col[i + 1]);
    const huecos = col.filter((_, i) => esHueco(i)).length;
    const libre = ALTO_COLUMNA - altoNecesario(col, k);
    const extra = huecos ? Math.max(0, Math.min(libre / huecos, HUECO_EXTRA_MAX)) : 0;
    let y = FLUJO.TOPC + Math.max(0, (libre - extra * huecos) / 2);
    const bandas: BandaFlujo<T>[] = [];
    let cab: { texto: string; y: number } | null = null;
    for (const [i, e] of col.entries()) {
      if (esCab(e)) {
        cab ??= { texto: e.cab, y };
        y += FLUJO.HDR;
        continue;
      }
      const lugar = Math.max(FLUJO.MIN, k * e.n);
      const grosor = k * e.n;
      const y0 = y + (lugar - grosor) / 2;
      bandas.push({ camino: e.camino, n: e.n, y0, y1: y0 + grosor, cy: y + lugar / 2, yb: y + lugar, c0: 0, c1: 0 });
      y += lugar + (esHueco(i) ? FLUJO.GAP + extra : 0);
    }
    // La franja va de su título al fondo del último camino (los títulos siempre van antes de sus caminos).
    const ultima = bandas[bandas.length - 1];
    const franja = cab && ultima && ultima.yb > cab.y ? { texto: cab.texto, y: cab.y + 2, alto: ultima.yb - cab.y + 2 } : null;
    return { bandas, franja };
  };
  const L = ubicar(izq);
  const R = ubicar(der);

  // El bloque «Tu tienda»: tan alto como la columna más gruesa más su borde, centrado en el alto útil. Las cintas entran pegadas.
  const alto = Math.max(k * nL, k * nR, MIN_CENTRO) + BORDE_CENTRO;
  const y = FLUJO.TOPC + (ALTO_COLUMNA - alto) / 2;
  const entrar = (bandas: BandaFlujo<T>[], n: number) => {
    let q = y + (alto - k * n) / 2;
    for (const b of bandas) {
      b.c0 = q;
      q += k * b.n;
      b.c1 = q;
    }
  };
  entrar(L.bandas, nL);
  entrar(R.bandas, nR);
  return { k, izq: L.bandas, der: R.bandas, franjaIzq: L.franja, franjaDer: R.franja, centro: { y, alto } };
}

/** Redondea a una décima (las coordenadas del dibujo: el mismo texto en el servidor y en el navegador). */
export const px = (x: number): number => Math.round(x * 10) / 10;

/** La cinta entre un nodo y el centro: dos curvas que van de la banda (xa, ya0–ya1) a la otra (xb, yb0–yb1), cerradas. */
export function cintaFlujo(xa: number, ya0: number, ya1: number, xb: number, yb0: number, yb1: number): string {
  const m = px((xa + xb) / 2);
  const [a, a0, a1, b, b0, b1] = [xa, ya0, ya1, xb, yb0, yb1].map(px);
  return `M${a},${a0} C${m},${a0} ${m},${b0} ${b},${b0} L${b},${b1} C${m},${b1} ${m},${a1} ${a},${a1} Z`;
}

/** El texto de la pastilla de un camino: «5 prendas», y en el primero, «5 prendas · empieza aquí». */
export function textoPastilla(c: Pick<CaminoHoy, "prendas" | "primero">): string {
  const n = c.prendas.length;
  return `${n} ${plural(n, "prenda", "prendas")}${c.primero ? " · empieza aquí" : ""}`;
}

/** Dónde va la pastilla de un camino: junto a su nodo, centrada en su lugar (el ancho sale del largo del texto). */
export function pastillaFlujo(texto: string, cy: number, lado: "izq" | "der"): { x: number; y: number; w: number; h: number } {
  const w = Math.round(texto.length * 6.4 + 20);
  const h = 20;
  return { x: lado === "izq" ? FLUJO.LX + FLUJO.NW + 8 : FLUJO.RX - 8 - w, y: cy - h / 2, w, h };
}

/** Dónde va la etiqueta de un camino (verbo, miniaturas y motivo): por fuera de su nodo, 44 de alto. */
export function etiquetaFlujo(cy: number, lado: "izq" | "der"): { x: number; y: number; w: number; h: number } {
  return lado === "izq"
    ? { x: 0, y: cy - 22, w: FLUJO.LX - 10, h: 44 }
    : { x: FLUJO.RX + FLUJO.NW + 8, y: cy - 22, w: FLUJO.W - FLUJO.RX - FLUJO.NW - 8, h: 44 };
}
