// Plan de campaña ▸ Resultados ▸ «¿Subió la venta?» (ADR-0525, actualización 2026-10-26 (b); tarea #8 de la auditoría): al terminar una campaña, cuánto subió la venta ESTE año contra lo que subió
// los otros años, con la misma vara del Calendario y del Historial (`medir`: soles por día de la campaña ÷ soles por día de los 60 días de antes, en la tienda con más historia).
// Lógica pura, sin React ni red.
//
// EL PROBLEMA. Resultados dice cuánto se vendió y cómo cerró el stock, pero no contesta lo que decide el año que viene: ¿esta campaña movió la venta, o vendió lo de un día cualquiera?
// El Calendario ya muestra lo que dijo la historia de cada campaña; aquí se le suma lo que pasó ahora y se dice si rindió más, lo mismo o menos que de costumbre.
//
// CONTRATO
//   PROMETE: usa la historia que el Calendario ya midió (una sola definición de «cuánto sube»): este año es una de las filas de `porAnio`, y «los otros años» son las demás; sin este año medido
//            no hay veredicto (nunca un número inventado ni uno de un año a medias); el veredicto de este año usa las mismas palabras que el Calendario (Pico claro, Sube un poco, No se nota,
//            No sube); y compara con la MEDIANA de los otros años, no con el promedio (un año de tiendas cerradas no arrastra la cuenta). Con menos de tres años para comparar, lo avisa.
//   NO HACE: no mide ganancia ni margen (un ×2 puede ser una campaña mala si lo que sobró se liquidó a la mitad: eso lo dice el cierre, más abajo en la misma pantalla), no decide si la
//            campaña se queda en el calendario (eso es del Calendario) y no lee la base.

import { multiplicadorLegible, resumenDeAnios, textoDeAnios, veredictoDe, MIN_ANIOS_SIN_ADVERTENCIA, type EvidenciaDeCampana, type VeredictoDeCampana } from "./plan-compra-calendario-evidencia";
import { campanasAMedir, claveDeLaCampanaDelPlan } from "./plan-compra-calendario-vista";
import type { CampanasLeidas } from "./plan-compra-reglas";

/**
 * Lo que el servidor le entrega a Resultados para el veredicto de una campaña terminada: la historia de la campaña a la que pertenece el plan. Es JSON plano (viaja al navegador).
 * `evidencia` null con `fallo` en falso es «sin historia propia»; con `fallo` en verdad, la lectura falló y la pantalla lo dice (no es lo mismo que «no hay historia»).
 */
export type HistoriaDelPlan = {
  /** La llave de la campaña en el calendario (`e:<insignia>` o `p:<fila>`): lleva a su hoja. */
  clave: string;
  /** El año de la campaña: el año en que termina. */
  anio: number;
  /** Las fechas con las que se midió ESTE año (las de la campaña, que pueden no ser las del plan); null si ese año no las tiene. */
  fechas: { desde: string; hasta: string } | null;
  evidencia: EvidenciaDeCampana | null;
  /** La tienda con la que se midió (la de más historia). */
  tienda: { id: string; nombre: string } | null;
  fallo: boolean;
};

const seTocan = (a: { desde: string; hasta: string }, b: { desde: string; hasta: string }): boolean => a.desde <= b.hasta && b.desde <= a.hasta;

/**
 * La historia de la campaña a la que pertenece un plan, o null si el plan no es de ninguna campaña. El año de la campaña es el año en que termina; si las fechas del plan no son las de la
 * campaña (un plan que acomodó su ventana) el año sale de la que se toca con ellas, para no medir la Navidad pasada.
 */
export function historiaDelPlan(
  c: Pick<CampanasLeidas, "planes" | "etiquetas" | "calendario">,
  planId: string,
  h: { evidencias: Record<string, EvidenciaDeCampana | null>; tienda: { id: string; nombre: string } | null; historiaFallo: boolean },
): HistoriaDelPlan | null {
  const plan = c.planes.find((p) => p.id === planId);
  const clave = claveDeLaCampanaDelPlan(c, planId);
  if (!plan || !clave) return null;
  const fechasEn = campanasAMedir(c).find((x) => x.clave === clave)?.fechasEn;
  const delPlan = Number(plan.hasta.slice(0, 4));
  const anio = fechasEn ? ([delPlan, delPlan + 1, delPlan - 1].find((a) => { const f = fechasEn(a); return f !== null && seTocan(f, plan); }) ?? delPlan) : delPlan;
  return { clave, anio, fechas: fechasEn?.(anio) ?? null, evidencia: h.evidencias[clave] ?? null, tienda: h.tienda, fallo: h.historiaFallo };
}

/** Cuánto se tiene que apartar este año de la mediana de los otros para decir «más» o «menos que de costumbre»: 15 %. Dentro de la franja, «lo de siempre». */
export const UMBRAL_DE_COMPARACION = 0.15;

export type Comparacion = "mas" | "igual" | "menos";

export type VeredictoMedido = {
  estado: "medida";
  anio: number;
  /** Cuántas veces lo de un día normal vendió la campaña este año. */
  esteAnio: number;
  /** Lo que dice ese número con las palabras del Calendario. */
  veredicto: VeredictoDeCampana;
  /** Lo que subió en los otros años medidos; null si este es el único (la primera vez que se puede medir). */
  otros: { mediana: number; min: number; max: number; anios: number } | null;
  /** Este año contra la mediana de los otros; null si no hay otros. */
  comparacion: Comparacion | null;
};
export type VeredictoAlCerrar = VeredictoMedido | { estado: "sin-medida" };

/** El veredicto de una campaña terminada: lo que subió el año `anio` (el año en que terminó) contra lo que subió en los otros. */
export function veredictoAlCerrar(ev: EvidenciaDeCampana | null, anio: number): VeredictoAlCerrar {
  const este = ev?.porAnio.find((a) => a.anio === anio);
  if (!ev || !este) return { estado: "sin-medida" };
  const resto = resumenDeAnios(ev.porAnio.filter((a) => a.anio !== anio));
  const anios = ev.porAnio.length - 1;
  const otros = resto ? { ...resto, anios } : null;
  const comparacion: Comparacion | null = !otros
    ? null
    : este.multiplicador >= otros.mediana * (1 + UMBRAL_DE_COMPARACION)
      ? "mas"
      : este.multiplicador <= otros.mediana * (1 - UMBRAL_DE_COMPARACION)
        ? "menos"
        : "igual";
  return { estado: "medida", anio, esteAnio: este.multiplicador, veredicto: veredictoDe({ mediana: este.multiplicador }), otros, comparacion };
}

export type FrasesDelVeredicto = {
  /** Lo que pasó este año. */
  principal: string;
  /** Contra lo de los otros años. */
  comparada: string;
  /** Con pocos años para comparar. */
  aviso: string | null;
};

/** Lo que se le dice a quien lo lee, en palabras de tienda. `nombre` es el de la campaña tal como la ve (con su año). */
export function frasesDelVeredicto(v: VeredictoMedido, nombre: string): FrasesDelVeredicto {
  const principal = `${nombre} vendió ${multiplicadorLegible(v.esteAnio)} un día normal.`;
  if (!v.otros) return { principal, comparada: "Es la primera vez que se puede medir: todavía no hay con qué compararla.", aviso: null };
  const antes =
    v.otros.anios === 1
      ? `En el otro año que se pudo medir subió ${multiplicadorLegible(v.otros.mediana)}.`
      : `En los otros ${textoDeAnios(v.otros.anios)} subió ${multiplicadorLegible(v.otros.mediana)} de mediana (entre ${multiplicadorLegible(v.otros.min)} y ${multiplicadorLegible(v.otros.max)}).`;
  const ahora = v.comparacion === "mas" ? "Esta vez rindió más que de costumbre." : v.comparacion === "menos" ? "Esta vez rindió menos que de costumbre." : "Esta vez rindió lo de siempre.";
  return { principal, comparada: `${antes} ${ahora}`, aviso: v.otros.anios < MIN_ANIOS_SIN_ADVERTENCIA ? "Con tan pocos años para comparar, tómalo con calma." : null };
}
