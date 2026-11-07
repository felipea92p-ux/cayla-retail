// Plan de campaña ▸ Presupuesto ▸ Versiones del plan (ADR-0523, Felipe 2026-10-26, spike ④). Lógica pura, sin React ni red.
//
// EL PROBLEMA. Guardar sin querer, o usar un plan con tope y arrepentirse, no se deshacía: cada guardado de una categoría pisa al anterior. Una VERSIÓN es una
// foto del plan en un punto (las categorías con sus supuestos, el precio de la plata y el tope): se guarda a mano, al usar el plan con tope, al volver a otra
// versión, o sola ANTES de un cambio grande para que «volver» siempre tenga adónde. Volver NO borra nada: crea una versión nueva con lo que tenía la elegida.
//
// CONTRATO
//   PROMETE: leer lo que manda la base sin confiar en su forma; decir cuál versión es «la de hoy» por su huella (la misma que calcula la base) y si el plan tiene
//            cambios que ninguna versión recuerda; y armar «qué cambió» contra el plan de hoy con el MISMO `calcular` y el stock de hoy en los dos lados, así lo que se
//            compara son las decisiones y no lo que se vendió desde entonces.
//   NO HACE: no guarda nada ni calcula la huella (eso es la base) ni decide si conviene volver.

import { calcular, type FilaPlan } from "./plan-compra-reglas";
import type { DatosDeLinea } from "./plan-compra-tope";

export const RPC_VERSIONES = "fn_plan_compra_versiones";
export const RPC_VERSION = "fn_plan_compra_version";
export const RPC_GUARDAR_VERSION = "guardar_plan_compra_version";
export const RPC_USAR_CON_TOPE = "usar_plan_compra_con_tope";
export const RPC_RESTAURAR_VERSION = "restaurar_plan_compra_version";

/** Cuántas letras cabe la nota de una versión (la base la rechaza con más). */
export const MAX_NOTA_DE_VERSION = 120;

export type OrigenDeVersion = "manual" | "plan_con_tope" | "restauracion" | "automatica";

export type VersionDelPlan = {
  numero: number;
  nota: string;
  origen: OrigenDeVersion;
  /** De cuál versión volvió (solo si `origen` es «restauracion»). */
  restauradaDe: number | null;
  /** El precio de la plata del plan en esa versión (0 = el plan de siempre). */
  precioDeLaPlata: number;
  tope: number | null;
  /** Lo que la pantalla mostró al guardarla; null = no se sabe (una automática puede no traerlo). */
  prendas: number | null;
  inversion: number | null;
  /** La huella de la foto, la que calcula la base: igual a la del plan de hoy = el plan no cambió desde esta versión. */
  huella: string;
  por: string | null;
  /** Cuándo (ISO). */
  en: string | null;
};

export type LecturaVersiones = {
  /** El precio de la plata que el plan USA hoy. */
  precioDeLaPlata: number;
  tope: number | null;
  /** La huella del plan de hoy. */
  huellaActual: string;
  /** De la más nueva a la más vieja. */
  versiones: VersionDelPlan[];
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const ORIGENES: readonly OrigenDeVersion[] = ["manual", "plan_con_tope", "restauracion", "automatica"];

function leerVersion(v: unknown): VersionDelPlan | null {
  if (!esObjeto(v)) return null;
  const n = numero(v.numero);
  const huella = texto(v.huella);
  const precio = numero(v.precio_de_la_plata);
  const origen = ORIGENES.find((o) => o === v.origen);
  if (n === null || !Number.isInteger(n) || n < 1 || !huella || precio === null || !origen) return null;
  const tope = numero(v.tope);
  const restauradaDe = numero(v.restaurada_de);
  const prendas = numero(v.prendas);
  const inversion = numero(v.inversion);
  return {
    numero: n,
    nota: typeof v.nota === "string" ? v.nota : "",
    origen,
    restauradaDe: restauradaDe !== null && Number.isInteger(restauradaDe) ? restauradaDe : null,
    precioDeLaPlata: precio,
    tope: tope !== null && tope > 0 ? tope : null,
    prendas: prendas !== null && prendas >= 0 ? prendas : null,
    inversion: inversion !== null && inversion >= 0 ? inversion : null,
    huella,
    por: texto(v.por),
    en: texto(v.en),
  };
}

/**
 * Lo que devuelve `fn_plan_compra_versiones`. null si no es de la forma o la base todavía no la tiene (sin la marca `soportado`): la pantalla se queda sin
 * versiones y sin «Usar el plan con tope», y el plan se calcula con el precio de la plata en 0. Una fila que no calza se descarta; nunca se inventa una.
 */
export function leerVersiones(v: unknown): LecturaVersiones | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  const precio = numero(v.precio_de_la_plata);
  const huellaActual = texto(v.huella_actual);
  if (precio === null || !huellaActual) return null;
  const tope = numero(v.tope);
  const versiones = (Array.isArray(v.versiones) ? v.versiones : []).flatMap((x): VersionDelPlan[] => {
    const leida = leerVersion(x);
    return leida ? [leida] : [];
  });
  return { precioDeLaPlata: precio, tope: tope !== null && tope > 0 ? tope : null, huellaActual, versiones: versiones.sort((a, b) => b.numero - a.numero) };
}

/** La versión que ES el plan de hoy (la de su misma huella); null si el plan tiene cambios que ninguna versión recuerda. */
export const versionDeHoy = (l: LecturaVersiones): VersionDelPlan | null => l.versiones.find((v) => v.huella === l.huellaActual) ?? null;

/** El plan tiene categorías y ninguna versión es lo que hay hoy: hay algo que «Guardar una versión» recordaría. */
export const hayCambiosSinVersion = (l: LecturaVersiones, conCategorias: boolean): boolean => conCategorias && versionDeHoy(l) === null;

/** El número que tendría la próxima versión. */
export const numeroDeLaSiguiente = (l: LecturaVersiones): number => (l.versiones[0]?.numero ?? 0) + 1;

// ---------------------------------------------------------------------------------------------------------------------
// La foto de una versión
// ---------------------------------------------------------------------------------------------------------------------

export type LineaDeVersion = { categoriaId: string } & DatosDeLinea;
export type VersionConFoto = { version: VersionDelPlan; lineas: LineaDeVersion[] };

/** Lo que devuelve `fn_plan_compra_version`: la versión con sus categorías. null si no es de la forma. */
export function leerVersionConFoto(v: unknown): VersionConFoto | null {
  const version = leerVersion(v);
  if (!version || !esObjeto(v) || !Array.isArray(v.lineas)) return null;
  const lineas = v.lineas.flatMap((l): LineaDeVersion[] => {
    if (!esObjeto(l)) return [];
    const categoriaId = texto(l.categoria_id);
    const flojo = numero(l.flojo);
    const normal = numero(l.normal);
    const bueno = numero(l.bueno);
    const precio = numero(l.precio);
    const costo = numero(l.costo);
    const recupero = numero(l.recupero_pct);
    const descuento = numero(l.descuento_pct);
    if (!categoriaId || flojo === null || normal === null || bueno === null || precio === null || costo === null || recupero === null) return [];
    return [{ categoriaId, flojo, normal, bueno, precio, costo, recuperoPct: recupero, descuentoPct: descuento ?? 0 }];
  });
  return { version, lineas };
}

export type PlanDeLaFoto = { prendas: number; inversion: number; porCategoria: Map<string, { comprar: number; inversion: number }> };

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Los supuestos de una categoría son los mismos (los tres escenarios, precio, costo, lo que sobra y el descuento). */
const iguales = (a: DatosDeLinea, b: DatosDeLinea): boolean =>
  a.flojo === b.flojo &&
  a.normal === b.normal &&
  a.bueno === b.bueno &&
  Math.abs(a.precio - b.precio) < 0.005 &&
  Math.abs(a.costo - b.costo) < 0.005 &&
  a.recuperoPct === b.recuperoPct &&
  Math.abs((a.descuentoPct ?? 0) - (b.descuentoPct ?? 0)) < 0.005;

/**
 * Lo que compraría la foto de una versión con lo que hay HOY (más lo que viene en camino): las decisiones de entonces con el stock de ahora. Es lo que se
 * guarda como «prendas» e «inversión» al volver a esa versión, y contra lo que se compara «qué cambió». Una categoría que hoy no está en la hoja (se desactivó) no cuenta.
 */
export function planDeLaFoto(lineas: readonly LineaDeVersion[], precioDeLaPlata: number, filas: readonly FilaPlan[]): PlanDeLaFoto {
  const stock = new Map(filas.map((f) => [f.c.id, f.calculo?.stock ?? f.stock + f.enCamino]));
  const porCategoria = new Map<string, { comprar: number; inversion: number }>();
  for (const l of lineas) {
    const s = stock.get(l.categoriaId);
    if (s === undefined) continue;
    const c = calcular(l, s, precioDeLaPlata);
    porCategoria.set(l.categoriaId, { comprar: c.comprar, inversion: c.inversion });
  }
  const todas = [...porCategoria.values()];
  return { prendas: todas.reduce((s, x) => s + x.comprar, 0), inversion: centavos(todas.reduce((s, x) => s + x.inversion, 0)), porCategoria };
}

export type CambioDeCategoria = {
  clave: string;
  nombre: string;
  /** Lo que compraría con las decisiones de esa versión; null = la categoría no estaba en su foto (se armó después). */
  enLaVersion: number | null;
  /** Lo que compra hoy; null = hoy no tiene plan. */
  hoy: number | null;
  /** Compra lo mismo, pero con otros supuestos (otro escenario, otro precio, otro descuento): sin esto, «es igual» sería mentira. */
  soloSupuestos: boolean;
};

export type CambiosContraHoy = {
  categorias: CambioDeCategoria[];
  prendasEnLaVersion: number;
  prendasHoy: number;
  inversionEnLaVersion: number;
  inversionHoy: number;
  /** Solo si el tope o el precio de la plata no son los mismos que hoy. */
  tope: { enLaVersion: number | null; hoy: number | null } | null;
  precioDeLaPlata: { enLaVersion: number; hoy: number } | null;
  /** No hay nada distinto: ni una categoría, ni el tope, ni el precio de la plata. */
  sinCambios: boolean;
};

/**
 * Qué cambió entre una versión y el plan de hoy: categoría por categoría (las que compran distinto), el total, el tope y el precio de la plata. Las dos
 * cuentas usan el stock de hoy, así que lo que se ve distinto son decisiones (escenarios, descuento, tope), no ventas de por medio.
 */
export function compararConHoy(foto: VersionConFoto, hoy: { precioDeLaPlata: number; tope: number | null; filas: readonly FilaPlan[] }): CambiosContraHoy {
  const enLaVersion = planDeLaFoto(foto.lineas, foto.version.precioDeLaPlata, hoy.filas);
  const categorias: CambioDeCategoria[] = [];
  for (const f of hoy.filas) {
    const linea = foto.lineas.find((l) => l.categoriaId === f.c.id);
    const ahora = f.calculo ? f.calculo.comprar : null;
    if (!linea && ahora === null) continue;
    const antes = linea ? (enLaVersion.porCategoria.get(f.c.id)?.comprar ?? 0) : null;
    const otrosSupuestos = !!linea && !!f.linea && !iguales(linea, f.linea);
    if (antes === ahora && !otrosSupuestos) continue;
    categorias.push({ clave: f.c.id, nombre: f.c.nombre, enLaVersion: antes, hoy: ahora, soloSupuestos: antes === ahora });
  }
  const conPlan = hoy.filas.filter((f) => f.calculo);
  const prendasHoy = conPlan.reduce((s, f) => s + (f.calculo?.comprar ?? 0), 0);
  const inversionHoy = centavos(conPlan.reduce((s, f) => s + (f.calculo?.inversion ?? 0), 0));
  const cambiaElTope = (foto.version.tope ?? null) !== (hoy.tope ?? null);
  const cambiaElPrecio = Math.abs(foto.version.precioDeLaPlata - hoy.precioDeLaPlata) >= 0.0005;
  return {
    categorias: categorias.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    prendasEnLaVersion: enLaVersion.prendas,
    prendasHoy,
    inversionEnLaVersion: enLaVersion.inversion,
    inversionHoy,
    tope: cambiaElTope ? { enLaVersion: foto.version.tope, hoy: hoy.tope } : null,
    precioDeLaPlata: cambiaElPrecio ? { enLaVersion: foto.version.precioDeLaPlata, hoy: hoy.precioDeLaPlata } : null,
    sinCambios: categorias.length === 0 && !cambiaElTope && !cambiaElPrecio,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Cómo se dice una versión
// ---------------------------------------------------------------------------------------------------------------------

/** De dónde salió, en una palabra para el que lee la lista; null si no hay nada que decir (una a mano ya dice su nota). */
export function origenEnPalabras(v: Pick<VersionDelPlan, "origen" | "restauradaDe">): string | null {
  if (v.origen === "plan_con_tope") return "Plan con tope";
  if (v.origen === "restauracion") return v.restauradaDe !== null ? `Volvió a la versión ${v.restauradaDe}` : "Volvió a una versión";
  if (v.origen === "automatica") return "Guardada sola antes de un cambio";
  return null;
}

/** La nota de la versión o, si no escribió ninguna, lo que dice su origen: una fila de la lista nunca queda sin decir qué es. */
export function notaDeLaVersion(v: Pick<VersionDelPlan, "nota" | "origen" | "restauradaDe">): string {
  const nota = v.nota.trim();
  if (nota) return nota;
  return origenEnPalabras(v) ?? "Punto de control";
}

/** La nota que propone la hoja al guardar una versión: lo que es, para que el que la escribe solo la cambie si tiene algo que agregar. */
export const notaSugerida = (cual: "manual" | "plan_con_tope" | "restauracion", conTope: number | null, de: number | null): string =>
  cual === "plan_con_tope" ? (conTope !== null ? `Plan con tope de S/ ${Math.round(conTope).toLocaleString("es-PE")}` : "Plan con tope") : cual === "restauracion" ? `Volví a la versión ${de ?? ""}`.trim() : "";
