// Editar el horario de una tienda con el mouse, el dedo o el teclado (Tienda web ▸ Conf. Tienda). Lógica pura: el componente
// (`components/tienda-web-conf/HorarioSemanal.tsx`) solo traduce un gesto a estos números.
//
// CONTRATO
//   PROMETE: que todo resultado sea un tramo que la base acepta (de media en media hora, dentro del rango visible, abre antes de cerrar y con
//            al menos media hora de ancho), pase lo que pase con el gesto: nunca devuelve un tramo invertido ni fuera de la regla.
//   ASUME:   minutos desde la medianoche (`@cayla-retail/shared/horario-de-tienda`).
//   NO HACE: leer el DOM ni guardar.

import { DIAS_MAXIMOS_DE_ANTICIPO, MAXIMO_DE_CIERRES, PASO_DE_HORA, fechaIsoValida, semanaVacia, sumarDias, type SemanaDeTienda, type TramoDia } from "@cayla-retail/shared/horario-de-tienda";

/** Lo que se ve de la línea de horas: de 7 a. m. a 11 p. m. de fábrica; se ensancha solo si la base trae un horario que se sale. */
export type RangoVisible = { desde: number; hasta: number };
export const RANGO_DE_FABRICA: RangoVisible = { desde: 7 * 60, hasta: 23 * 60 };

/** Un horario nuevo al abrir un día cerrado: de 10 a. m. a 9 p. m. (lo que casi toda tienda hace), recortado al rango visible. */
export const TRAMO_AL_ABRIR: TramoDia = { abre: 10 * 60, cierra: 21 * 60 };

/** El rango que se dibuja: el de fábrica, ensanchado a la hora entera que haga falta para que NINGÚN día quede fuera de la vista (y no se pueda editar). */
export function rangoVisible(semana: SemanaDeTienda): RangoVisible {
  let { desde, hasta } = RANGO_DE_FABRICA;
  for (const t of semana) {
    if (!t) continue;
    desde = Math.min(desde, Math.floor(t.abre / 60) * 60);
    hasta = Math.max(hasta, Math.ceil(t.cierra / 60) * 60);
  }
  return { desde, hasta };
}

const aPaso = (min: number) => Math.round(min / PASO_DE_HORA) * PASO_DE_HORA;
const entre = (min: number, rango: RangoVisible) => Math.min(rango.hasta, Math.max(rango.desde, min));

/** El minuto (de a media hora y dentro del rango) que corresponde a un punto de la pista: `fraccion` va de 0 (izquierda) a 1 (derecha). */
export function minutoDeLaPista(fraccion: number, rango: RangoVisible): number {
  const f = Number.isFinite(fraccion) ? Math.min(1, Math.max(0, fraccion)) : 0;
  return entre(aPaso(rango.desde + f * (rango.hasta - rango.desde)), rango);
}

/** Dónde cae un minuto en la pista, de 0 a 100 (para dibujar). Fuera del rango se queda en el borde. */
export function porcentajeDeMinuto(min: number, rango: RangoVisible): number {
  return Math.min(100, Math.max(0, ((min - rango.desde) / (rango.hasta - rango.desde)) * 100));
}

/** Arrastrar sobre un hueco: el tramo entre donde se empezó y donde se está, en el orden que sea; con un solo punto, media hora. */
export function tramoPintado(desdeMin: number, hastaMin: number, rango: RangoVisible): TramoDia {
  const a = entre(aPaso(Math.min(desdeMin, hastaMin)), rango);
  const b = entre(aPaso(Math.max(desdeMin, hastaMin)), rango);
  if (b > a) return { abre: a, cierra: b };
  // Un solo punto: media hora hacia la derecha, o hacia la izquierda si ya está en el borde.
  return a + PASO_DE_HORA <= rango.hasta ? { abre: a, cierra: a + PASO_DE_HORA } : { abre: a - PASO_DE_HORA, cierra: a };
}

/** Arrastrar el borde izquierdo de una barra: la apertura va donde está el dedo, sin pasar media hora antes del cierre. */
export function conAperturaEn(t: TramoDia, min: number, rango: RangoVisible): TramoDia {
  return { abre: Math.min(entre(aPaso(min), rango), t.cierra - PASO_DE_HORA), cierra: t.cierra };
}

/** Arrastrar el borde derecho: el cierre va donde está el dedo, sin quedar a menos de media hora de la apertura. */
export function conCierreEn(t: TramoDia, min: number, rango: RangoVisible): TramoDia {
  return { abre: t.abre, cierra: Math.max(entre(aPaso(min), rango), t.abre + PASO_DE_HORA) };
}

/** Arrastrar la barra entera: se corre sin cambiar cuánto dura y sin salirse del rango. */
export function corridoPor(t: TramoDia, deltaMin: number, rango: RangoVisible): TramoDia {
  const dura = t.cierra - t.abre;
  const abre = Math.min(rango.hasta - dura, Math.max(rango.desde, aPaso(t.abre + deltaMin)));
  return { abre, cierra: abre + dura };
}

/** Un día cerrado se abre con el horario de fábrica, recortado al rango (si el rango es más chico, lo que quepa). */
export function tramoParaAbrir(rango: RangoVisible): TramoDia {
  const abre = Math.max(rango.desde, TRAMO_AL_ABRIR.abre);
  const cierra = Math.min(rango.hasta, TRAMO_AL_ABRIR.cierra);
  return cierra > abre ? { abre, cierra } : { abre: rango.desde, cierra: rango.desde + PASO_DE_HORA };
}

/** El lunes (o el primer día abierto) en toda la semana: «Copiar lunes a todos». Sin lunes abierto, la semana queda cerrada. */
export function semanaComoElLunes(semana: SemanaDeTienda): SemanaDeTienda {
  const lunes = semana[0];
  return lunes ? semana.map(() => ({ ...lunes })) : semanaVacia();
}

/** Teclas sobre una barra: ←/→ la corren media hora; Mayús + ←/→ mueven el cierre; Alt + ←/→ mueven la apertura; Suprimir cierra el día. `null` si la
 *  tecla no hace nada. Un día cerrado queda como `undefined` aparte: quien llama lo distingue con `cerrar`. */
export function conTecla(t: TramoDia, tecla: string, { mayus, alt }: { mayus: boolean; alt: boolean }, rango: RangoVisible): TramoDia | "cerrar" | null {
  if (tecla === "Delete" || tecla === "Backspace") return "cerrar";
  if (tecla !== "ArrowLeft" && tecla !== "ArrowRight") return null;
  const paso = tecla === "ArrowLeft" ? -PASO_DE_HORA : PASO_DE_HORA;
  if (mayus) return conCierreEn(t, t.cierra + paso, rango);
  if (alt) return conAperturaEn(t, t.abre + paso, rango);
  return corridoPor(t, paso, rango);
}

// ---------------------------------------------------------------- Cierres por fecha

/** Los cierres de un borrador de pantalla: un texto (JSON de fechas ordenadas) para que se compare y se fusione como cualquier otro campo. */
export const serializarCierres = (fechas: readonly string[]): string => JSON.stringify([...new Set(fechas)].sort());

/** Lo que dice un texto de cierres; lo que no es una lista de fechas reales se ignora (nunca tumba la pantalla). */
export function cierresDeSerializados(texto: string): string[] {
  try {
    const v: unknown = JSON.parse(texto);
    return Array.isArray(v) ? [...new Set(v.filter(fechaIsoValida))].sort() : [];
  } catch {
    return [];
  }
}

/** Por qué no se puede cerrar ese día (o `null` si se puede): ya pasó, está muy lejos, ya está, o no caben más. La base dice lo mismo. */
export function objecionAlCierre(fechas: readonly string[], fecha: string, hoy: string): string | null {
  if (!fechaIsoValida(fecha)) return "Esa no es una fecha.";
  if (fecha < hoy) return "Ese día ya pasó.";
  if (fecha > sumarDias(hoy, DIAS_MAXIMOS_DE_ANTICIPO)) return "Ese día está a más de dos años.";
  if (fechas.includes(fecha)) return "Ese día ya está cerrado.";
  if (fechas.length >= MAXIMO_DE_CIERRES) return `Caben hasta ${MAXIMO_DE_CIERRES} cierres.`;
  return null;
}

/** Agregar un cierre (sin repetir, en orden); si no se puede, la lista queda igual. */
export const conCierre = (fechas: readonly string[], fecha: string, hoy: string): string[] =>
  objecionAlCierre(fechas, fecha, hoy) === null ? [...fechas, fecha].sort() : [...fechas];

export const sinCierre = (fechas: readonly string[], fecha: string): string[] => fechas.filter((f) => f !== fecha);

/** Lo que se manda a guardar: de hoy en adelante. Una pantalla que se quedó abierta de ayer no manda un día pasado (la base lo rechazaría). */
export const cierresVigentes = (fechas: readonly string[], hoy: string): string[] => fechas.filter((f) => f >= hoy).sort();
