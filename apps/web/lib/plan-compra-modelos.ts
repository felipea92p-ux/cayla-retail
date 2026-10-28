// Plan de campaña ▸ Paso 2 (ADR-0526, tarea #9 de la auditoría, Felipe 2026-10-26; spike ⑥ «Ranking de modelos» dentro de la hoja de la categoría de ③): de las prendas que el paso 1 decidió comprar
// de una categoría, qué modelos repetir y de cada uno qué colores y tallas. Lógica pura, sin React ni red.
//
// EL PROBLEMA. El paso 1 dice «compra 414 Polos»; quien compra tiene que decir CUÁLES. El sistema sabe qué modelos vendieron y con qué colores y tallas, pero con pocas ventas por prenda («una prenda
// nueva vende 1 o 2 en su vida en una tienda») no puede decir «compra 7 de esta azul talla M»: solo puede decir qué modelos conviene REPETIR y, de lo que no alcanza a nombrar, dar una guía. Por eso el
// reparto es en dos mitades: un % del total para modelos que ya vendieron (el sistema propone un valor; la persona lo cambia) y el resto, «modelos nuevos por elegir».
//
// CONTRATO
//   PROMETE: el total del paso 1 nunca se cambia aquí (lo que se reparte + lo que queda para modelos nuevos = el total, salvo que la persona se pase, y entonces lo dice y no deja guardar); todo son
//            enteros y cada nivel suma lo de abajo (las tallas suman el color, los colores suman el modelo, los modelos + los nuevos suman el total); un modelo con menos de 5 ventas no se propone para
//            repetir; con pocas ventas el reparto se apoya en uno parejo (el mismo n/(n+10) de la curva de tallas del paso 1); y lo ya guardado se restaura EXACTO.
//   NO HACE: no lee ni escribe la base (eso es la pantalla y `guardar_plan_compra_paso_2`), no cambia el paso 1 y no inventa modelos: lo que no se reparte en uno que ya vendió queda como «modelos nuevos
//            por elegir», con una guía de colores y tallas, no con un nombre.

import { K_CURVA, repartir, type TallaPlan } from "./plan-compra-reglas";
import { compararTallas } from "./tallas";

export const RPC_MODELOS = "fn_plan_compra_modelos";
export const RPC_PASOS_2 = "fn_plan_compra_pasos_2";
export const RPC_GUARDAR_PASO_2 = "guardar_plan_compra_paso_2";

/** Un modelo con menos ventas que esto no se propone para repetir: con 1 o 2 ventas no hay patrón, solo una prenda que salió. */
export const MIN_VENTAS_PARA_REPETIR = 5;
/** Desde aquí un modelo tiene «base»; entre MIN_VENTAS_PARA_REPETIR y esto, «poco dato». */
export const MIN_VENTAS_CON_BASE = 10;
/** El % de repetir que propone el sistema nunca baja de esto ni sube de aquello (la persona puede poner cualquiera de 0 a 100). */
export const PCT_MINIMO_PROPUESTO = 20;
export const PCT_MAXIMO_PROPUESTO = 80;
/** Cuántos colores se le sugieren a quien va a elegir modelos nuevos. */
export const COLORES_DE_LA_GUIA = 7;

// ---------------------------------------------------------------------------------------------------------------------
// Lo que lee la base (`fn_plan_compra_modelos`)
// ---------------------------------------------------------------------------------------------------------------------

export type CeldaDeTalla = { id: string | null; vendidas: number; hay: number };
export type ColorLeido = { codigo: string; nombre: string; hex: string | null; vendidas: number; hay: number; tallas: CeldaDeTalla[] };
export type ModeloLeido = { id: string; nombre: string; codigo: string | null; marca: string | null; vendidas: number; hay: number; colores: ColorLeido[] };
export type ColorDeLaCategoria = { codigo: string; nombre: string; hex: string | null; vendidas: number; hay: number };
/** Una prenda del reparto guardado: modelo, color, talla (null si la categoría no tiene tallas) y cuántas. */
export type ItemDelReparto = { p: string; c: string; t: string | null; n: number };
export type GuardadoPaso2 = { version: number; pct: number; total: number; unidades: number; items: ItemDelReparto[]; por: string | null; en: string | null };

export type LecturaModelos = {
  categoria: { id: string; nombre: string };
  hoy: string;
  /** Las tallas de la categoría, en su orden (XS · S · M · L · XL; 36 · 38 · 40). */
  tallas: TallaPlan[];
  /** Ventas de la categoría sin modelo (anotadas «sin registrar»). */
  sinModelo: number;
  /** Del que más vendió al que menos. */
  modelos: ModeloLeido[];
  /** Cuántos modelos tiene la categoría con ventas o stock; si pasa de los que se mandan, los que menos vendieron se quedaron fuera. */
  modelosTotal: number;
  coloresCategoria: ColorDeLaCategoria[];
  guardado: GuardadoPaso2 | null;
};
/** `fuera`: la categoría no entra a los motores (bolsas, empaque): no se reparte en modelos. */
export type RespuestaModelos = { estado: "lista"; lectura: LecturaModelos } | { estado: "fuera" };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const entero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);

/**
 * Lo que devuelve `fn_plan_compra_modelos`, sin confiar en su forma. null si no se entiende o si la base no trae la marca `soportado` (la web se publicó antes que la migración): sin la lectura,
 * la hoja no ofrece el paso 2. Una fila que no calza se descarta (un modelo sin id, un color sin código).
 */
export function leerModelos(v: unknown): RespuestaModelos | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  if (v.entra === false) return { estado: "fuera" };
  const cat = esObjeto(v.categoria) ? v.categoria : null;
  const catId = cat ? texto(cat.id) : null;
  const hoy = texto(v.hoy);
  if (!cat || !catId || !hoy) return null;
  const tallas = lista(v.tallas)
    .flatMap((t): TallaPlan[] => {
      const id = texto(t.id);
      const valor = texto(t.valor);
      return id && valor ? [{ id, valor }] : [];
    })
    .sort((a, b) => compararTallas(a.valor, b.valor));
  const modelos = lista(v.modelos).flatMap((m): ModeloLeido[] => {
    const id = texto(m.id);
    const nombre = texto(m.nombre);
    if (!id || !nombre) return [];
    const colores = lista(m.colores).flatMap((c): ColorLeido[] => {
      const codigo = texto(c.codigo);
      if (!codigo) return [];
      return [
        {
          codigo,
          nombre: texto(c.nombre) ?? codigo,
          hex: texto(c.hex),
          vendidas: entero(c.vendidas),
          hay: entero(c.hay),
          tallas: lista(c.tallas).map((t) => ({ id: texto(t.id), vendidas: entero(t.vendidas), hay: entero(t.hay) })),
        },
      ];
    });
    return [{ id, nombre, codigo: texto(m.codigo), marca: texto(m.marca), vendidas: entero(m.vendidas), hay: entero(m.hay), colores }];
  });
  const coloresCategoria = lista(v.colores_categoria).flatMap((c): ColorDeLaCategoria[] => {
    const codigo = texto(c.codigo);
    return codigo ? [{ codigo, nombre: texto(c.nombre) ?? codigo, hex: texto(c.hex), vendidas: entero(c.vendidas), hay: entero(c.hay) }] : [];
  });
  const g = esObjeto(v.guardado) ? v.guardado : null;
  const guardado: GuardadoPaso2 | null =
    g && Number.isInteger(g.version) && Array.isArray(g.items)
      ? {
          version: g.version as number,
          pct: entero(g.pct),
          total: entero(g.total),
          unidades: entero(g.unidades),
          items: lista(g.items).flatMap((i): ItemDelReparto[] => {
            const p = texto(i.p);
            const c = texto(i.c);
            const n = entero(i.n);
            return p && c && n > 0 ? [{ p, c, t: texto(i.t), n }] : [];
          }),
          por: texto(g.por),
          en: texto(g.en),
        }
      : null;
  return {
    estado: "lista",
    lectura: { categoria: { id: catId, nombre: texto(cat.nombre) ?? "" }, hoy, tallas, sinModelo: entero(v.sin_modelo), modelos, modelosTotal: entero(v.modelos_total), coloresCategoria, guardado },
  };
}

/** Lo que devuelve `fn_plan_compra_pasos_2`: por categoría, el último reparto guardado. null si la base no lo sabe (la web se publicó antes que la migración). */
export type ResumenDePaso2 = { categoriaId: string; version: number; pct: number; total: number; unidades: number; por: string | null; en: string | null };
export function leerPasos2(v: unknown): ResumenDePaso2[] | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  return lista(v.repartos).flatMap((r): ResumenDePaso2[] => {
    const categoriaId = texto(r.categoria_id);
    return categoriaId && Number.isInteger(r.version) ? [{ categoriaId, version: r.version as number, pct: entero(r.pct), total: entero(r.total), unidades: entero(r.unidades), por: texto(r.por), en: texto(r.en) }] : [];
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Lo que la persona cambió a mano
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Lo que la persona movió: prendas de un modelo, de un color de ese modelo o de cada talla de un color. Todo sube por la cadena talla → color → modelo → total: las tallas suman el color, los colores
 * suman el modelo y los «modelos nuevos» absorben lo que sobra del total. Cambiar un nivel suelta lo que había debajo (cambiar el modelo suelta sus colores y tallas).
 */
export type Ediciones = {
  modelo: ReadonlyMap<string, number>;
  /** Clave: `modelo|color`. */
  color: ReadonlyMap<string, number>;
  /** Clave: `modelo|color`; la fila entera de tallas de ese color (talla → prendas). */
  tallas: ReadonlyMap<string, ReadonlyMap<string, number>>;
};
export const SIN_EDICIONES: Ediciones = { modelo: new Map(), color: new Map(), tallas: new Map() };
export const claveDeColor = (modeloId: string, codigo: string): string => `${modeloId}|${codigo}`;

const sinClavesDe = <V>(m: ReadonlyMap<string, V>, modeloId: string): Map<string, V> => new Map([...m].filter(([k]) => !k.startsWith(`${modeloId}|`)));

export function editarModelo(ed: Ediciones, modeloId: string, unidades: number): Ediciones {
  return { modelo: new Map(ed.modelo).set(modeloId, Math.max(0, Math.round(unidades))), color: sinClavesDe(ed.color, modeloId), tallas: sinClavesDe(ed.tallas, modeloId) };
}

export function editarColor(ed: Ediciones, modeloId: string, codigo: string, unidades: number): Ediciones {
  const k = claveDeColor(modeloId, codigo);
  const tallas = new Map(ed.tallas);
  tallas.delete(k);
  return { modelo: ed.modelo, color: new Map(ed.color).set(k, Math.max(0, Math.round(unidades))), tallas };
}

/** Cambia las prendas de UNA talla de un color: la fila de tallas de ese color se congela como estaba (lo que el sistema propuso) y solo esa talla cambia; el color pasa a ser la suma. */
export function editarTalla(ed: Ediciones, actual: Reparto, modeloId: string, codigo: string, tallaId: string, unidades: number): Ediciones {
  const color = actual.modelos.find((m) => m.id === modeloId)?.colores.find((c) => c.codigo === codigo);
  if (!color) return ed;
  const fila = new Map(color.tallas.flatMap((t) => (t.id === null ? [] : ([[t.id, t.unidades]] as [string, number][]))));
  fila.set(tallaId, Math.max(0, Math.round(unidades)));
  const k = claveDeColor(modeloId, codigo);
  const colorSinEdicion = new Map(ed.color);
  colorSinEdicion.delete(k);
  return { modelo: ed.modelo, color: colorSinEdicion, tallas: new Map(ed.tallas).set(k, fila) };
}

/** «Volver a lo que propone» para un modelo: suelta todo lo que la persona movió en él. */
export function volverALoQuePropone(ed: Ediciones, modeloId: string): Ediciones {
  const modelo = new Map(ed.modelo);
  modelo.delete(modeloId);
  return { modelo, color: sinClavesDe(ed.color, modeloId), tallas: sinClavesDe(ed.tallas, modeloId) };
}

export const hayEdiciones = (ed: Ediciones): boolean => ed.modelo.size + ed.color.size + ed.tallas.size > 0;

// ---------------------------------------------------------------------------------------------------------------------
// El reparto
// ---------------------------------------------------------------------------------------------------------------------

export type EntradaDelReparto = {
  lectura: LecturaModelos;
  /** Lo que el paso 1 decidió comprar. */
  total: number;
  /** Lo que conviene tener para la campaña (lo que ya hay más lo que se compra). */
  objetivo: number;
  /** La curva de tallas del paso 1 (talla → %); vacía = parejo. */
  curva: Readonly<Record<string, number>>;
  /** Los días de ventas del ERP dentro de los 90 (para «alcanza para»); undefined = se mira como 90. */
  dias: number | undefined;
};

export type TallaRepartida = { id: string | null; valor: string; unidades: number };
export type ColorRepartido = { codigo: string; nombre: string; hex: string | null; vendidas: number; hay: number; unidades: number; tallas: TallaRepartida[]; editado: boolean };
export type DatoDelModelo = "base" | "poco" | "pocas";
export type ModeloRepartido = {
  id: string;
  nombre: string;
  marca: string | null;
  vendidas: number;
  hay: number;
  /** ¿Se propone para repetir? (vendió lo suficiente). */
  elegible: boolean;
  dato: DatoDelModelo;
  /** Para cuántos días alcanza lo que hay al ritmo de lo vendido; null sin ventas. */
  alcanza: number | null;
  /** Lo que el sistema propone para este modelo (0 si no es elegible). */
  propone: number;
  /** Lo que queda: la suma de sus colores. */
  unidades: number;
  editado: boolean;
  colores: ColorRepartido[];
};
export type GuiaDeModelosNuevos = { colores: { codigo: string; nombre: string; hex: string | null; unidades: number }[]; tallas: { id: string; valor: string; unidades: number }[] };
export type Reparto = {
  /** El % de repetir que se usó. */
  pct: number;
  /** El que propone el sistema. */
  pctPorDefecto: number;
  modelos: ModeloRepartido[];
  /** Lo repartido en modelos. */
  repartido: number;
  /** Lo que queda para modelos nuevos (0 si la persona se pasó). */
  nuevos: number;
  /** Cuánto se pasa del total del paso 1; 0 si no se pasa. */
  sePasa: number;
  /** Con qué colores y tallas buscar los modelos nuevos; null si no queda nada para ellos. */
  guia: GuiaDeModelosNuevos | null;
  /** ¿Hay algún modelo que vendió lo suficiente para repetirse? Sin ninguno, todo va a modelos nuevos. */
  hayParaRepetir: boolean;
  /** Las ventas de la categoría que tienen modelo y las que no (anotadas «sin registrar»): cuánto del total de ventas se puede nombrar. */
  ventasConModelo: number;
  ventasSinModelo: number;
};

const redondeoDe5 = (x: number) => Math.round(x / 5) * 5;
const limitar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

export function datoDelModelo(vendidas: number): DatoDelModelo {
  return vendidas >= MIN_VENTAS_CON_BASE ? "base" : vendidas >= MIN_VENTAS_PARA_REPETIR ? "poco" : "pocas";
}

/** Lo que dice cada nivel de dato, con el tono de su chip. */
export const TEXTO_DEL_DATO: Record<DatoDelModelo, { texto: string; tono: "verde" | "ambar" | "neutro" }> = {
  base: { texto: "Con base", tono: "verde" },
  poco: { texto: "Poco dato", tono: "ambar" },
  pocas: { texto: "Pocas ventas: no se repite", tono: "neutro" },
};

/** Las tallas de la categoría con su peso en la curva del paso 1 (% → fracción); parejo si la curva no trae nada. */
function pesosDeLaCurva(tallas: readonly TallaPlan[], curva: Readonly<Record<string, number>>): Map<string, number> {
  const crudos = tallas.map((t) => Math.max(0, curva[t.id] ?? 0));
  const suma = crudos.reduce((s, x) => s + x, 0);
  return new Map(tallas.map((t, i) => [t.id, suma > 0 ? crudos[i] / suma : 1 / Math.max(1, tallas.length)]));
}

/** El % de repetir que propone el sistema: lo que falta de los modelos que vendieron lo suficiente, contra todo lo que falta (también de los que no, y de lo vendido sin modelo). */
export function pctPorDefecto(e: Pick<EntradaDelReparto, "lectura" | "objetivo">): number {
  const { modelos, sinModelo } = e.lectura;
  const vendidasConModelo = modelos.reduce((s, m) => s + m.vendidas, 0);
  const n = vendidasConModelo + sinModelo;
  if (n <= 0) return 0;
  const objetivo = Math.max(0, e.objetivo);
  const falta = (m: ModeloLeido) => Math.max(0, (m.vendidas / n) * objetivo - m.hay);
  const faltaElegibles = modelos.reduce((s, m) => (m.vendidas >= MIN_VENTAS_PARA_REPETIR ? s + falta(m) : s), 0);
  if (faltaElegibles <= 0) return 0;
  const faltaOtros = modelos.reduce((s, m) => (m.vendidas < MIN_VENTAS_PARA_REPETIR ? s + falta(m) : s), 0);
  const sinNombre = (sinModelo / n) * objetivo;
  return limitar(redondeoDe5((100 * faltaElegibles) / (faltaElegibles + faltaOtros + sinNombre)), PCT_MINIMO_PROPUESTO, PCT_MAXIMO_PROPUESTO);
}

/**
 * El reparto de lo que el paso 1 decidió: qué modelos, de cada uno sus colores y de cada color sus tallas, y lo que queda para modelos nuevos. `pct` null = el que propone el sistema.
 * Lo que la persona cambió a mano (`ed`) manda sobre lo que se propone.
 */
export function calcularReparto(e: EntradaDelReparto, pct: number | null, ed: Ediciones): Reparto {
  const r = repartoSinMarcas(e, pct, ed);
  if (!hayEdiciones(ed)) return r;
  // «Editado» dice que la persona se apartó de lo que propone el sistema, no que haya algo guardado a mano: un reparto que coincide con la propuesta no lleva marca.
  const propuesta = repartoSinMarcas(e, pct, SIN_EDICIONES);
  const delSistema = new Map(propuesta.modelos.map((m) => [m.id, m]));
  return {
    ...r,
    modelos: r.modelos.map((m) => {
      const p = delSistema.get(m.id);
      const colores = m.colores.map((c, i) => {
        const pc = p?.colores[i];
        return { ...c, editado: !pc || c.unidades !== pc.unidades || c.tallas.some((t, j) => t.unidades !== pc.tallas[j]?.unidades) };
      });
      return { ...m, colores, editado: !p || m.unidades !== p.unidades || colores.some((c) => c.editado) };
    }),
  };
}

function repartoSinMarcas(e: EntradaDelReparto, pct: number | null, ed: Ediciones): Reparto {
  const { lectura } = e;
  const tallas = lectura.tallas;
  const total = Math.max(0, Math.round(e.total));
  const objetivo = Math.max(0, e.objetivo);
  const vendidasConModelo = lectura.modelos.reduce((s, m) => s + m.vendidas, 0);
  const n = vendidasConModelo + lectura.sinModelo;
  const dias = e.dias ?? 90;
  const curva = pesosDeLaCurva(tallas, e.curva);
  const defecto = pctPorDefecto(e);
  const usado = limitar(Math.round(pct ?? defecto), 0, 100);

  // Lo que falta de cada modelo: lo que su parte de las ventas pide tener, menos lo que ya hay. Solo los que vendieron lo suficiente se proponen para repetir.
  const metaDe = (m: ModeloLeido) => (n > 0 ? (m.vendidas / n) * objetivo : 0);
  const faltaDe = (m: ModeloLeido) => Math.max(0, metaDe(m) - m.hay);
  const elegibles = lectura.modelos.filter((m) => m.vendidas >= MIN_VENTAS_PARA_REPETIR);
  const sumaFalta = elegibles.reduce((s, m) => s + faltaDe(m), 0);
  const aRepetir = Math.round((total * usado) / 100);
  // Si ningún modelo falta, no hay a quién repartirle: `repartir` con todos los pesos en 0 repartiría parejo, y eso sería proponer lo que nadie pidió.
  const propuestas = sumaFalta > 0 ? repartir(aRepetir, elegibles.map((m) => ({ id: m.id, peso: faltaDe(m) }))) : new Map<string, number>();

  const modelos: ModeloRepartido[] = lectura.modelos.map((m) => {
    const elegible = m.vendidas >= MIN_VENTAS_PARA_REPETIR;
    const propone = propuestas.get(m.id) ?? 0;
    const base = ed.modelo.get(m.id) ?? propone;

    // Los colores del modelo: lo que vendió cada uno, apoyado en un reparto parejo cuando el modelo tiene pocas ventas (peso n/(n+K): el mismo de la curva de tallas).
    const k = Math.max(1, m.colores.length);
    const w = m.vendidas / (m.vendidas + K_CURVA);
    const parte = (c: ColorLeido) => w * (m.vendidas > 0 ? c.vendidas / m.vendidas : 0) + (1 - w) / k;
    const faltaColor = (c: ColorLeido) => Math.max(0, parte(c) * metaDe(m) - c.hay);
    const hayFalta = m.colores.some((c) => faltaColor(c) > 0);
    const porColor = repartir(base, m.colores.map((c) => ({ id: c.codigo, peso: hayFalta ? faltaColor(c) : parte(c) })));

    // La curva de tallas de ESTE modelo: lo que vendió cada talla, apoyado en la curva del paso 1 cuando vendió poco.
    const vendidasPorTalla = new Map<string, number>();
    for (const c of m.colores) for (const t of c.tallas) if (t.id !== null) vendidasPorTalla.set(t.id, (vendidasPorTalla.get(t.id) ?? 0) + t.vendidas);
    const nTallas = [...vendidasPorTalla.values()].reduce((s, x) => s + x, 0);
    const wT = nTallas / (nTallas + K_CURVA);
    const pesoTalla = (id: string) => wT * (nTallas > 0 ? (vendidasPorTalla.get(id) ?? 0) / nTallas : 0) + (1 - wT) * (curva.get(id) ?? 0);

    const colores: ColorRepartido[] = m.colores.map((c) => {
      const clave = claveDeColor(m.id, c.codigo);
      const filaTallas = ed.tallas.get(clave);
      const quedaEnColor = ed.color.get(clave) ?? porColor.get(c.codigo) ?? 0;
      if (tallas.length === 0) {
        // Una categoría sin tallas (accesorios): el color es lo último.
        return { codigo: c.codigo, nombre: c.nombre, hex: c.hex, vendidas: c.vendidas, hay: c.hay, unidades: quedaEnColor, tallas: [], editado: ed.color.has(clave) };
      }
      const propuestasTalla = repartir(quedaEnColor, tallas.map((t) => ({ id: t.id, peso: pesoTalla(t.id) })));
      const porTalla: TallaRepartida[] = tallas.map((t) => ({ id: t.id, valor: t.valor, unidades: filaTallas ? (filaTallas.get(t.id) ?? 0) : (propuestasTalla.get(t.id) ?? 0) }));
      const unidades = filaTallas ? porTalla.reduce((s, t) => s + t.unidades, 0) : quedaEnColor;
      return { codigo: c.codigo, nombre: c.nombre, hex: c.hex, vendidas: c.vendidas, hay: c.hay, unidades, tallas: porTalla, editado: filaTallas !== undefined || ed.color.has(clave) };
    });
    const unidades = colores.reduce((s, c) => s + c.unidades, 0);
    return {
      id: m.id,
      nombre: m.nombre,
      marca: m.marca,
      vendidas: m.vendidas,
      hay: m.hay,
      elegible,
      dato: datoDelModelo(m.vendidas),
      alcanza: m.vendidas > 0 ? Math.round((m.hay / m.vendidas) * dias) : null,
      propone,
      unidades,
      editado: ed.modelo.has(m.id) || colores.some((c) => c.editado),
      colores,
    };
  });

  const repartido = modelos.reduce((s, m) => s + m.unidades, 0);
  const nuevos = Math.max(0, total - repartido);
  return {
    pct: usado,
    pctPorDefecto: defecto,
    modelos,
    repartido,
    nuevos,
    sePasa: Math.max(0, repartido - total),
    guia: nuevos > 0 ? guiaDeModelosNuevos(lectura, objetivo, curva, nuevos) : null,
    hayParaRepetir: elegibles.length > 0 && sumaFalta > 0,
    ventasConModelo: vendidasConModelo,
    ventasSinModelo: lectura.sinModelo,
  };
}

/** Con qué colores y tallas buscar los modelos nuevos: lo que más vende la categoría, restando lo que ya hay; las tallas, por la curva del paso 1. */
function guiaDeModelosNuevos(lectura: LecturaModelos, objetivo: number, curva: ReadonlyMap<string, number>, nuevos: number): GuiaDeModelosNuevos {
  const colores = lectura.coloresCategoria.slice(0, COLORES_DE_LA_GUIA);
  const vendidas = colores.reduce((s, c) => s + c.vendidas, 0);
  const falta = (c: ColorDeLaCategoria) => (vendidas > 0 ? Math.max(0, (c.vendidas / vendidas) * objetivo - c.hay) : 0);
  const hayFalta = colores.some((c) => falta(c) > 0);
  const porColor = colores.length > 0 ? repartir(nuevos, colores.map((c) => ({ id: c.codigo, peso: hayFalta ? falta(c) : c.vendidas }))) : new Map<string, number>();
  const porTalla = lectura.tallas.length > 0 ? repartir(nuevos, lectura.tallas.map((t) => ({ id: t.id, peso: curva.get(t.id) ?? 0 }))) : new Map<string, number>();
  return {
    colores: colores.map((c) => ({ codigo: c.codigo, nombre: c.nombre, hex: c.hex, unidades: porColor.get(c.codigo) ?? 0 })).filter((c) => c.unidades > 0),
    tallas: lectura.tallas.map((t) => ({ id: t.id, valor: t.valor, unidades: porTalla.get(t.id) ?? 0 })).filter((t) => t.unidades > 0),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Guardar y volver a abrir
// ---------------------------------------------------------------------------------------------------------------------

/** Lo que se le manda a la base: una fila por modelo × color × talla con prendas (null en la talla si la categoría no tiene tallas). */
export function itemsDelReparto(r: Reparto): ItemDelReparto[] {
  return r.modelos.flatMap((m) =>
    m.colores.flatMap((c): ItemDelReparto[] => (c.tallas.length === 0 ? (c.unidades > 0 ? [{ p: m.id, c: c.codigo, t: null, n: c.unidades }] : []) : c.tallas.flatMap((t) => (t.unidades > 0 && t.id !== null ? [{ p: m.id, c: c.codigo, t: t.id, n: t.unidades }] : []))),
    ),
  );
}

/**
 * Lo ya guardado, devuelto a lo que la persona había elegido: EXACTO. Cada modelo que no está en lo guardado queda en 0; cada color que no está, en 0; y las tallas de los que sí están, tal cual
 * (la lectura trae siempre las celdas de lo guardado, aunque ya no tengan ventas ni stock).
 */
export function edicionesDeLoGuardado(lectura: LecturaModelos, guardado: Pick<GuardadoPaso2, "items">): Ediciones {
  const modelo = new Map<string, number>();
  const color = new Map<string, number>();
  const tallas = new Map<string, Map<string, number>>();
  const porModelo = new Map<string, Map<string, ItemDelReparto[]>>();
  for (const i of guardado.items) {
    const colores = porModelo.get(i.p) ?? porModelo.set(i.p, new Map()).get(i.p)!;
    (colores.get(i.c) ?? colores.set(i.c, []).get(i.c)!).push(i);
  }
  for (const m of lectura.modelos) {
    const colores = porModelo.get(m.id);
    if (!colores) {
      modelo.set(m.id, 0);
      continue;
    }
    for (const c of m.colores) {
      const items = colores.get(c.codigo);
      const clave = claveDeColor(m.id, c.codigo);
      if (!items) color.set(clave, 0);
      else if (lectura.tallas.length === 0) color.set(clave, items.reduce((s, i) => s + i.n, 0));
      else tallas.set(clave, new Map(items.flatMap((i) => (i.t === null ? [] : ([[i.t, i.n]] as [string, number][])))));
    }
  }
  return { modelo, color, tallas };
}
