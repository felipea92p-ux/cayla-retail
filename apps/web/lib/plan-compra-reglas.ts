// Plan de campaña (ADR-0349): cuánto comprar por categoría para una campaña (diciembre 2026 primero). Lógica pura, sin React ni red.
//
// EL PROBLEMA. Diciembre triplica un mes promedio y no hay historia para pronosticarlo (Felipe, 2026-10-05). Comprar «lo que se espera
// vender» trata igual dos categorías muy distintas: una donde lo que sobra se vende casi al mismo precio el año siguiente (pasarse
// cuesta poco: conviene comprar de más) y otra que pasa de moda (pasarse cuesta caro: conviene quedarse corto). Es el modelo del
// vendedor de diarios, el mismo que usa Amazon cuando pronostica cuantiles en vez de promedios (docs/investigacion/2026-10-05-…).
//
// LA CUENTA.
//   · Lo que se pierde por cada prenda que faltó: precio − costo (Cu). Por cada prenda que sobró: costo − lo que se recupera (Co),
//     con lo que se recupera = precio × recupero %.
//   · Cuantil crítico = Cu ÷ (Cu + Co): la probabilidad de cubrir la demanda que conviene comprar.
//   · La demanda de la campaña es incierta: tres escenarios (flojo, normal, bueno) forman una distribución triangular; se compra
//     hasta su cuantil crítico, menos lo que ya hay en la red y lo que ya viene en órdenes de compra sin llegar (`porLlegar`,
//     `lib/plan-compra-pedido.ts`, Felipe 2026-10-13).
//   · La curva de tallas la propone el sistema desde lo vendido (con su prenda o anotado) en 90 días, apoyada en un reparto parejo
//     entre las tallas de la categoría con el mismo encogimiento del motor de demanda: n/(n+k), k = 10 unidades.
//
// CONTRATO
//   PROMETE: leer `fn_plan_compra` sin confiar en su forma; las mismas validaciones que `guardar_plan_compra_linea` (para que la guía
//            de foco y el botón digan lo mismo que la base); cantidades enteras que suman exacto (resto mayor).
//   NO HACE: no compra nada ni decide por la persona: propone y muestra el porqué.

import type { PreparacionSede } from "./motor-demanda-reglas";
import type { PropuestaCategoria } from "./plan-compra-propuesta";
import type { PropuestaGuardada } from "./plan-compra-propuesta-guardada";
import type { TiendaReparto } from "./plan-compra-reparto";
import { enCaminoDe, type PedidoCategoria } from "./plan-compra-pedido";
import { compararTallas } from "./tallas";
import { proyectarCampana } from "./plan-compra-historial";
import type { SugeridoDescuento } from "./plan-compra-descuento";
import { DIAS_DE_VENTAS } from "./plan-compra-periodo";

export const RPC_PLAN = "fn_plan_compra";
export const RPC_GUARDAR_LINEA = "guardar_plan_compra_linea";
export const RPC_GUARDAR_TOPE = "guardar_plan_compra_tope";
export const RPC_PLANES = "fn_planes_compra";
export const RPC_CREAR_CAMPANA = "crear_plan_compra";
/** «Campaña nueva» (act. 2026-10-12 f): la etiqueta de campaña en Etiquetas y su plan, en una transacción. */
export const RPC_CAMPANA_NUEVA = "crear_campana_con_plan";
export const RPC_EDITAR_CAMPANA = "editar_plan_compra";
export const RPC_QUITAR_CAMPANA = "quitar_plan_compra";
export const RPC_RESTAURAR_CAMPANA = "restaurar_plan_compra";
/** Cuántas unidades vendidas «valen» igual que el reparto parejo al proponer la curva. */
export const K_CURVA = 10;

export type TallaPlan = { id: string; valor: string };
export type CategoriaPlan = { id: string; nombre: string; prefijo: string | null; familia: string | null; tallas: TallaPlan[] };
export type LineaPlan = {
  categoriaId: string;
  flojo: number;
  normal: number;
  bueno: number;
  precio: number;
  costo: number;
  recuperoPct: number;
  /** El descuento que se supuso para esta categoría en la campaña (0 a 99,99 %). Ausente o 0 = precio de lista. Lo que sobra NO lo lleva:
   *  se recupera sobre el precio de lista, porque se vende después de la campaña (ADR-0499). */
  descuentoPct?: number;
  /** talla_id → porcentaje entero; vacío = sin curva decidida. */
  curva: Record<string, number>;
  nota: string | null;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
  /** La versión de la línea (ADR-0193 aplicada al plan, migración B4): sube en cada guardado. null = la base todavía no la manda. */
  version: number | null;
};
export type LecturaPlan = {
  /** `archivado` (B5): la campaña pedida por la URL está archivada (no sale en el selector). */
  plan: { id: string; nombre: string; desde: string; hasta: string; archivado: boolean };
  hoy: string;
  planes: { id: string; nombre: string }[];
  categorias: CategoriaPlan[];
  lineas: Map<string, LineaPlan>;
  stock: Map<string, number>;
  /** categoría → talla → unidades vendidas en 90 días. */
  vendidoPorTalla: Map<string, Map<string, number>>;
  /** categoría → unidades vendidas dentro de la campaña. */
  vendidoEnCampana: Map<string, number>;
  /**
   * Lo que solo trae la lectura ampliada (ADR-0372, migraciones B1 y B2). **null = la base todavía no lo manda** (la web se publicó antes
   * que la migración): la pantalla esconde esa ayuda en vez de caerse o inventar un cero.
   */
  /** categoría → precio y costo promedio de lo que hay en el catálogo. */
  catalogo: Map<string, { precio: number; costo: number }> | null;
  /** categoría → cuánto hay en cada sede (tiendas y Taller), sin apartados ni Cuarentena. */
  stockSedes: Map<string, { ubicacion: string; unidades: number }[]> | null;
  /** categoría → unidades vendidas en los últimos 30 días. */
  vendido30: Map<string, number> | null;
  /** El tope de inversión: `soportado` = la base ya sabe de topes; `valor` null = sin tope. */
  tope: { soportado: boolean; valor: number | null };
  /** La base ya compara versiones al guardar una categoría (B4): la web le manda la que leyó. false = base vieja, se guarda como antes. */
  conVersion: boolean;
  /** La base ya guarda el descuento supuesto de cada categoría: la web se lo manda. false = base vieja, se guarda como antes y el campo no se ofrece. */
  conDescuento: boolean;
  /** categoría → lo que sugiere la campaña del plan (`lib/plan-compra-descuento.ts`); vacío si la base no lo manda. */
  sugeridosDescuento: Map<string, SugeridoDescuento>;
};

// ---------------------------------------------------------------------------------------------------------------------
// 1. Leer
// ---------------------------------------------------------------------------------------------------------------------

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);

export function leerPlan(v: unknown): LecturaPlan | null {
  if (!esObjeto(v) || !esObjeto(v.plan)) return null;
  const id = texto(v.plan.id);
  const nombre = texto(v.plan.nombre);
  const desde = texto(v.plan.desde);
  const hasta = texto(v.plan.hasta);
  const hoy = texto(v.hoy);
  if (!id || !nombre || !desde || !hasta || !hoy) return null;

  const categorias = lista(v.categorias).flatMap((c): CategoriaPlan[] => {
    const cid = texto(c.id);
    const cnom = texto(c.nombre);
    if (!cid || !cnom) return [];
    const tallas = lista(c.tallas).flatMap((t): TallaPlan[] => (texto(t.id) && texto(t.valor) ? [{ id: t.id as string, valor: t.valor as string }] : []));
    return [{ id: cid, nombre: cnom, prefijo: texto(c.prefijo), familia: texto(c.familia), tallas }];
  });

  const lineas = new Map<string, LineaPlan>();
  for (const l of lista(v.lineas)) {
    const cid = texto(l.categoria_id);
    if (!cid) continue;
    const curva: Record<string, number> = {};
    if (esObjeto(l.curva)) for (const [k, p] of Object.entries(l.curva)) curva[k] = numero(p);
    lineas.set(cid, {
      categoriaId: cid,
      flojo: numero(l.flojo),
      normal: numero(l.normal),
      bueno: numero(l.bueno),
      precio: numero(l.precio),
      costo: numero(l.costo),
      recuperoPct: numero(l.recupero_pct),
      curva,
      nota: texto(l.nota),
      actualizadoPor: texto(l.actualizado_por),
      actualizadoEn: texto(l.updated_at),
      version: typeof l.version === "number" && Number.isInteger(l.version) ? l.version : null,
    });
  }

  const porCategoria = (filas: unknown) => {
    const m = new Map<string, number>();
    for (const f of lista(filas)) {
      const cid = texto(f.categoria_id);
      if (cid) m.set(cid, (m.get(cid) ?? 0) + numero(f.unidades));
    }
    return m;
  };
  const vendidoPorTalla = new Map<string, Map<string, number>>();
  for (const f of lista(v.curvas)) {
    const cid = texto(f.categoria_id);
    const tid = texto(f.talla_id);
    if (!cid || !tid) continue;
    const m = vendidoPorTalla.get(cid) ?? new Map<string, number>();
    m.set(tid, (m.get(tid) ?? 0) + numero(f.unidades));
    vendidoPorTalla.set(cid, m);
  }

  const hay = (clave: string) => Array.isArray(v[clave]);
  const topeLeido = v.plan.tope_inversion === undefined ? null : numero(v.plan.tope_inversion);
  return {
    plan: { id, nombre, desde, hasta, archivado: v.plan.archivado === true },
    hoy,
    planes: lista(v.planes).flatMap((p) => (texto(p.id) && texto(p.nombre) ? [{ id: p.id as string, nombre: p.nombre as string }] : [])),
    categorias,
    lineas,
    stock: porCategoria(v.stock),
    vendidoPorTalla,
    vendidoEnCampana: porCategoria(v.vendido),
    catalogo: hay("catalogo")
      ? new Map(
          lista(v.catalogo).flatMap((f): [string, { precio: number; costo: number }][] => {
            const cid = texto(f.categoria_id);
            const precio = numero(f.precio);
            const costo = numero(f.costo);
            // Un precio o un costo en 0 es «sin dato», no «gratis»: no se ofrece como punto de partida.
            return cid && precio > 0 && costo > 0 ? [[cid, { precio, costo }]] : [];
          }),
        )
      : null,
    stockSedes: hay("stock_sedes")
      ? lista(v.stock_sedes).reduce((m, f) => {
          const cid = texto(f.categoria_id);
          const ubicacion = texto(f.ubicacion);
          const unidades = numero(f.unidades);
          if (cid && ubicacion && unidades > 0) m.set(cid, [...(m.get(cid) ?? []), { ubicacion, unidades }]);
          return m;
        }, new Map<string, { ubicacion: string; unidades: number }[]>())
      : null,
    vendido30: hay("vendido_30") ? porCategoria(v.vendido_30) : null,
    tope: { soportado: v.plan.tope_inversion !== undefined, valor: topeLeido !== null && topeLeido > 0 ? topeLeido : null },
    conVersion: v.con_version === true,
    conDescuento: false,
    sugeridosDescuento: new Map(),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Cuánto comprar
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Cu ÷ (Cu + Co). Si sobrar no cuesta nada (se recupera todo el costo), conviene cubrir el escenario bueno: 1.
 * `descuentoPct` (ADR-0499): en la campaña se vende con descuento, así que lo que se pierde por cada prenda que faltó es el precio CON descuento
 * menos el costo. Lo que sobra se recupera después de la campaña, sobre el precio de lista: el descuento no entra en Co. Si el descuento se
 * come todo el margen, Cu = 0 y el cuantil es 0: comprar cerca del flojo.
 */
export function cuantilCritico(precio: number, costo: number, recuperoPct: number, descuentoPct = 0): number {
  const cu = Math.max(precioEnCampana(precio, descuentoPct) - costo, 0);
  const co = Math.max(costo - (precio * recuperoPct) / 100, 0);
  if (cu + co === 0) return 0.5;
  return cu / (cu + co);
}

/** El precio al que se vende en la campaña: el de lista menos el descuento, a centavos. */
export function precioEnCampana(precio: number, descuentoPct = 0): number {
  const d = Math.min(Math.max(descuentoPct, 0), 100);
  return Math.round(precio * (1 - d / 100) * 100) / 100;
}

export type MargenPorPrenda = {
  /** Lo que queda por prenda al precio de lista. */
  lista: number;
  /** Lo que queda por prenda al precio de la campaña. Negativo = se vende por debajo del costo. */
  enCampana: number;
  /** El precio de la campaña. */
  precioCampana: number;
  /** El margen de la campaña como % de su precio; null si el precio es 0. */
  pctEnCampana: number | null;
  /** Se vende al costo o por debajo (no deja ganancia): hay que avisarlo. */
  pierde: boolean;
};

/** Lo que gana la campaña por prenda, dicho con y sin descuento. null mientras falte el precio o el costo. */
export function margenPorPrenda(precio: number, costo: number, descuentoPct = 0): MargenPorPrenda | null {
  if (!(precio > 0) || !(costo >= 0)) return null;
  const precioCampana = precioEnCampana(precio, descuentoPct);
  const enCampana = Math.round((precioCampana - costo) * 100) / 100;
  return {
    lista: Math.round((precio - costo) * 100) / 100,
    enCampana,
    precioCampana,
    pctEnCampana: precioCampana > 0 ? Math.round((enCampana / precioCampana) * 1000) / 10 : null,
    pierde: enCampana <= 0,
  };
}

/**
 * «Con −20 % ganas S/ 33.92 por prenda en vez de S/ 49.90.» El margen dicho junto al campo del descuento. null si no hay descuento o falta
 * un dato; si el descuento se come el margen lo dice con todas sus letras (nunca un número negativo sin explicar).
 */
export function fraseDelMargen(precio: number, costo: number, descuentoPct: number): string | null {
  if (!(descuentoPct > 0)) return null;
  const m = margenPorPrenda(precio, costo, descuentoPct);
  if (!m) return null;
  const d = `${descuentoPct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;
  if (m.pierde) return `Con −${d} vendes a ${solesES(m.precioCampana)}, que no deja ganancia sobre el costo de ${solesES(costo)}: cada prenda vendida en la campaña no te deja nada o te cuesta.`;
  return `Con −${d} ganas ${solesES(m.enCampana)} por prenda en vez de ${solesES(m.lista)}.`;
}

/** El cuantil p de una triangular (mínimo a, más probable c, máximo b). */
export function cuantilTriangular(a: number, c: number, b: number, p: number): number {
  if (b <= a) return a;
  const q = Math.min(Math.max(p, 0), 1);
  const fc = (c - a) / (b - a);
  return q < fc ? a + Math.sqrt(q * (b - a) * (c - a)) : b - Math.sqrt((1 - q) * (b - a) * (b - c));
}

export type Calculo = {
  /** La probabilidad de cubrir la demanda que conviene (0 a 1). */
  cuantil: number;
  /** Las unidades que conviene tener para la campaña. */
  objetivo: number;
  /** Lo que ya hay en la red más lo que ya viene en órdenes de compra sin llegar: con eso se cuenta para la campaña. */
  stock: number;
  /** Lo que hay que comprar: objetivo − stock, nunca negativo. */
  comprar: number;
  /** Lo que cuesta comprarlo. */
  inversion: number;
};

export function calcular(l: Pick<LineaPlan, "flojo" | "normal" | "bueno" | "precio" | "costo" | "recuperoPct" | "descuentoPct">, stock: number): Calculo {
  const cuantil = cuantilCritico(l.precio, l.costo, l.recuperoPct, l.descuentoPct ?? 0);
  const objetivo = Math.ceil(cuantilTriangular(l.flojo, l.normal, l.bueno, cuantil) - 1e-9);
  const comprar = Math.max(0, objetivo - stock);
  return { cuantil, objetivo, stock, comprar, inversion: Math.round(comprar * l.costo * 100) / 100 };
}

/**
 * El cuantil crítico dicho como lo diría quien compra (ley 3 de Formidable: un veredicto, nunca «62 de cada 100 diciembres»): qué cuesta
 * más, sobrar o quedarse corto, y hacia qué diciembre empuja la compra. Las cinco franjas son las del número, no una regla nueva.
 */
export function lecturaDelCuantil(cuantil: number): { costo: string; compra: string } {
  if (cuantil >= 0.99) return { costo: "lo que sobra se vende casi al costo: sobrar no te cuesta", compra: "cubrir hasta el bueno" };
  if (cuantil >= 0.75) return { costo: "sobrar te cuesta poco frente a quedarte corto", compra: "comprar más cerca del bueno" };
  if (cuantil > 0.6) return { costo: "quedarte corto te cuesta un poco más que sobrar", compra: "comprar un poco por encima del normal" };
  if (cuantil >= 0.4) return { costo: "quedarte corto y sobrar te cuestan parecido", compra: "comprar cerca del normal" };
  return { costo: "sobrar te cuesta caro", compra: "comprar más cerca del flojo" };
}

/** «Lo que sobra se vende casi al costo: sobrar no te cuesta, así que conviene cubrir hasta el bueno.» El porqué del número. */
export function porQue(c: Calculo): string {
  const { costo, compra } = lecturaDelCuantil(c.cuantil);
  return `${costo.charAt(0).toUpperCase()}${costo.slice(1)}, así que conviene ${compra}.`;
}

/**
 * Lo que produce el porcentaje de «Lo que sobra» con el precio y el costo de la hoja, dicho junto al campo mientras se escribe: el número que
 * más mueve la compra no se llena a ciegas (Formidable, 2026-10-10). null mientras falte el precio, el costo o el porcentaje.
 */
export function veredictoDeLoQueSobra(b: Pick<Borrador, "precio" | "costo" | "recupero"> & { descuento?: string }): string | null {
  const precio = leerNumeroDeMonto(b.precio);
  const costo = leerNumeroDeMonto(b.costo);
  const recupero = entero(b.recupero);
  if (precio === null || costo === null || recupero === null || precio <= 0 || costo >= precio || recupero > 100) return null;
  const { costo: cuesta, compra } = lecturaDelCuantil(cuantilCritico(precio, costo, recupero, leerDescuento(b.descuento) ?? 0));
  return `Con ${recupero} %, ${cuesta}. Conviene ${compra}.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Curva de tallas
// ---------------------------------------------------------------------------------------------------------------------

/** Reparte `total` en enteros según `pesos`, sumando exacto (método del resto mayor; empate: el orden de entrada). */
export function repartir(total: number, pesos: readonly { id: string; peso: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const suma = pesos.reduce((s, p) => s + Math.max(p.peso, 0), 0);
  if (pesos.length === 0) return out;
  if (suma === 0) return repartir(total, pesos.map((p) => ({ id: p.id, peso: 1 })));
  const exactos = pesos.map((p, i) => ({ id: p.id, i, exacto: (total * Math.max(p.peso, 0)) / suma }));
  let asignado = 0;
  for (const e of exactos) {
    const base = Math.floor(e.exacto + 1e-9);
    out.set(e.id, base);
    asignado += base;
  }
  const porResto = [...exactos].sort((a, b) => b.exacto - Math.floor(b.exacto + 1e-9) - (a.exacto - Math.floor(a.exacto + 1e-9)) || a.i - b.i);
  for (let k = 0; k < total - asignado; k++) out.set(porResto[k % porResto.length].id, (out.get(porResto[k % porResto.length].id) ?? 0) + 1);
  return out;
}

/**
 * La curva que propone el sistema para una categoría: lo vendido por talla en 90 días, apoyado en el reparto parejo con peso
 * n/(n+K_CURVA) (n = unidades vendidas). En porcentajes enteros que suman 100. Sin tallas, vacía.
 */
export function curvaSugerida(tallas: readonly TallaPlan[], vendido: ReadonlyMap<string, number> | undefined): Record<string, number> {
  if (tallas.length === 0) return {};
  const n = tallas.reduce((s, t) => s + (vendido?.get(t.id) ?? 0), 0);
  const w = n / (n + K_CURVA);
  const pesos = tallas.map((t) => ({ id: t.id, peso: w * (n > 0 ? (vendido?.get(t.id) ?? 0) / n : 0) + (1 - w) / tallas.length }));
  return Object.fromEntries(repartir(100, pesos));
}

/** Cuántas de cada talla comprar, según la curva (o parejo si no hay curva). */
export function comprarPorTalla(total: number, tallas: readonly TallaPlan[], curva: Record<string, number>): Map<string, number> {
  const conCurva = Object.keys(curva).length > 0;
  return repartir(total, tallas.map((t) => ({ id: t.id, peso: conCurva ? (curva[t.id] ?? 0) : 1 })));
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. Validar (lo mismo que `guardar_plan_compra_linea`)
// ---------------------------------------------------------------------------------------------------------------------

export type Borrador = {
  flojo: string;
  normal: string;
  bueno: string;
  precio: string;
  costo: string;
  recupero: string;
  /** El descuento que se supone para la campaña, en %. Opcional: vacío = sin descuento (0). */
  descuento?: string;
  curva: Record<string, string>;
};
export type CampoPlan = "flojo" | "normal" | "bueno" | "precio" | "costo" | "recupero" | "descuento" | "curva";

const entero = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

/**
 * Un monto en soles tal como lo escribe la persona: «1299.50», «1299,50», «1,299.50» o «1 299,50» (las comas o espacios de miles se aceptan;
 * la coma sola, como decimal). Cero vale. null si no se entiende. La MISMA lectura para el tope, el precio y el costo (chaos 2026-10-10: el
 * precio rechazaba «1,299.50» con «Falta: Precio» mientras el tope de la misma pantalla lo aceptaba).
 */
export function leerNumeroDeMonto(t: string): number | null {
  const limpio = t.replace(/\s+/g, "");
  if (!limpio) return null;
  const sinMiles = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(limpio) ? limpio.replace(/,/g, "") : limpio.replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(sinMiles) ? Number(sinMiles) : null;
}

/**
 * El descuento tal como lo escribe la persona: «20», «12,5» o «12.5» (hasta dos decimales). Vacío = sin descuento (0). null si no se entiende.
 * Es el mismo rango que acepta la base (0 a menos de 100): un 100 % deja el precio en cero y no hay nada que planear.
 */
export function leerDescuento(t: string | undefined): number | null {
  const limpio = (t ?? "").replace(/\s+/g, "").replace(",", ".");
  if (limpio === "") return 0;
  return /^\d{1,2}(\.\d{1,2})?$/.test(limpio) ? Number(limpio) : null;
}

/** Topes contra un error de tipeo, no reglas de negocio: ninguna categoría de CAYLA vende 100 000 prendas en una campaña ni una prenda cuesta
 *  S/ 100 000. Sin ellos, un «999999999999» pasaba la guía y la base respondía un error técnico (chaos 2026-10-10). */
export const MAX_UNIDADES_ESCENARIO = 100_000;
export const MAX_MONTO_PRENDA = 100_000;

/** Lo que impide guardar, campo por campo (vacío = se puede). Cada texto dice qué hacer. */
export function problemasDelBorrador(b: Borrador, tallas: readonly TallaPlan[]): Partial<Record<CampoPlan, string>> {
  const p: Partial<Record<CampoPlan, string>> = {};
  const flojo = entero(b.flojo);
  const normal = entero(b.normal);
  const bueno = entero(b.bueno);
  const demasiadas = `Revisa el número: más de ${MAX_UNIDADES_ESCENARIO.toLocaleString("es-PE")} prendas en una campaña no parece de una categoría.`;
  if (flojo === null) p.flojo = "Escribe cuántas venderías si la campaña va floja (puede ser 0).";
  else if (flojo > MAX_UNIDADES_ESCENARIO) p.flojo = demasiadas;
  if (normal === null) p.normal = "Escribe cuántas venderías si la campaña va normal.";
  else if (normal > MAX_UNIDADES_ESCENARIO) p.normal = demasiadas;
  else if (flojo !== null && normal < flojo) p.normal = "El normal no puede ser menos que el flojo.";
  if (bueno === null) p.bueno = "Escribe cuántas venderías si la campaña va buena.";
  else if (bueno > MAX_UNIDADES_ESCENARIO) p.bueno = demasiadas;
  else if (normal !== null && bueno < normal) p.bueno = "El bueno no puede ser menos que el normal.";
  const precio = leerNumeroDeMonto(b.precio);
  const costo = leerNumeroDeMonto(b.costo);
  const caro = `Revisa el monto: más de S/\u00a0${MAX_MONTO_PRENDA.toLocaleString("es-PE")} por prenda no parece real.`;
  if (precio === null || precio <= 0) p.precio = "Escribe el precio de venta promedio de la categoría.";
  else if (precio > MAX_MONTO_PRENDA) p.precio = caro;
  if (costo === null) p.costo = "Escribe el costo promedio por prenda.";
  else if (costo > MAX_MONTO_PRENDA) p.costo = caro;
  else if (precio !== null && costo >= precio) p.costo = "El costo tiene que ser menor que el precio de venta.";
  const recupero = entero(b.recupero);
  if (recupero === null || recupero > 100) p.recupero = "Escribe a qué % del precio vendes lo que sobre (de 0 a 100).";
  if (leerDescuento(b.descuento) === null) p.descuento = "Escribe el descuento en %, de 0 a menos de 100 (déjalo vacío si no hay).";
  const usadas = tallas.filter((t) => (b.curva[t.id] ?? "").trim() !== "");
  if (usadas.length > 0) {
    const valores = tallas.map((t) => entero(b.curva[t.id] ?? "0") ?? NaN);
    const suma = valores.reduce((s, x) => s + x, 0);
    if (valores.some((x) => !Number.isFinite(x) || x > 100)) p.curva = "Cada talla lleva un porcentaje entero de 0 a 100.";
    else if (suma !== 100) p.curva = `La curva suma ${suma} %: tiene que sumar 100 %.`;
  }
  return p;
}

/**
 * Los argumentos de `guardar_plan_compra_linea` desde un borrador válido. `versionEsperada` (B4, ADR-0193): la versión de la línea que la hoja
 * leyó al abrirse (0 = no había plan). Solo se manda si la base ya compara versiones (`conVersion`); sin ella, la llamada es la de siempre.
 */
export function argsGuardar(
  planId: string,
  categoriaId: string,
  b: Borrador,
  tallas: readonly TallaPlan[],
  nota: string,
  versionEsperada?: number,
  /** Solo si la base ya guarda el descuento (`LecturaPlan.conDescuento`): una función que no conoce el parámetro rechazaría la llamada. */
  conDescuento = false,
  /** Lo que la pantalla propuso al guardar (ADR-0520, `propuestaParaGuardar`): la base lo deja en el historial. Una base que todavía no conoce el
   *  parámetro lo rechaza; por eso se guarda con `guardarConPropuesta`, que repite sin él. */
  propuesta?: PropuestaGuardada | null,
) {
  const curva: Record<string, number> = {};
  if (tallas.some((t) => (b.curva[t.id] ?? "").trim() !== "")) for (const t of tallas) curva[t.id] = Number((b.curva[t.id] ?? "0").trim() || "0");
  return {
    p_plan_id: planId,
    p_categoria_id: categoriaId,
    p_flojo: Number(b.flojo.trim()),
    p_normal: Number(b.normal.trim()),
    p_bueno: Number(b.bueno.trim()),
    p_precio: leerNumeroDeMonto(b.precio) ?? NaN,
    p_costo: leerNumeroDeMonto(b.costo) ?? NaN,
    p_recupero_pct: Number(b.recupero.trim()),
    p_curva: curva,
    p_nota: nota.trim() === "" ? null : nota.trim(),
    ...(versionEsperada !== undefined ? { p_version_esperada: versionEsperada } : {}),
    ...(conDescuento ? { p_descuento_pct: leerDescuento(b.descuento) ?? 0 } : {}),
    ...(propuesta ? { p_propuesta: propuesta } : {}),
  };
}

/** La versión que manda la hoja: la mayor entre la que leyó la pantalla y la que devolvió el último guardado de esta tanda (la lectura del
 *  servidor tarda un instante en traerla). 0 = la categoría no tenía plan. undefined = la base todavía no compara versiones. */
export function versionParaGuardar(conVersion: boolean, leida: number | null | undefined, local: number | undefined): number | undefined {
  if (!conVersion) return undefined;
  return Math.max(leida ?? 0, local ?? 0);
}

/** La versión nueva que devuelve `guardar_plan_compra_linea` (B4); null si la base todavía no la manda. */
export function versionDevuelta(data: unknown): number | null {
  return esObjeto(data) && typeof data.version === "number" && Number.isInteger(data.version) ? data.version : null;
}

/** Un descuento como se escribe en el campo: «20», «12.5» (el punto, como el precio y el costo de la misma hoja); 0 = vacío (sin descuento). */
const textoDeDescuento = (n: number) => (n > 0 ? String(n) : "");

/** El borrador para una categoría: lo guardado, o vacío con la curva que propone el sistema. */
export function borradorDe(
  linea: LineaPlan | undefined,
  tallas: readonly TallaPlan[],
  vendido: ReadonlyMap<string, number> | undefined,
  /** Lo que hay en el catálogo (ADR-0372): sin plan guardado, el precio y el costo arrancan con eso en vez de en blanco. */
  catalogo?: { precio: number; costo: number } | null,
  /** El % de lo que sobra de la campaña (C5): sin plan guardado, la categoría arranca con él; se puede cambiar. */
  recuperoDefecto?: number | null,
  /** El descuento que rige para esta categoría según la campaña (ADR-0499): sin plan guardado, la categoría arranca con él; se puede cambiar. */
  descuentoSugerido?: number | null,
): Borrador {
  const curva = linea && Object.keys(linea.curva).length > 0 ? linea.curva : curvaSugerida(tallas, vendido);
  return {
    flojo: linea ? String(linea.flojo) : "",
    normal: linea ? String(linea.normal) : "",
    bueno: linea ? String(linea.bueno) : "",
    precio: linea ? linea.precio.toFixed(2) : catalogo ? catalogo.precio.toFixed(2) : "",
    costo: linea ? linea.costo.toFixed(2) : catalogo ? catalogo.costo.toFixed(2) : "",
    recupero: linea ? String(linea.recuperoPct) : recuperoDefecto != null ? String(recuperoDefecto) : "",
    descuento: textoDeDescuento(linea ? (linea.descuentoPct ?? 0) : (descuentoSugerido ?? 0)),
    curva: Object.fromEntries(Object.entries(curva).map(([k, v]) => [k, String(v)])),
  };
}

/** El borrador como línea (para calcular en vivo mientras se escribe); null si todavía no se puede. */
export function lineaDeBorrador(b: Borrador, tallas: readonly TallaPlan[]): Pick<LineaPlan, "flojo" | "normal" | "bueno" | "precio" | "costo" | "recuperoPct" | "descuentoPct" | "curva"> | null {
  if (Object.keys(problemasDelBorrador(b, tallas)).length > 0) return null;
  const a = argsGuardar("", "", b, tallas, "");
  return { flojo: a.p_flojo, normal: a.p_normal, bueno: a.p_bueno, precio: a.p_precio, costo: a.p_costo, recuperoPct: a.p_recupero_pct, descuentoPct: leerDescuento(b.descuento) ?? 0, curva: a.p_curva };
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. Lo real (en enero)
// ---------------------------------------------------------------------------------------------------------------------

export type EstadoCampana = "antes" | "durante" | "despues";
export const estadoCampana = (hoy: string, desde: string, hasta: string): EstadoCampana => (hoy < desde ? "antes" : hoy > hasta ? "despues" : "durante");

/** «Se vendieron 140: entre el normal (120) y el bueno (180).» Para comparar el supuesto con lo que pasó. */
export function fraseDeLoReal(vendido: number, l: Pick<LineaPlan, "flojo" | "normal" | "bueno">): string {
  const donde =
    vendido < l.flojo ? "menos que el flojo"
    : vendido <= l.normal ? "entre el flojo y el normal"
    : vendido <= l.bueno ? "entre el normal y el bueno"
    : "más que el bueno";
  return `Se vendieron ${vendido}: ${donde}.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// 6. La hoja: una fila por categoría y los totales
// ---------------------------------------------------------------------------------------------------------------------

/** Cómo se escriben las cantidades, el dinero y las fechas en esta pantalla (una sola vez, no en cada componente). */
export const enteroES = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
export const solesES = (n: number) => `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Cuántas categorías son «las que más venden». */
export const TOP_VENTAS = 10;

export type FilaPlan = {
  c: CategoriaPlan;
  linea: LineaPlan | undefined;
  /** Lo que ya hay en la red (libre de apartados y sin Cuarentena). */
  stock: number;
  calculo: Calculo | null;
  /** Lo que se vendió dentro de las fechas de la campaña. */
  vendido: number;
  /** Lo que se vendió en los últimos 90 días, de todas las tallas (con su prenda o anotado «sin registrar»). */
  ventas: number;
  /** Su lugar entre las que más venden (1 a `TOP_VENTAS`), o null si no está entre ellas. Una categoría sin ventas nunca entra. */
  puesto: number | null;
  /** Lo vendido en 30 días, o null si la base todavía no lo manda (ADR-0372 B1). */
  ventas30: number | null;
  /** Dónde está lo que hay (cada sede con su cantidad), o null si la base todavía no lo manda. */
  sedes: { ubicacion: string; unidades: number }[] | null;
  /** Precio y costo promedio del catálogo, o null si no hay o la base todavía no lo manda. */
  catalogo: { precio: number; costo: number } | null;
  /** Flojo, normal y bueno que propone el sistema (C4, `lib/plan-compra-propuesta.ts`); null = no vendió; undefined = la base no lo manda. */
  propuesta?: PropuestaCategoria | null;
  /** Cuándo leyó la pantalla los datos de los que salió `propuesta` (ISO). Se guarda junto al plan (ADR-0520). */
  propuestaLeidaEn?: string;
  /** Los días de ventas que el ERP lleva de verdad dentro de la ventana de 90 (`lib/plan-compra-periodo.ts`); undefined = no se sabe. */
  diasDeVentas?: number;
  /** La misma campaña del año pasado ya está en el ERP, en alguna tienda (`previaDisponible`); undefined = no se sabe. Con `diasDeVentas`, dice cuánto creerle a los números. */
  conCampanaAnterior?: boolean;
  /** El % de lo que sobra de la campaña (C5): con él arranca una categoría sin plan. null = nadie lo fijó todavía. */
  recuperoDefecto?: number | null;
  /** Lo necesario para repartir el objetivo entre las tiendas (`lib/plan-compra-reparto.ts`); undefined = la base no lo manda. */
  reparto?: TiendaReparto[];
  /** Lo ya pedido en órdenes de compra para esta campaña (`lib/plan-compra-pedido.ts`); undefined = nada pedido o la base no lo manda. */
  pedido?: PedidoCategoria;
  /** Lo pedido que todavía no llegó a ninguna tienda: se suma a `stock` en la cuenta de «Comprar». 0 si no hay o la base no lo manda. */
  enCamino: number;
  /** La base guarda el descuento de cada categoría (ADR-0499): la hoja ofrece el campo. false = base vieja, no se ofrece. */
  conDescuento?: boolean;
  /** Lo que sugiere la campaña para esta categoría; null = la campaña no la alcanza; undefined = la base no lo manda. */
  descuentoSugerido?: SugeridoDescuento | null;
};

const sumaDe = (m: ReadonlyMap<string, number> | undefined) => (m ? [...m.values()].reduce((s, n) => s + n, 0) : 0);

function porVentas(a: FilaPlan, b: FilaPlan): number {
  return b.ventas - a.ventas || b.stock - a.stock || a.c.nombre.localeCompare(b.c.nombre, "es");
}

/**
 * Una fila por categoría activa, con su cuenta hecha, ordenada por lo que más vende (la que más vende primero; a igual venta, la de más
 * stock; a igual stock, por nombre). El orden es estable: dos lecturas iguales dan la misma tabla. `ordenarFilas` la reordena.
 * `pedido` (lo pedido en órdenes, por categoría): lo que falta llegar se cuenta como si ya estuviera, así «Comprar» no lo pide dos veces.
 */
export function armarFilas(plan: LecturaPlan, pedido?: ReadonlyMap<string, PedidoCategoria> | null): FilaPlan[] {
  const filas = plan.categorias
    .map((c): FilaPlan => {
      const linea = plan.lineas.get(c.id);
      const stock = plan.stock.get(c.id) ?? 0;
      const delPedido = pedido?.get(c.id);
      const enCamino = enCaminoDe(delPedido);
      return {
        c,
        linea,
        stock,
        calculo: linea ? calcular(linea, stock + enCamino) : null,
        pedido: delPedido,
        enCamino,
        conDescuento: plan.conDescuento,
        descuentoSugerido: plan.conDescuento ? (plan.sugeridosDescuento.get(c.id) ?? null) : undefined,
        vendido: plan.vendidoEnCampana.get(c.id) ?? 0,
        ventas: sumaDe(plan.vendidoPorTalla.get(c.id)),
        puesto: null,
        ventas30: plan.vendido30 ? (plan.vendido30.get(c.id) ?? 0) : null,
        sedes: plan.stockSedes ? (plan.stockSedes.get(c.id) ?? []) : null,
        catalogo: plan.catalogo?.get(c.id) ?? null,
      };
    })
    .sort(porVentas);
  let lugar = 0;
  return filas.map((f) => (f.ventas > 0 && lugar < TOP_VENTAS ? { ...f, puesto: ++lugar } : f));
}

export type TotalesPlan = {
  /** Cuántas categorías ya tienen plan. */
  conPlan: number;
  /** Cuántas categorías hay en total. */
  total: number;
  /** Prendas a comprar, sumando solo las categorías con plan. */
  aComprar: number;
  /** Inversión al costo, sumando solo las categorías con plan. */
  inversion: number;
  /** Lo vendido en la campaña, de TODAS las categorías (con o sin plan). */
  vendido: number;
};

export function totalesDelPlan(filas: readonly FilaPlan[]): TotalesPlan {
  const con = filas.filter((f) => f.linea);
  return {
    conPlan: con.length,
    total: filas.length,
    aComprar: con.reduce((s, f) => s + (f.calculo?.comprar ?? 0), 0),
    inversion: con.reduce((s, f) => s + (f.calculo?.inversion ?? 0), 0),
    vendido: filas.reduce((s, f) => s + f.vendido, 0),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 7. Filtrar, ordenar, plegar y decir en qué momento está la campaña
// ---------------------------------------------------------------------------------------------------------------------

export type FiltroPlan = "todas" | "sin" | "con" | "top" | "agotadas";
export type OrdenPlan = "ventas" | "inversion" | "nombre";

/** Vendía y ya no hay nada: la que primero hay que mirar antes de una campaña. */
export const esAgotada = (f: FilaPlan) => f.stock === 0 && f.ventas > 0;
/** Sin plan, sin stock y sin ventas en 90 días: no hace falta planearla ahora. */
export const sinMovimiento = (f: FilaPlan) => !f.linea && f.stock === 0 && f.ventas === 0;

const PASA: Record<FiltroPlan, (f: FilaPlan) => boolean> = {
  todas: () => true,
  sin: (f) => !f.linea,
  con: (f) => !!f.linea,
  top: (f) => f.puesto !== null,
  agotadas: esAgotada,
};

/** Sin tildes ni mayúsculas, como busca el resto del ERP. */
export const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Lo que dicen la familia y el buscador. Los conteos de las píldoras se sacan de AQUÍ, antes de elegir la píldora. */
export function filtrarFilas(filas: readonly FilaPlan[], { familia = "todas", q = "" }: { familia?: string; q?: string }): FilaPlan[] {
  const buscado = sinTildes(q.trim());
  return filas.filter((f) => (familia === "todas" || f.c.familia === familia) && (!buscado || sinTildes(f.c.nombre).includes(buscado)));
}

export const aplicarFiltro = (filas: readonly FilaPlan[], filtro: FiltroPlan): FilaPlan[] => filas.filter(PASA[filtro]);

/** Cuántas filas tendría cada píldora con lo que dicen la familia y el buscador. */
export function conteosDeFiltros(filas: readonly FilaPlan[]): Record<FiltroPlan, number> {
  return { todas: filas.length, sin: aplicarFiltro(filas, "sin").length, con: aplicarFiltro(filas, "con").length, top: aplicarFiltro(filas, "top").length, agotadas: aplicarFiltro(filas, "agotadas").length };
}

/** Una copia reordenada. «Mayor inversión» deja al final las que no tienen plan (no tienen inversión); a igual cifra, por lo que más venden. */
export function ordenarFilas(filas: readonly FilaPlan[], orden: OrdenPlan): FilaPlan[] {
  const copia = [...filas];
  if (orden === "nombre") return copia.sort((a, b) => a.c.nombre.localeCompare(b.c.nombre, "es"));
  if (orden === "inversion") return copia.sort((a, b) => (b.calculo?.inversion ?? -1) - (a.calculo?.inversion ?? -1) || porVentas(a, b));
  return copia.sort(porVentas);
}

/** Las que no hace falta ver ahora (sin plan, sin stock, sin ventas) aparte de las que sí. */
export function plegarSinMovimiento(filas: readonly FilaPlan[]): { visibles: FilaPlan[]; plegadas: FilaPlan[] } {
  return { visibles: filas.filter((f) => !sinMovimiento(f)), plegadas: filas.filter(sinMovimiento) };
}

export type Momento = { estado: EstadoCampana; /** Lo importante, en negrita: «Faltan 52 días». */ fuerte: string; /** Lo que sigue. */ resto: string };

/** Días de calendario entre dos fechas `AAAA-MM-DD`, sin que el huso o el horario de verano muevan el resultado. */
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** En qué momento está la campaña, dicho como lo diría una persona: cuánto falta, en qué día va o hace cuánto terminó. */
export function momentoDeLaCampana(hoy: string, desde: string, hasta: string): Momento {
  const estado = estadoCampana(hoy, desde, hasta);
  const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
  if (estado === "antes") {
    const n = diasEntre(hoy, desde);
    return { estado, fuerte: n === 1 ? "Falta 1 día" : `Faltan ${n} días`, resto: "para que empiece" };
  }
  if (estado === "durante") {
    // Lo que queda, no lo que ya dice la tabla («lo que se vendió va al lado» repetía la frase de arriba; prompt maestro 2026-10-13).
    const quedan = diasEntre(hoy, hasta);
    return { estado, fuerte: `Día ${diasEntre(desde, hoy) + 1} de ${diasEntre(desde, hasta) + 1}`, resto: quedan === 0 ? "termina hoy" : quedan === 1 ? "termina mañana" : `termina en ${quedan} días` };
  }
  return { estado, fuerte: `Terminó hace ${dias(diasEntre(hasta, hoy))}`, resto: "mira lo que pasó contra lo que supusiste" };
}

// ---------------------------------------------------------------------------------------------------------------------
// 8. La barra de rango
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Lo que vale el 100 % de la barra de una categoría: lo más lejos que llega algo (el bueno, lo que conviene tener, lo que ya hay o lo
 * vendido) con un 10 % de aire, para que ninguna marca quede pegada al borde. Todo el dibujo se mide contra este número.
 */
export function escalaDeRango(l: Pick<LineaPlan, "bueno">, calculo: Pick<Calculo, "objetivo" | "stock">, vendido = 0): number {
  return Math.max(l.bueno, calculo.objetivo, calculo.stock, vendido, 1) * 1.1;
}

/** Dónde cae un valor en la escala, de 0 a 100. */
export const posicionEnEscala = (valor: number, escala: number): number => (escala > 0 ? Math.min(100, Math.max(0, (valor / escala) * 100)) : 0);

// ---------------------------------------------------------------------------------------------------------------------
// 9. Ayudas para llenar una categoría
// ---------------------------------------------------------------------------------------------------------------------

/**
 * El «normal» cuando la base todavía no manda la propuesta de tres escenarios (C4): lo que la categoría vende por día en los últimos 90
 * días, llevado a los días de ESTA campaña (la misma regla del normal de C4, que reemplazó a «diciembre triplica un mes», R-19: con ella,
 * San Valentín de dos semanas pedía tres meses de venta). Sin ventas o sin días, no hay qué proponer (null). `diasConVentas`: los días
 * que el ERP lleva de verdad dentro de esos 90 (`diasDeVentasDelErp`); con 26 días, dividir por 90 proponía una tercera parte de lo que se vende.
 */
export function propuestaDeNormal(ventas90: number, diasCampana: number, diasConVentas: number = DIAS_DE_VENTAS): number | null {
  if (!Number.isFinite(ventas90) || ventas90 <= 0 || !Number.isFinite(diasCampana) || diasCampana <= 0) return null;
  if (!Number.isFinite(diasConVentas) || diasConVentas <= 0) return null;
  return Math.round((ventas90 / Math.min(diasConVentas, DIAS_DE_VENTAS)) * diasCampana);
}

/**
 * La siguiente categoría que conviene armar: la que más vende de las que no tienen plan y algo se mueve (stock o ventas). `excluir` son
 * las que ya se guardaron en esta tanda: la lectura del servidor tarda un instante en traerlas y la hoja no debe volver a ofrecerlas.
 * `filas` ya viene ordenada por lo que más vende (`armarFilas`).
 */
export function siguienteSinPlan(filas: readonly FilaPlan[], excluir: readonly string[] = []): FilaPlan | null {
  return filas.find((f) => !f.linea && !excluir.includes(f.c.id) && (f.stock > 0 || f.ventas > 0)) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 10. El paso a paso: una categoría a la vez
// ---------------------------------------------------------------------------------------------------------------------

/** Qué recorre el paso a paso: solo las que más venden, o todas las que se mueven. */
export type AlcancePaso = "top" | "todas";

/** Las categorías de la tanda, en el orden en que vienen (`armarFilas`: la que más vende primero). Las que no se mueven no entran a «todas». */
export function colaDelPaso(filas: readonly FilaPlan[], alcance: AlcancePaso): FilaPlan[] {
  return filas.filter((f) => (alcance === "top" ? f.puesto !== null : f.stock > 0 || f.ventas > 0 || !!f.linea));
}

/**
 * Lo que falta por llenar de la tanda, en el orden en que se ofrece: primero las que nadie ha saltado, y las saltadas al final (no se
 * pierden, vuelven cuando no queda otra). `hechas` son las que se guardaron en esta tanda: la lectura del servidor tarda un instante en
 * traerlas y no deben volver a ofrecerse.
 */
export function pendientesDelPaso(cola: readonly FilaPlan[], hechas: readonly string[] = [], saltadas: readonly string[] = []): FilaPlan[] {
  const faltan = cola.filter((f) => !f.linea && !hechas.includes(f.c.id));
  return [...faltan.filter((f) => !saltadas.includes(f.c.id)), ...faltan.filter((f) => saltadas.includes(f.c.id))];
}

/** Cuántas de la tanda ya tienen plan (las que ya venían con plan y las guardadas ahora). */
export function avanceDelPaso(cola: readonly FilaPlan[], hechas: readonly string[] = []): { hechas: number; total: number } {
  return { hechas: cola.filter((f) => !!f.linea || hechas.includes(f.c.id)).length, total: cola.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// 11. ¿Se le puede creer al «Hay hoy»?
// ---------------------------------------------------------------------------------------------------------------------

export type SedeStock = {
  nombre: string;
  /** El piso se cuadró y el almacén se contó: el stock de esta tienda se puede creer. */
  alDia: boolean;
  /** Lo que falta, dicho corto («piso sin cuadrar»), o null si está al día. */
  falta: string | null;
};

/**
 * El número del botón «Resumen y avisos» (Felipe 2026-10-12: el resumen va en un cajón y la tabla queda a la vista): cuántas tiendas no
 * tienen su stock al día; 1 si no se pudo comprobar (no se dice «todo bien» por un error). 0 = el botón va sin número.
 */
export function avisosDelResumen(c: Pick<ConfianzaDelStock, "estado" | "sedes">): number {
  if (c.estado === "sin-dato") return 1;
  if (c.estado === "confiable") return 0;
  return c.sedes.filter((s) => !s.alDia).length;
}

export type ConfianzaDelStock = {
  /** `sin-dato`: no se pudo comprobar (la lectura falló o la cuenta no opera ninguna tienda). Nunca se dice «confiable» por omisión. */
  estado: "confiable" | "incompleto" | "sin-dato";
  sedes: SedeStock[];
};

/**
 * «Comprar = lo que conviene tener − lo que hay hoy»: si el «hay hoy» está incompleto, la compra sale inflada y nadie lo ve. El motor de
 * demanda (ADR-0346) ya sabe, tienda por tienda, si su piso se cuadró y su almacén se contó; aquí solo se lee esa respuesta. Una
 * condición que no aparece cuenta como «no se cumple» (nunca se inventa una tienda al día). Solo mira las tiendas: el stock del Taller
 * no lo verifica el motor.
 */
export function confianzaDelStock(lectura: { sedes: readonly Pick<PreparacionSede, "nombre" | "condiciones">[]; falla: string | null }): ConfianzaDelStock {
  if (lectura.falla !== null || lectura.sedes.length === 0) return { estado: "sin-dato", sedes: [] };
  const sedes = lectura.sedes.map((s): SedeStock => {
    const cumple = (clave: "piso_cuadrado" | "almacen_contado") => s.condiciones.find((c) => c.clave === clave)?.cumple === true;
    const faltan = [cumple("piso_cuadrado") ? null : "piso sin cuadrar", cumple("almacen_contado") ? null : "almacén sin contar"].filter((f): f is string => f !== null);
    return { nombre: s.nombre, alDia: faltan.length === 0, falta: faltan.length === 0 ? null : faltan.join(" y ") };
  });
  return { estado: sedes.every((x) => x.alDia) ? "confiable" : "incompleto", sedes };
}

// ---------------------------------------------------------------------------------------------------------------------
// 12. La lista de compra (exportar)
// ---------------------------------------------------------------------------------------------------------------------

export type FilaListaCompra = {
  categoria: string;
  comprar: number;
  /** «S 20 · M 35 · L 30»: cuántas de cada talla, en el orden de siempre; «—» si la categoría no tiene tallas. */
  porTalla: string;
  inversion: number;
};

/**
 * Lo que se lleva al proveedor: solo las categorías con plan y algo que comprar, la que más cuesta primero (a igual cifra, por nombre).
 * Una categoría con plan que no necesita comprar (ya hay de sobra) no es una línea de la lista, pero tampoco cambia el total.
 */
export function filasDeLaListaDeCompra(filas: readonly FilaPlan[]): FilaListaCompra[] {
  return filas
    .flatMap((f): FilaListaCompra[] => {
      if (!f.linea || !f.calculo || f.calculo.comprar <= 0) return [];
      const tallas = [...f.c.tallas].sort((a, b) => compararTallas(a.valor, b.valor));
      const reparto = comprarPorTalla(f.calculo.comprar, tallas, f.linea.curva);
      const porTalla = tallas
        .map((t) => [t.valor, reparto.get(t.id) ?? 0] as const)
        .filter(([, n]) => n > 0)
        .map(([v, n]) => `${v} ${n}`)
        .join(" · ");
      return [{ categoria: f.c.nombre, comprar: f.calculo.comprar, porTalla: porTalla || "—", inversion: f.calculo.inversion }];
    })
    .sort((a, b) => b.inversion - a.inversion || a.categoria.localeCompare(b.categoria, "es"));
}

/** Un texto que empieza con = + - @ lo lee Excel como una fórmula: se le antepone una comilla para que sea solo texto. */
export const comoTextoDeExcel = (t: string): string => (/^[=+\-@\t\r]/.test(t) ? `'${t}` : t);

export const ENCABEZADOS_LISTA_COMPRA = ["Categoría", "Comprar", "Por talla", "Inversión (S/)"] as const;

/** Las filas del CSV, con el total al final. */
export function filasDelCsvDeCompra(lista: readonly FilaListaCompra[]): (string | number)[][] {
  const total = lista.reduce((s, f) => ({ comprar: s.comprar + f.comprar, inversion: s.inversion + f.inversion }), { comprar: 0, inversion: 0 });
  return [
    ...lista.map((f) => [comoTextoDeExcel(f.categoria), f.comprar, comoTextoDeExcel(f.porTalla), f.inversion.toFixed(2)]),
    ["Total", total.comprar, "", total.inversion.toFixed(2)],
  ];
}

/** «lista-de-compra-diciembre-2026.csv»: sin tildes, sin espacios ni signos. */
export function nombreDelArchivoDeCompra(planNombre: string): string {
  const limpio = sinTildes(planNombre).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `lista-de-compra-${limpio || "campana"}.csv`;
}

// ---------------------------------------------------------------------------------------------------------------------
// 13. El tope de inversión (ADR-0372, B2)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Un monto escrito como lo escribe una persona: «12000», «12,000», «12 000», «12000.50», «12000,50», «1,234,567.89». La coma que separa
 * grupos de tres cifras («12,000») es de miles; cualquier otra coma es el decimal. Devuelve null si no es un monto o no es mayor que cero.
 */
export function leerMonto(t: string): number | null {
  const n = leerNumeroDeMonto(t);
  return n !== null && n > 0 && n <= 9_999_999_999 ? n : null;
}

/** Lo que impide guardar el tope (vacío = se puede). */
export const problemaDelTope = (t: string): string | null => (leerMonto(t) === null ? "Escribe cuánto quieres invertir, en soles (un número mayor que cero)." : null);

/** Los argumentos de `guardar_plan_compra_tope`. `null` quita el tope. */
export const argsGuardarTope = (planId: string, t: string | null) => ({ p_plan_id: planId, p_tope: t === null ? null : leerMonto(t) });

export type EfectoEnElTope = { total: number; porcentaje: number; excede: number };

/** Lo que llevarías invertido si esta categoría quedara así, contra el tope: el total, el % del tope y cuánto te pasas (0 si no). */
export function efectoEnElTope(inversionDeLasDemas: number, inversionDeEsta: number, tope: number): EfectoEnElTope {
  const total = Math.round((inversionDeLasDemas + inversionDeEsta) * 100) / 100;
  return { total, porcentaje: Math.round((total / tope) * 100), excede: Math.max(0, Math.round((total - tope) * 100) / 100) };
}

export type SegmentoTope = { clave: string; nombre: string; valor: number };

/** La barra del tope: las 5 categorías que más cuestan, una por una, y el resto junto en «Otras». Solo las que tienen plan y cuestan algo. */
export function segmentosDelTope(filas: readonly FilaPlan[]): SegmentoTope[] {
  const caras = filas
    .filter((f) => f.calculo && f.calculo.inversion > 0)
    .sort((a, b) => (b.calculo?.inversion ?? 0) - (a.calculo?.inversion ?? 0) || a.c.nombre.localeCompare(b.c.nombre, "es"));
  const cinco = caras.slice(0, 5).map((f) => ({ clave: f.c.id, nombre: f.c.nombre, valor: f.calculo!.inversion }));
  const resto = caras.slice(5).reduce((s, f) => s + (f.calculo?.inversion ?? 0), 0);
  return resto > 0 ? [...cinco, { clave: "otras", nombre: "Otras", valor: Math.round(resto * 100) / 100 }] : cinco;
}

// ---------------------------------------------------------------------------------------------------------------------
// 14. Varias campañas (ADR-0372, B3): el selector y «Nueva campaña»
// ---------------------------------------------------------------------------------------------------------------------

/** Una campaña con plan, para el selector. `conPlan`: cuántas categorías ya tienen su plan. `archivado` y `conTope` (B5): si salió del selector y
 *  si tiene un tope fijado (con categorías o con tope, «Quitar» la archiva en vez de borrarla). */
export type CampanaPlan = { id: string; nombre: string; desde: string; hasta: string; etiquetaId: string | null; conPlan: number; archivado: boolean; conTope: boolean };
/** Una campaña de Catálogo ▸ Etiquetas (aprobada). Sus fechas son las de un año y vuelven cada año (como en Historial); sin fechas, null.
 *  `planes`: los planes que ya tiene, con el año en que termina cada uno (uno por año, act. 2026-10-12 f); `planId`, el del último año. */
export type EtiquetaCampana = { id: string; nombre: string; desde: string | null; hasta: string | null; planId: string | null; planes: { id: string; anio: number }[] };
/** `edicion` (B5): la base ya sabe editar, quitar y restaurar campañas; si no, la pantalla esconde esas opciones. */
export type CampanasLeidas = { planes: CampanaPlan[]; etiquetas: EtiquetaCampana[]; edicion: boolean };

const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Lo que devuelve `fn_planes_compra`. Una fila que no calza se descarta; una forma rara entera, null (la pantalla se queda sin selector). */
export function leerCampanas(v: unknown): CampanasLeidas | null {
  if (!esObjeto(v)) return null;
  const planes = lista(v.planes).flatMap((p): CampanaPlan[] => {
    const id = texto(p.id);
    const nombre = texto(p.nombre);
    const desde = fechaIso(p.desde);
    const hasta = fechaIso(p.hasta);
    return id && nombre && desde && hasta
      ? [{ id, nombre, desde, hasta, etiquetaId: texto(p.etiqueta_id), conPlan: numero(p.con_plan), archivado: p.archivado === true, conTope: p.con_tope === true }]
      : [];
  });
  const etiquetas = lista(v.etiquetas).flatMap((e): EtiquetaCampana[] => {
    const id = texto(e.id);
    const nombre = texto(e.nombre);
    const desde = fechaIso(e.desde);
    const hasta = fechaIso(e.hasta);
    // Sin fechas también entra (desde 2026-10-12 f): el selector le dice al líder que se las ponga en Etiquetas, en vez de esconderla.
    const planes = lista(e.planes).flatMap((x) => {
      const pid = texto(x.id);
      const anio = numero(x.anio);
      return pid && anio > 0 ? [{ id: pid, anio }] : [];
    });
    return id && nombre ? [{ id, nombre, desde: desde && hasta ? desde : null, hasta: desde && hasta ? hasta : null, planId: texto(e.plan_id), planes }] : [];
  });
  return { planes, etiquetas, edicion: lista(v.planes).some((p) => typeof p.archivado === "boolean") };
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
/** «11 dic»: la fecha corta que se lee en tienda (sin el año). */
export const fechaCortaES = (iso: string): string => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1]}`;
};
/** «Diciembre 2026 · 1 dic – 31 dic». */
export const rotuloDeCampana = (c: Pick<CampanaPlan, "nombre" | "desde" | "hasta">): string => `${c.nombre} · ${fechaCortaES(c.desde)} – ${fechaCortaES(c.hasta)}`;

/** El nombre con que nace el plan de una campaña en un año: «Día de la Madre 2027». Lo mismo que pone la base si no se le da uno (el año del fin). */
export const nombreDeLaCampana = (e: Pick<EtiquetaCampana, "nombre">, anio: number): string => `${e.nombre} ${anio}`;

/** Las fechas de una campaña de Etiquetas en un año, con la misma regla que Historial (`proyectarCampana`: manda el año del fin; Día de la Madre
 *  sigue a su segundo domingo de mayo). null si la etiqueta no tiene fechas. */
export function fechasDelAnio(e: Pick<EtiquetaCampana, "desde" | "hasta">, anio: number): { desde: string; hasta: string } | null {
  return e.desde && e.hasta ? proyectarCampana({ desde: e.desde, hasta: e.hasta }, anio) : null;
}

/** Una campaña del calendario que todavía no tiene plan ese año: «Black Friday 2026, del 9 al 30 nov». */
export type RanuraCalendario = { etiquetaId: string; anio: number; nombre: string; desde: string; hasta: string };

/** ¿Esa campaña ya tiene plan ese año? (también uno archivado: la base no deja otro igual). */
const tienePlanEn = (e: Pick<EtiquetaCampana, "id" | "planes">, anio: number, planes: readonly Pick<CampanaPlan, "etiquetaId" | "hasta">[]) =>
  e.planes.some((p) => p.anio === anio) || planes.some((p) => p.etiquetaId === e.id && Number(p.hasta.slice(0, 4)) === anio);

/**
 * El calendario sin plan (Felipe 2026-10-12, opción A): cada campaña de Etiquetas con fechas, este año y el que viene, que todavía no tiene plan
 * ese año y no terminó. Es lo que el selector ofrece para «Armar plan».
 */
export function ranurasSinPlan(c: Pick<CampanasLeidas, "etiquetas" | "planes">, hoy: string): RanuraCalendario[] {
  const anio = Number(hoy.slice(0, 4));
  return c.etiquetas
    .flatMap((e) =>
      [anio, anio + 1].flatMap((a): RanuraCalendario[] => {
        const f = fechasDelAnio(e, a);
        if (!f || f.hasta < hoy || tienePlanEn(e, a, c.planes)) return [];
        return [{ etiquetaId: e.id, anio: a, nombre: nombreDeLaCampana(e, a), ...f }];
      }),
    )
    .sort((x, y) => x.desde.localeCompare(y.desde) || x.nombre.localeCompare(y.nombre, "es"));
}

/** Las campañas de Etiquetas sin fechas: no se pueden armar hasta que se les pongan (el selector se lo dice al líder). */
export const campanasSinFechas = (c: Pick<CampanasLeidas, "etiquetas">): EtiquetaCampana[] => c.etiquetas.filter((e) => !e.desde || !e.hasta);

/** La hoja de una campaña: la de una del calendario (`etiquetaId`, ya llena) o una campaña NUEVA que no está en Etiquetas (`etiquetaId` null). */
export type BorradorCampana = { etiquetaId: string | null; nombre: string; desde: string; hasta: string };
export type CampoCampana = "etiqueta" | "nombre" | "desde" | "hasta";

/** La hoja de una campaña del calendario: su nombre y sus fechas de ese año. */
export const borradorDeRanura = (r: RanuraCalendario): BorradorCampana => ({ etiquetaId: r.etiquetaId, nombre: r.nombre, desde: r.desde, hasta: r.hasta });
/** La hoja de una campaña nueva: vacía. */
export const borradorNuevo = (): BorradorCampana => ({ etiquetaId: null, nombre: "", desde: "", hasta: "" });
/** El nombre del plan de una campaña nueva: el de la campaña con el año en que termina, como lo pone la base. */
export const nombreDelPlanNuevo = (b: Pick<BorradorCampana, "nombre" | "hasta">): string => `${b.nombre.replace(/\s+/g, " ").trim()} ${b.hasta.slice(0, 4)}`;

/** Un nombre de plan para compararlo con otro: sin tildes, sin mayúsculas y con un solo espacio entre palabras. «Navídad  2026» y «navidad 2026»
 *  son el mismo nombre en el selector (chaos 2026-10-10: convivían). */
export const nombreComparable = (t: string) => sinTildes(t).replace(/\s+/g, " ").trim();

/**
 * Lo que impide crear la campaña, campo por campo (vacío = se puede): lo mismo que rechazan `crear_plan_compra` (una del calendario) y
 * `crear_campana_con_plan` (una nueva). `nombresEnUso`: los nombres de los planes que ya existen.
 */
export function problemasDeLaCampana(b: BorradorCampana, etiquetas: readonly EtiquetaCampana[], nombresEnUso: readonly string[] = []): Partial<Record<CampoCampana, string>> {
  const p: Partial<Record<CampoCampana, string>> = {};
  const nombre = b.nombre.replace(/\s+/g, " ").trim();
  const anio = fechaIso(b.hasta) ? Number(b.hasta.slice(0, 4)) : null;
  const enUso = (n: string) => nombresEnUso.some((x) => nombreComparable(x) === nombreComparable(n));
  if (b.etiquetaId !== null) {
    const e = etiquetas.find((x) => x.id === b.etiquetaId);
    if (!e) p.etiqueta = "Esa campaña ya no está en Etiquetas: vuelve a elegirla en el selector.";
    else if (anio !== null && tienePlanEn(e, anio, [])) p.etiqueta = `Esa campaña ya tiene su plan de ${anio}: ábrelo desde el selector.`;
    if (!nombre) p.nombre = "Ponle un nombre al plan.";
    else if (enUso(nombre)) p.nombre = "Ya hay un plan con ese nombre: ponle otro.";
  } else if (!nombre) {
    p.nombre = "Escribe el nombre de la campaña.";
  } else if (etiquetas.some((e) => nombreComparable(e.nombre) === nombreComparable(nombre))) {
    const e = etiquetas.find((x) => nombreComparable(x.nombre) === nombreComparable(nombre))!;
    // Una sin fechas no se puede elegir en el selector (sale apagada): se le dice dónde ponérselas.
    p.nombre = e.desde
      ? `«${e.nombre}» ya está en el calendario: elígela en el selector.`
      : `«${e.nombre}» ya está en Catálogo ▸ Insignias, sin fechas: pónselas ahí («Configurar») y saldrá en el calendario.`;
  } else if (anio !== null && enUso(nombreDelPlanNuevo(b))) {
    p.nombre = `Ya hay un plan «${nombreDelPlanNuevo(b)}»: ponle otro nombre a la campaña.`;
  }
  if (!fechaIso(b.desde)) p.desde = "Escribe desde cuándo empieza.";
  if (!fechaIso(b.hasta)) p.hasta = "Escribe hasta cuándo dura.";
  else if (fechaIso(b.desde) && b.hasta < b.desde) p.hasta = "La campaña no puede terminar antes de empezar.";
  return p;
}

/** Los argumentos de `crear_plan_compra` (una campaña del calendario). */
export const argsCrearCampana = (b: BorradorCampana) => ({ p_etiqueta_id: b.etiquetaId, p_nombre: b.nombre.replace(/\s+/g, " ").trim() || null, p_desde: b.desde, p_hasta: b.hasta });
/** Los argumentos de `crear_campana_con_plan` (una campaña nueva). */
export const argsCampanaNueva = (b: BorradorCampana) => ({ p_nombre: b.nombre.replace(/\s+/g, " ").trim(), p_desde: b.desde, p_hasta: b.hasta });

/** Si las fechas del plan no son las de su campaña ESE AÑO, lo dice (la diferencia nunca es silenciosa); si coinciden o no hay con qué comparar, null. */
export function diferenciaConLaEtiqueta(b: Pick<BorradorCampana, "desde" | "hasta">, e: Pick<EtiquetaCampana, "nombre" | "desde" | "hasta"> | undefined): string | null {
  if (!e || !fechaIso(b.hasta)) return null;
  const f = fechasDelAnio(e, Number(b.hasta.slice(0, 4)));
  if (!f || (b.desde === f.desde && b.hasta === f.hasta)) return null;
  return `«${e.nombre}» en Etiquetas va del ${fechaCortaES(f.desde)} al ${fechaCortaES(f.hasta)}. Un plan de compra puede ser más ancho que la campaña de venta: ajusta las fechas solo si lo quieres así.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// 15. La URL: qué campaña y qué vista (chaos 2026-10-10)
// ---------------------------------------------------------------------------------------------------------------------

/** ¿Es un id de campaña con forma de uuid? Un `?plan=` escrito a mano o viejo no se le manda a la base (respondería un error técnico). */
export const esIdDePlan = (t: string | null | undefined): t is string => typeof t === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.trim());

/** La vista de la tabla vive en la URL (`?vista=paso`): así «Atrás» desde el paso a paso vuelve a la tabla en vez de salir de la pantalla. */
export const vistaDeLaUrl = (v: string | null | undefined): "tabla" | "guiado" => (v === "paso" ? "guiado" : "tabla");

// ---------------------------------------------------------------------------------------------------------------------
// 16. Editar, quitar y restaurar una campaña (ADR-0372, B5; Felipe 2026-10-10: «borrar si está vacía, archivar si no»)
// ---------------------------------------------------------------------------------------------------------------------

/** Las campañas del selector (las archivadas no salen). */
export const campanasActivas = (c: CampanasLeidas): CampanaPlan[] => c.planes.filter((p) => !p.archivado);
/** Las archivadas: se ven y se restauran desde «Campañas archivadas». */
export const campanasArchivadas = (c: CampanasLeidas): CampanaPlan[] => c.planes.filter((p) => p.archivado);

/** ¿«Quitar» la borra? Solo si está vacía: ninguna categoría armada y sin tope (no hay nada que perder). Si no, se archiva. La base decide igual
 *  (`quitar_plan_compra`): esto solo pone el nombre correcto al botón y decide si hace falta confirmar. */
export const quitarBorra = (c: Pick<CampanaPlan, "conPlan" | "conTope">): boolean => c.conPlan === 0 && !c.conTope;

/** Lo que dice el botón «Quitar» y lo que pasa al pulsarlo, en palabras de tienda. */
export function textoDeQuitar(c: Pick<CampanaPlan, "conPlan" | "conTope">): { boton: string; explica: string } {
  if (quitarBorra(c)) return { boton: "Borrar campaña", explica: "No tiene ninguna categoría armada ni tope: se borra y no se puede deshacer." };
  const que = [c.conPlan > 0 ? `${c.conPlan} ${c.conPlan === 1 ? "categoría armada" : "categorías armadas"}` : null, c.conTope ? "su tope" : null].filter(Boolean).join(" y ");
  return { boton: "Archivar campaña", explica: `Tiene ${que}: se archiva (deja de salir en el selector) y se puede restaurar cuando quieras.` };
}

export type BorradorEdicion = { nombre: string; desde: string; hasta: string };
export type CampoEdicion = "nombre" | "desde" | "hasta";
export const borradorDeEdicion = (c: Pick<CampanaPlan, "nombre" | "desde" | "hasta">): BorradorEdicion => ({ nombre: c.nombre, desde: c.desde, hasta: c.hasta });

/** Lo que impide guardar la edición (vacío = se puede): lo mismo que rechaza `editar_plan_compra`. `otrosNombres`: las demás campañas (la que se
 *  edita puede quedarse con su nombre). */
export function problemasDeLaEdicion(b: BorradorEdicion, otrosNombres: readonly string[]): Partial<Record<CampoEdicion, string>> {
  const p: Partial<Record<CampoEdicion, string>> = {};
  const nombre = b.nombre.trim();
  if (!nombre) p.nombre = "Ponle un nombre al plan.";
  else if (otrosNombres.some((n) => nombreComparable(n) === nombreComparable(nombre))) p.nombre = "Ya hay un plan con ese nombre: ponle otro.";
  if (!fechaIso(b.desde)) p.desde = "Escribe desde cuándo empieza.";
  if (!fechaIso(b.hasta)) p.hasta = "Escribe hasta cuándo dura.";
  else if (fechaIso(b.desde) && b.hasta < b.desde) p.hasta = "La campaña no puede terminar antes de empezar.";
  return p;
}

/** ¿Cambió algo? Sin cambios no hay nada que guardar (y salir no pregunta). */
export const edicionCambio = (b: BorradorEdicion, c: Pick<CampanaPlan, "nombre" | "desde" | "hasta">): boolean =>
  b.nombre.replace(/\s+/g, " ").trim() !== c.nombre || b.desde !== c.desde || b.hasta !== c.hasta;

/** Los argumentos de `editar_plan_compra`. */
export const argsEditarCampana = (planId: string, b: BorradorEdicion) => ({ p_plan_id: planId, p_nombre: b.nombre.replace(/\s+/g, " ").trim(), p_desde: b.desde, p_hasta: b.hasta });

/** Qué hizo `quitar_plan_compra`: «borrado» o «archivado» (la base decide: si entre medio alguien armó una categoría, archiva). */
export function accionDeQuitar(data: unknown): "borrado" | "archivado" | null {
  return esObjeto(data) && (data.accion === "borrado" || data.accion === "archivado") ? data.accion : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 17. La lista de campañas por año y por momento (ADR-0372, C1; Felipe 2026-10-12: «ordenarlas por año para que no sobrecargue»)
// ---------------------------------------------------------------------------------------------------------------------

/** Cuánto sigue en el selector una campaña que ya terminó: un año. Ahí se compara lo planificado con lo vendido; una más vieja se mira en el
 *  Historial, que la ordena por año (sin esto, el selector crece seis campañas por año para siempre). */
export const DIAS_TERMINADA_EN_SELECTOR = 365;

/** Qué campaña se abre al entrar sin `?plan=`: la que está en curso (si hay dos a la vez, la que termina antes: es la que apura); si no, la
 *  próxima en empezar; si no, la que terminó más tarde. Nunca una archivada. Antes se abría la de inicio más lejano: con «Día de la Madre
 *  2027» creada, en pleno diciembre se abría mayo. */
export function campanaQueAbre(planes: readonly CampanaPlan[], hoy: string): CampanaPlan | null {
  const activas = planes.filter((p) => !p.archivado);
  const por = (estado: EstadoCampana) => activas.filter((p) => estadoCampana(hoy, p.desde, p.hasta) === estado);
  const primera = (l: CampanaPlan[], orden: (a: CampanaPlan, b: CampanaPlan) => number) => [...l].sort(orden)[0] ?? null;
  return (
    primera(por("durante"), (a, b) => a.hasta.localeCompare(b.hasta) || a.nombre.localeCompare(b.nombre, "es")) ??
    primera(por("antes"), (a, b) => a.desde.localeCompare(b.desde) || a.nombre.localeCompare(b.nombre, "es")) ??
    primera(por("despues"), (a, b) => b.hasta.localeCompare(a.hasta) || a.nombre.localeCompare(b.nombre, "es"))
  );
}

/** Las campañas del selector, en el orden en que se leen y con el título de su grupo: «En curso», «Por venir · 2026», «Por venir · 2027»…
 *  y «Terminadas» (solo las del último año). Las archivadas no salen (tienen su hoja). */
export function campanasDelSelector(planes: readonly CampanaPlan[], hoy: string): { campana: CampanaPlan; grupo: string }[] {
  const activas = planes.filter((p) => !p.archivado);
  const de = (estado: EstadoCampana) => activas.filter((p) => estadoCampana(hoy, p.desde, p.hasta) === estado);
  const enCurso = de("durante").sort((a, b) => a.hasta.localeCompare(b.hasta) || a.nombre.localeCompare(b.nombre, "es"));
  const porVenir = de("antes").sort((a, b) => a.desde.localeCompare(b.desde) || a.nombre.localeCompare(b.nombre, "es"));
  const terminadas = de("despues")
    .filter((p) => diasEntre(p.hasta, hoy) <= DIAS_TERMINADA_EN_SELECTOR)
    .sort((a, b) => b.hasta.localeCompare(a.hasta) || a.nombre.localeCompare(b.nombre, "es"));
  return [
    ...enCurso.map((campana) => ({ campana, grupo: "En curso" })),
    ...porVenir.map((campana) => ({ campana, grupo: `Por venir · ${campana.desde.slice(0, 4)}` })),
    ...terminadas.map((campana) => ({ campana, grupo: "Terminadas" })),
  ];
}

/** Una fila del selector: un plan que se abre, una campaña del calendario que se arma, o una sin fechas (solo se lee). */
export type EntradaSelector =
  | { tipo: "plan"; campana: CampanaPlan; grupo: string }
  | { tipo: "calendario"; ranura: RanuraCalendario; grupo: string }
  | { tipo: "sin-fechas"; etiqueta: EtiquetaCampana; grupo: string };

/** El orden de los grupos: en curso, por venir (por año), terminadas y, al final, las que no tienen fechas. */
function rangoDeGrupo(g: string): number {
  if (g === "En curso") return 0;
  const m = /^Por venir · (\d{4})$/.exec(g);
  if (m) return Number(m[1]);
  return g === "Terminadas" ? 99_998 : 99_999;
}

/**
 * El selector como CALENDARIO (Felipe 2026-10-12, opción A): los planes de siempre más las campañas de Etiquetas que todavía no tienen plan este
 * año o el que viene, cada una en su grupo, y —solo para quien puede armar— las que no tienen fechas. Los grupos quedan seguidos (el combo los
 * dibuja con un título por tanda) y, dentro de cada uno, por fecha.
 */
export function calendarioDelSelector(c: Pick<CampanasLeidas, "etiquetas" | "planes">, hoy: string, conSinFechas: boolean): EntradaSelector[] {
  const desde = (x: EntradaSelector) => (x.tipo === "plan" ? x.campana.desde : x.tipo === "calendario" ? x.ranura.desde : "9999");
  const nombre = (x: EntradaSelector) => (x.tipo === "plan" ? x.campana.nombre : x.tipo === "calendario" ? x.ranura.nombre : x.etiqueta.nombre);
  const enCurso = (r: RanuraCalendario) => estadoCampana(hoy, r.desde, r.hasta) === "durante";
  const todas: EntradaSelector[] = [
    ...campanasDelSelector(c.planes, hoy).map(({ campana, grupo }) => ({ tipo: "plan" as const, campana, grupo })),
    ...ranurasSinPlan(c, hoy).map((ranura) => ({ tipo: "calendario" as const, ranura, grupo: enCurso(ranura) ? "En curso" : `Por venir · ${ranura.desde.slice(0, 4)}` })),
    ...(conSinFechas ? campanasSinFechas(c).map((etiqueta) => ({ tipo: "sin-fechas" as const, etiqueta, grupo: "Sin fechas en Etiquetas" })) : []),
  ];
  // Las terminadas, de la más reciente a la más vieja (como antes); el resto, por fecha.
  return todas.sort((a, b) => {
    const r = rangoDeGrupo(a.grupo) - rangoDeGrupo(b.grupo);
    if (r !== 0) return r;
    const f = a.grupo === "Terminadas" ? desde(b).localeCompare(desde(a)) : desde(a).localeCompare(desde(b));
    return f || nombre(a).localeCompare(nombre(b), "es");
  });
}

/**
 * La tienda que la persona tiene elegida en la cabecera, si es una de las que se miran (Felipe 2026-10-12: Resultados e Historial arrancan en
 * la sede en la que estás). En CAYLA Global, en el Taller o el Almacén, o en una sede que no aparece: null, y se ve toda CAYLA.
 */
export function tiendaDeLaCabecera(sede: string | null, tiendas: readonly { id: string }[]): string | null {
  return sede && tiendas.some((t) => t.id === sede) ? sede : null;
}

/** Las tiendas con la de la cabecera primero y las demás en su orden (Historial: tu tienda es la primera columna). */
export function laDeLaCabeceraPrimero<T extends { id: string }>(tiendas: readonly T[], sede: string | null): T[] {
  const i = sede ? tiendas.findIndex((t) => t.id === sede) : -1;
  return i <= 0 ? [...tiendas] : [tiendas[i], ...tiendas.filter((_, k) => k !== i)];
}
