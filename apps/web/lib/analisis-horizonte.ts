// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A6): contra QUÉ día se mide «¿Para cuánto te alcanza?» y
// cuánto tarda en llegar un pedido. Lógica pura y liviana (sin base, sin React y sin el Plan de campaña): la usan las dos pestañas que dibujan
// «Qué pedir» (Hoy y Qué pedir) y la ficha. Elegir la campaña del Plan vive en `analisis-campanas-reglas.ts` (solo la usa el servidor).
//
// EL PROBLEMA (verificado el 16-oct con producción). «Qué pedir» comparaba el ritmo de 17 días (16 dentro de la campaña Aniversario) con el
// próximo 25-dic, a 70 días: 18 de 22 tipos de Trujillo salían «no llegan», el titular decía «Capas y Aretes y 16 tipos más» y no ayudaba a
// priorizar. Y el 26-dic el próximo 25-dic queda a 364 días: casi todo «no llegaría». Faltaban tres cosas: hasta CUÁNDO se mide, cuánto TARDA
// un pedido (para decir «pídelo antes del X») y la TEMPORADA (diciembre vende más que octubre).
//
// LAS REGLAS (decididas por Felipe el 2026-10-16/17, D3 y D4):
//   · D3 · Se mide hasta el FIN de la próxima campaña del Plan de campaña si empieza en 120 días o menos; si no, hasta el plazo de pedido
//     MÁS 30 días; sin campañas o sin el módulo Plan, el respaldo es el 25-dic (y después del 25-dic no hay «próximo 25-dic»: plazo + 30).
//     La pantalla dice cuál de las tres está usando (`nota`).
//   · D4 · Un pedido tarda 14 días si todos los modelos del tipo son del Taller y 30 si no (terceros, o sin saber: lo conservador). Son
//     SUPUESTOS fijos en el código: la pantalla dice «suponiendo N días» mientras no haya órdenes reales con fecha de entrega.
//   · «Pídelo antes del X» = hoy + los días que te alcanzan − el plazo. Con la decisión 7 de ADR-0357 intacta: dice CUÁNDO, nunca cuánto.

import type { OrigenPrenda } from "./analisis-tipos";
import { diasEntreFechas, sumarDias } from "./fechas-lima";
import { fechaCorta } from "./motor-demanda-reglas";
import { plural } from "./analisis-reglas";

/** Cuánto tarda un pedido del Taller (Felipe, 2026-10-13: «Taller ≈ 14 días») y uno de terceros (supuesto del 2026-10-17, por confirmar). */
export const PLAZO_TALLER_DIAS = 14;
export const PLAZO_TERCEROS_DIAS = 30;
/** Lo que se quiere que dure lo que llega, después de que llega: un mes de venta. La meta sin campaña cercana es `plazo + esto`. */
export const MES_DE_VENTA_DIAS = 30;
/** La próxima campaña cuenta si EMPIEZA dentro de tantos días; más lejos, la meta es el plazo + un mes. */
export const CAMPANA_MAX_DIAS = 120;

/** De dónde sale la meta: el fin de una campaña del Plan, el 25-dic de respaldo o el plazo de pedido más un mes. */
export type HorizonteModo = "campana" | "navidad" | "plazo";

export type Horizonte = {
  modo: HorizonteModo;
  /** El último día que importa (YYYY-MM-DD). En «plazo» es el de un pedido de terceros (hoy + 60): solo rotula, cada tipo mide con su plazo. */
  fecha: string;
  /** Días de hoy a `fecha`: siempre 1 o más. */
  dias: number;
  /** Cómo se llama la meta: «Diciembre 2026», «Navidad» o, en «plazo», «Plazo + 1 mes». */
  nombre: string;
  /** Por qué NO es una campaña del Plan, dicho en palabras de tienda; null si lo es (ya lo dice la cuenta de arriba). */
  nota: string | null;
};

/** Cuánto tarda un pedido de un tipo y de dónde sale ese número. */
export type PlazoDeTipo = { dias: number; origen: "taller" | "terceros" };

/**
 * El plazo de un tipo según el origen de SUS modelos: 14 si todos son del Taller, 30 si no (de terceros, o sin saber: lo conservador, porque
 * pedir tarde cuesta más que pedir temprano). Sin modelos, 30. Hoy 0 de 233 modelos tienen origen, así que casi todo sale a 30 hasta que se llene.
 */
export function plazoDeTipo(origenes: readonly (OrigenPrenda | null)[]): PlazoDeTipo {
  return origenes.length > 0 && origenes.every((o) => o === "taller")
    ? { dias: PLAZO_TALLER_DIAS, origen: "taller" }
    : { dias: PLAZO_TERCEROS_DIAS, origen: "terceros" };
}

/** «suponiendo 30 días» o «suponiendo 14 días, del Taller»: el plazo es un supuesto y se dice (D4). */
export const textoPlazo = (p: PlazoDeTipo): string => `suponiendo ${p.dias} días${p.origen === "taller" ? ", del Taller" : ""}`;

/** Hasta qué día mide un tipo: la fecha de la campaña (o el 25-dic) para todos; en «plazo», el plazo PROPIO del tipo más un mes. */
export const metaDeTipo = (h: Pick<Horizonte, "modo" | "dias">, plazo: PlazoDeTipo): number => (h.modo === "plazo" ? plazo.dias + MES_DE_VENTA_DIAS : h.dias);

/** Una meta cualquiera como número de días (las pruebas y los lugares que solo conocen los días la usan como si fuera Navidad). */
export type MetaDeCompra = Pick<Horizonte, "modo" | "dias">;

/** `semanas` de una cuenta de días: la misma para la cifra de arriba y para el eje (A6: antes «9 semanas» arriba y «10» en el eje). */
export const semanasHasta = (dias: number): number => Math.max(1, Math.round(dias / 7));

/** «10 semanas» o, en la última semana, «5 días». */
export function tiempoHasta(dias: number): string {
  if (dias < 7) {
    const d = Math.max(1, Math.round(dias));
    return `${d} ${plural(d, "día", "días")}`;
  }
  const s = semanasHasta(dias);
  return `${s} ${plural(s, "semana", "semanas")}`;
}

/** La cifra grande de la tarjeta de arriba y lo que la acompaña: «10» + «semanas para terminar Diciembre 2026». */
export function cuentaHorizonte(h: Pick<Horizonte, "modo" | "dias" | "nombre">): { valor: number; texto: string } {
  const unidad = h.dias < 7 ? "día" : "semana";
  const valor = h.dias < 7 ? Math.max(1, Math.round(h.dias)) : semanasHasta(h.dias);
  const cuanto = plural(valor, unidad, `${unidad}s`);
  if (h.modo === "campana") return { valor, texto: `${cuanto} para terminar ${h.nombre}` };
  if (h.modo === "navidad") return { valor, texto: `${cuanto} para Navidad` };
  return { valor, texto: `${cuanto}: un pedido y un mes de venta` };
}

/** El rótulo sobre la línea del eje: «31 dic. · 10 semanas», «Navidad · 10 semanas» o «Plazo + 1 mes». */
export function rotuloDelEje(h: Pick<Horizonte, "modo" | "dias" | "fecha">): string {
  if (h.modo === "plazo") return "Plazo + 1 mes";
  return `${h.modo === "navidad" ? "Navidad" : fechaCorta(h.fecha)} · ${tiempoHasta(h.dias)}`;
}

/** Dónde termina la cuenta, para una frase: «hasta el 31 dic.», «hasta Navidad» o «hasta tu plazo + 1 mes». («no llega hasta…», «llega hasta…») */
export function hastaLaMeta(h: Pick<Horizonte, "modo" | "fecha">): string {
  if (h.modo === "campana") return `hasta el ${fechaCorta(h.fecha)}`;
  if (h.modo === "navidad") return "hasta Navidad";
  return "hasta tu plazo + 1 mes";
}

/** «después del 31 dic.», «después de Navidad» o «después de tu plazo + 1 mes»: lo que llega pasada la meta. */
export function despuesDeLaMeta(h: Pick<Horizonte, "modo" | "fecha">): string {
  if (h.modo === "campana") return `después del ${fechaCorta(h.fecha)}`;
  if (h.modo === "navidad") return "después de Navidad";
  return "después de tu plazo + 1 mes";
}

const NAVIDAD_MES_DIA = "12-25";

/** Los datos mínimos de una campaña del Plan para fijar la meta. */
export type CampanaElegida = { nombre: string; hasta: string };

/** La meta es el fin de una campaña del Plan de campaña. */
export function horizonteDeCampana(hoy: string, c: CampanaElegida): Horizonte {
  return { modo: "campana", fecha: c.hasta, dias: Math.max(1, diasEntreFechas(hoy, c.hasta)), nombre: c.nombre, nota: null };
}

/** Por qué no hay campaña del Plan que sirva: el respaldo de la pantalla lo dice. */
export type MotivoDeRespaldo = "sin_modulo" | "fallo" | "sin_campanas" | { lejos: { nombre: string; dias: number } };

/**
 * Cuando no hay una campaña del Plan a 120 días o menos: el 25-dic si todavía falta (y a 120 días o menos: más lejos no es una meta de compra
 * sino un año de espera), y si no, el plazo de pedido más un mes. En cada caso la `nota` dice por qué, para que nadie crea que la campaña
 * del Plan es esta.
 */
export function horizonteDeRespaldo(hoy: string, motivo: MotivoDeRespaldo): Horizonte {
  const porque =
    motivo === "sin_modulo"
      ? "Tu rol no ve el Plan de campaña"
      : motivo === "fallo"
        ? "No se pudo leer el Plan de campaña"
        : motivo === "sin_campanas"
          ? "No hay campañas por venir en el Plan de campaña"
          : `La próxima campaña del Plan (${motivo.lejos.nombre}) está a ${motivo.lejos.dias} días`;
  // «Lejos» es una campaña que SÍ existe pero no sirve de meta: la regla pide plazo + 30, no el 25-dic.
  const lejos = typeof motivo === "object";
  const anio = Number(hoy.slice(0, 4));
  const navidad = `${anio}-${NAVIDAD_MES_DIA}`;
  const diasNavidad = diasEntreFechas(hoy, navidad);
  if (!lejos && diasNavidad >= 1 && diasNavidad <= CAMPANA_MAX_DIAS) {
    return { modo: "navidad", fecha: navidad, dias: diasNavidad, nombre: "Navidad", nota: `${porque}: se mide hasta Navidad (${fechaCorta(navidad)}).` };
  }
  const dias = PLAZO_TERCEROS_DIAS + MES_DE_VENTA_DIAS;
  const motivoPlazo = lejos ? "" : diasNavidad < 1 ? "Navidad ya pasó" : "Navidad está lejos";
  const nota = lejos
    ? `${porque}: se mide a lo que tarda un pedido más un mes.`
    : `${porque} y ${motivoPlazo.charAt(0).toLowerCase()}${motivoPlazo.slice(1)}: se mide a lo que tarda un pedido más un mes.`;
  return { modo: "plazo", fecha: sumarDias(hoy, dias), dias, nombre: "Plazo + 1 mes", nota };
}

/**
 * La campaña del Plan en la que cae casi toda la ventana del ritmo (A6, crítica del plan): el ritmo de Aniversario no es el de un día normal y
 * «Qué pedir» lo proyecta hacia adelante. `dias` son los días de la ventana que cayeron dentro de la campaña y `de` los días de la ventana.
 */
export type CampanaDelRitmo = { nombre: string; desde: string; hasta: string; dias: number; de: number };

/** «Ojo: 16 de estos 17 días cayeron en Aniversario CAYLA 2026 (hasta el 21 oct.): fue ritmo de campaña y puede bajar al terminar.» */
export function notaDelRitmo(c: CampanaDelRitmo, hoy: string): string {
  const cuando = c.hasta >= hoy ? `hasta el ${fechaCorta(c.hasta)}` : `terminó el ${fechaCorta(c.hasta)}`;
  const cierre = c.hasta >= hoy ? "fue ritmo de campaña y puede bajar al terminar" : "fue ritmo de campaña, no de un día normal";
  const cuantos = c.dias === c.de ? `los ${c.de} días` : `${c.dias} de estos ${c.de} días`;
  return `Ojo: ${cuantos} cayeron en ${c.nombre} (${cuando}): ${cierre}.`;
}

/** Cuándo pedir un tipo: la fecha límite, o «ya» si lo que te alcanza no cubre ni lo que tarda en llegar. */
export type PideloAntes = { fecha: string; ya: boolean };

/**
 * «Pídelo antes del X» = hoy + los días que te alcanzan − lo que tarda un pedido (D4). Si te alcanzan menos días que el plazo —o los mismos—, ya no
 * se llega a tiempo: «pídelo ya» (llegará con el piso vacío, y la fila no lo esconde). null si no se vendió (sin ritmo no hay fecha que dar).
 */
export function pideloAntes(dias: number | null, plazo: number, hoy: string): PideloAntes | null {
  if (dias === null || !Number.isFinite(dias)) return null;
  const margen = Math.floor(dias - plazo);
  return margen <= 0 ? { fecha: hoy, ya: true } : { fecha: sumarDias(hoy, margen), ya: false };
}

/** «pídelo ya» o «pídelo antes del 12 nov.». */
export const textoPidelo = (p: PideloAntes): string => (p.ya ? "pídelo ya" : `pídelo antes del ${fechaCorta(p.fecha)}`);

/** Lo que explica el rótulo al pasar el mouse o tocarlo: de dónde sale la fecha y que el plazo es un supuesto. */
export function tipPidelo(p: PideloAntes, plazo: PlazoDeTipo): string {
  const cuanto = `Un pedido tarda unos ${plazo.dias} días en llegar (${textoPlazo(plazo)}).`;
  return p.ya
    ? `${cuanto} Lo que te alcanza no cubre ese plazo: si lo pides hoy llegará con el piso vacío.`
    : `${cuanto} Si lo pides después del ${fechaCorta(p.fecha)}, llegará cuando ya no te quede.`;
}
