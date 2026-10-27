// Plan de campaña — la fecha límite para pedir (ADR-0499). Lógica pura, sin React ni red.
//
// EL PROBLEMA. Una campaña falla antes por pedir tarde que por pedir mal: el Plan decía cuánto comprar, pero no hasta cuándo se puede pedir
// para que la mercadería esté en las tiendas el día que empieza. La fecha límite es el inicio de la campaña menos los días que tarda un
// pedido en llegar a las tiendas (`diasParaLlegar`, un solo número por campaña que fija quien la arma).
//
// CONTRATO
//   PROMETE: dada la campaña, hoy y los días, decir en cada momento una de cuatro cosas —a tiempo, justo, tarde o «ya empezó»— con su fecha
//            y su frase; nunca una fecha inventada si no hay días.
//   ASUME: `desde`, `hoy` y `limite` son fechas `aaaa-mm-dd` en hora de Lima (los días de calendario no pasan por zonas horarias).
//   NO HACE: no distingue proveedores ni al Taller (un solo plazo por campaña) ni sabe si el pedido ya se hizo (eso lo dice `enCamino` en
//            la fila: la pantalla no muestra el plazo de una categoría que ya tiene su orden).

import { diaMes, diasEntreFechas, diaYHoraLima, sumarDias } from "./fechas-lima";

/** Con lo que arranca una campaña sin plazo fijado: lo que se supone cuando no hay historia de recepciones. Es un supuesto y la pantalla lo dice. */
export const DIAS_PARA_LLEGAR_DE_FABRICA = 14;
/** Tope contra un error de tipeo, no una regla del negocio: ningún pedido tarda un año en llegar. */
export const MAX_DIAS_PARA_LLEGAR = 365;
/** Con esta cantidad de días o menos por delante, el plazo ya no es «a tiempo» sino «justo». */
export const DIAS_DE_AVISO = 7;

export type EstadoDelPlazo = "a_tiempo" | "justo" | "tarde" | "empezo" | "termino";

export type PlazoDePedido = {
  estado: EstadoDelPlazo;
  /** El último día para pedir y que llegue al inicio. null cuando la campaña ya empezó (ya no hay «antes de»). */
  limite: string | null;
  /** Días que faltan para el límite (negativo = ya pasó). null si la campaña ya empezó. */
  diasParaElLimite: number | null;
  /** Si se pide hoy, el día en que estaría en las tiendas. */
  llegariaEl: string;
  /** Cuántos días después del inicio llegaría (0 o más); solo en «tarde». */
  diasTarde: number;
  /** «Pedir antes del 12/11» o «Si pides hoy, llega el 28/12». */
  texto: string;
  /** Una línea más larga para el `title` o el cajón. */
  detalle: string;
};

/** Lo que escribe la persona en «días para llegar»: un entero de 1 a 365. null = no se entiende. */
export function leerDiasParaLlegar(t: string): number | null {
  const limpio = t.trim();
  if (!/^\d{1,3}$/.test(limpio)) return null;
  const n = Number(limpio);
  return n >= 1 && n <= MAX_DIAS_PARA_LLEGAR ? n : null;
}

export const problemaDeLosDias = (t: string): string | null =>
  leerDiasParaLlegar(t) === null ? `Escribe cuántos días tarda un pedido en estar en las tiendas (de 1 a ${MAX_DIAS_PARA_LLEGAR}).` : null;

const dias = (n: number) => (Math.abs(n) === 1 ? "1 día" : `${Math.abs(n)} días`);

/**
 * El plazo de pedido de una campaña. `desde`/`hasta` son las fechas del plan; `diasParaLlegar` el plazo fijado (o el de fábrica).
 *   · antes de empezar: el límite es `desde − diasParaLlegar`; a tiempo, justo (≤ 7 días) o tarde (hoy ya no llega para el inicio).
 *   · durante: ya no hay «antes de»; dice cuándo llegaría un pedido de hoy (sirve para reponer a mitad de campaña).
 *   · después: la campaña terminó, no hay plazo.
 */
export function plazoDePedido(desde: string, hasta: string, hoy: string, diasParaLlegar: number): PlazoDePedido {
  const llegariaEl = sumarDias(hoy, diasParaLlegar);
  const base = { llegariaEl, diasTarde: 0 };
  if (hoy > hasta) {
    return { ...base, estado: "termino", limite: null, diasParaElLimite: null, texto: "La campaña terminó", detalle: "Ya no hay nada que pedir para esta campaña." };
  }
  if (hoy >= desde) {
    return {
      ...base,
      estado: "empezo",
      limite: null,
      diasParaElLimite: null,
      texto: `Si pides hoy, llega el ${diaMes(llegariaEl)}`,
      detalle: `La campaña ya empezó. Un pedido de hoy tarda ${dias(diasParaLlegar)} en estar en las tiendas.`,
    };
  }
  const limite = sumarDias(desde, -diasParaLlegar);
  const faltan = diasEntreFechas(hoy, limite);
  if (faltan < 0) {
    const tarde = diasEntreFechas(desde, llegariaEl);
    return {
      ...base,
      diasTarde: tarde,
      estado: "tarde",
      limite,
      diasParaElLimite: faltan,
      texto: `Llegaría ${dias(tarde)} tarde`,
      detalle: `El último día para pedir era el ${diaMes(limite)}. Un pedido de hoy llega el ${diaMes(llegariaEl)}, ${dias(tarde)} después de que empieza la campaña.`,
    };
  }
  const cuando = faltan === 0 ? "hoy" : faltan === 1 ? "mañana" : `en ${faltan} días`;
  return {
    ...base,
    estado: faltan <= DIAS_DE_AVISO ? "justo" : "a_tiempo",
    limite,
    diasParaElLimite: faltan,
    texto: `Pedir antes del ${diaMes(limite)}`,
    detalle: `El último día para pedir es el ${diaMes(limite)} (${cuando}): ${dias(diasParaLlegar)} para llegar a las tiendas antes del ${diaMes(desde)}.`,
  };
}

/**
 * Hasta cuándo conviene tener cuadrado el stock (A1 de la auditoría del 2026-10-26): «Comprar» resta lo que ya hay, y si «Hay hoy» está incompleto la compra sale
 * inflada. Contar sirve hasta el último día para pedir: con tiempo, dice esa fecha; si ya es tarde o la campaña empezó, «antes de pedir»; terminada, nada.
 */
export function fraseDelConteoAntesDelPlazo(p: Pick<PlazoDePedido, "estado" | "limite">): string | null {
  if (p.estado === "termino") return null;
  if ((p.estado === "a_tiempo" || p.estado === "justo") && p.limite !== null) return `Cuéntalo antes del ${diaMes(p.limite)}: es el último día para pedir.`;
  return "Cuéntalo antes de pedir.";
}

export const RPC_PLAZO = "fn_plan_compra_plazo";
export const RPC_GUARDAR_PLAZO = "guardar_plan_compra_plazo";

/** Lo que la base sabe del plazo de una campaña (`fn_plan_compra_plazo`): el número fijado (null = sin fijar), quién y cuándo. */
export type PlazoFijado = { dias: number | null; por: string | null; en: string | null };

/**
 * Lee `fn_plan_compra_plazo`. null si no es de la forma o la base todavía no la tiene (sin la marca `soportado`): la pantalla sigue con el
 * supuesto de fábrica y no ofrece el campo. Nunca inventa un número.
 */
export function leerPlazoFijado(v: unknown): PlazoFijado | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.soportado !== true) return null;
  const dias = typeof o.dias_para_llegar === "number" && Number.isInteger(o.dias_para_llegar) && o.dias_para_llegar >= 1 && o.dias_para_llegar <= MAX_DIAS_PARA_LLEGAR ? o.dias_para_llegar : null;
  return { dias, por: typeof o.por === "string" && o.por.trim() !== "" ? o.por : null, en: typeof o.en === "string" ? o.en : null };
}

/** Los días con que se cuenta: el fijado, o el supuesto de fábrica. */
export const diasConQueSeCuenta = (p: PlazoFijado | null): number => p?.dias ?? DIAS_PARA_LLEGAR_DE_FABRICA;

/** «Cuenta con 21 días para llegar a las tiendas (los fijó Felipe el 24/10).» o, sin fijar, el supuesto dicho como tal. */
export function fraseDeLosDias(p: PlazoFijado | null): string {
  if (p?.dias == null) return `Cuenta con ${DIAS_PARA_LLEGAR_DE_FABRICA} días para llegar a las tiendas: es un supuesto, todavía sin historia de recepciones.`;
  const quien = p.por ? `los fijó ${p.por}${p.en ? ` el ${diaYHoraLima(p.en).dia}` : ""}` : "fijados a mano";
  return `Cuenta con ${p.dias} días para llegar a las tiendas (${quien}).`;
}

/** Los argumentos de `guardar_plan_compra_plazo`: null quita el plazo (vuelve al supuesto). */
export const argsGuardarPlazo = (planId: string, texto: string | null) => ({ p_plan_id: planId, p_dias: texto === null ? null : leerDiasParaLlegar(texto) });

/**
 * Lo que dice el aviso de éxito al guardar: no «Plazo guardado» a secas, sino lo que cambió para la campaña (subir el plazo mueve la fecha límite
 * de TODAS las categorías: una que iba a tiempo puede pasar a llegar tarde, y quien lo fija tiene que verlo en ese momento).
 */
export function detalleDelNuevoPlazo(desde: string, hasta: string, hoy: string, dias: number): string {
  const p = plazoDePedido(desde, hasta, hoy, dias);
  return p.estado === "tarde" ? `${p.texto}: ${p.detalle}` : p.estado === "a_tiempo" || p.estado === "justo" ? `${p.texto}.` : p.texto;
}
