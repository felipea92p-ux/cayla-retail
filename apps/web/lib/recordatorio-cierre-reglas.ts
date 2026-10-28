// El recordatorio de cierre de caja (ADR-0305, maqueta «Isla» de `docs/maquetas/recordatorio-cierre-caja-2026-10/`).
//
// PROMETE: dado el instante actual, la hora de cierre de la tienda (`ubicaciones.hora_cierre`, hora de Lima) y cuándo se
//   abrió la caja que sigue abierta, dice en qué nivel está el recordatorio y cuántos minutos pasaron de la hora:
//     0 nada (todavía no es hora) · 1 en hora (0–29 min) · 2 sigue abierta (30–59) · 3 sin cerrar (60 o más).
//   Desde el 2026-10-06 (ADR-0359) el aviso de la barra empieza 15 min ANTES: `estadoAviso` lo cuenta como nivel 1 con
//   `previo: true`. `estadoRecordatorio` sigue siendo el de siempre —el botón «Cerrar caja» de Caja (ADR-0318) cuelga de él—.
//   Y los textos que se leen en la píldora y en la tarjeta. Sin React, sin red, sin `Intl` (servidor y navegador dicen lo
//   mismo), para probarlo con `recordatorio-cierre-reglas.test.ts`.
// ASUME: que Lima va cinco horas detrás de UTC todo el año (sin horario de verano), como `diaYHoraLima`.
// NO DECIDE: quién lo ve ni si la caja está abierta: eso lo lee `lib/recordatorio-cierre.ts` de la base.

/** Minutos que suben de nivel: a los 30 «sigue abierta», a la hora «sin cerrar». */
export const MINUTOS_NIVEL_2 = 30;
export const MINUTOS_NIVEL_3 = 60;

/** Minutos antes de la hora de cierre en que el aviso de la barra ya aparece (Felipe 2026-10-06: 7:30 p. m. para cerrar a las 7:45). */
export const MINUTOS_PREAVISO = 15;
/** Cada cuántos minutos, desde la hora de cierre y hasta que se cierre la caja, la pestaña se despliega sola. */
export const MINUTOS_ENTRE_DESPLIEGUES = 5;

export type NivelRecordatorio = 0 | 1 | 2 | 3;

const MS_MIN = 60_000;
const MS_DIA = 86_400_000;
const DESFASE_LIMA_MS = 5 * 3600 * 1000;

/** «21:30» o «21:30:00» → 1290 minutos del día. `null` si no es una hora válida. */
export function minutosDeHora(hora: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** «21:30» → «9:30 p. m.», como se dice la hora en el mostrador. */
export function hora12(hora: string): string {
  const total = minutosDeHora(hora) ?? 0;
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h >= 12 ? "p. m." : "a. m."}`;
}

/**
 * El instante (ms) desde el que se cuenta el retraso: la primera hora de cierre que llega DESPUÉS de abrir la caja.
 *
 * Se ancla a la apertura y no a «hoy» por dos casos reales: (1) la caja de ayer sigue abierta a las 00:15 — contar desde
 * el cierre de hoy diría «todavía no es hora» cuando ya van casi tres horas; (2) alguien abre la caja después de la hora
 * (una venta tarde, un evento): ese turno no nace atrasado, su cierre es el del día siguiente.
 */
export function instanteDeCierre(abiertaEn: string, horaCierre: string): number | null {
  const minutos = minutosDeHora(horaCierre);
  const apertura = Date.parse(abiertaEn);
  if (minutos === null || Number.isNaN(apertura)) return null;
  // Medianoche de Lima del día en que se abrió, en el reloj UTC.
  const aperturaLima = apertura - DESFASE_LIMA_MS;
  const medianocheLima = Math.floor(aperturaLima / MS_DIA) * MS_DIA + DESFASE_LIMA_MS;
  const cierreEseDia = medianocheLima + minutos * MS_MIN;
  return cierreEseDia > apertura ? cierreEseDia : cierreEseDia + MS_DIA;
}

export type EstadoRecordatorio = {
  nivel: NivelRecordatorio;
  /** Minutos enteros desde la hora de cierre (negativo = falta). */
  minutos: number;
};

export function estadoRecordatorio({ ahora, abiertaEn, horaCierre }: { ahora: Date; abiertaEn: string; horaCierre: string | null }): EstadoRecordatorio {
  const cierre = horaCierre ? instanteDeCierre(abiertaEn, horaCierre) : null;
  if (cierre === null) return { nivel: 0, minutos: 0 };
  const minutos = Math.floor((ahora.getTime() - cierre) / MS_MIN);
  return { nivel: nivelPorMinutos(minutos), minutos };
}

export type EstadoAviso = EstadoRecordatorio & {
  /** Todavía no es la hora de cierre: faltan `-minutos`. Solo ocurre en el nivel 1. */
  previo: boolean;
};

/**
 * Lo que pinta el aviso de la barra: lo mismo que `estadoRecordatorio` pero con el preaviso de 15 min. Antes de la hora (de
 * −15 a −1 min) es el nivel 1 con `previo`; a la hora y después, idéntico. El botón de Caja NO usa esta: sigue diciendo
 * «todavía no es hora» hasta la hora.
 */
export function estadoAviso(entrada: { ahora: Date; abiertaEn: string; horaCierre: string | null }): EstadoAviso {
  const e = estadoRecordatorio(entrada);
  if (e.nivel === 0 && entrada.horaCierre && instanteDeCierre(entrada.abiertaEn, entrada.horaCierre) !== null && e.minutos >= -MINUTOS_PREAVISO) {
    return { nivel: 1, minutos: e.minutos, previo: true };
  }
  return { ...e, previo: false };
}

/**
 * ¿Toca desplegar la pestaña? Desde la hora de cierre, cada 5 minutos redondos (a las 7:45, 7:50, 7:55…) y hasta que se cierre
 * la caja. Devuelve el número de despliegue (0 a la hora, 1 a los 5 min…) o −1 mientras todavía no es hora: la pestaña sube
 * cuando ese número crece, nunca por estar «activo».
 */
export function cicloDeDespliegue(minutos: number): number {
  return minutos < 0 ? -1 : Math.floor(minutos / MINUTOS_ENTRE_DESPLIEGUES);
}

export function nivelPorMinutos(minutos: number): NivelRecordatorio {
  if (minutos < 0) return 0;
  if (minutos < MINUTOS_NIVEL_2) return 1;
  if (minutos < MINUTOS_NIVEL_3) return 2;
  return 3;
}

/** Cuánto del anillo está lleno: la primera hora después del cierre (0 → 1). */
export function progreso(minutos: number): number {
  return Math.max(0, Math.min(1, minutos / MINUTOS_NIVEL_3));
}

function duracion(minutos: number): string {
  const dias = Math.floor(minutos / 1440);
  if (dias >= 1) return dias === 1 ? "1 día" : `${dias} días`;
  const h = Math.floor(minutos / 60);
  const r = minutos % 60;
  if (h === 0) return `${minutos} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Lo que dice la píldora junto a «Cerrar caja»: «ahora», «12 min», «1 h 10 min». */
export function textoCorto(minutos: number): string {
  return minutos < 1 ? "ahora" : duracion(minutos);
}

/** Lo que dice la píldora como verbo: antes de la hora «Cierra en», a la hora se cierra; pasada la hora, ya es «sin cerrar». */
export function rotuloPildora(nivel: NivelRecordatorio, previo = false): string {
  if (previo) return "Cierra en";
  return nivel === 3 ? "Caja sin cerrar" : "Cerrar caja";
}

export function tituloTarjeta(nivel: NivelRecordatorio, previo = false): string {
  if (previo) return "Se acerca la hora de cierre";
  return nivel === 3 ? "Caja sin cerrar" : nivel === 2 ? "La caja sigue abierta" : "Es hora de cerrar caja";
}

/** La frase bajo el título. `sede` es el nombre corto que se lee en pantalla («Arequipa»). */
export function bajadaTarjeta(nivel: NivelRecordatorio, sede: string, horaCierre: string, previo = false): string {
  const h = hora12(horaCierre);
  // «p. m.» ya termina en punto: no se le suma otro.
  if (previo) return `${sede} cierra a las ${h} Ve contando el cajón.`;
  if (nivel === 3) return `Desde las ${h} Ciérrala antes de irte.`;
  if (nivel === 2) return `Pasó la hora de cierre (${h}).`;
  // «p. m.» ya termina en punto: no se le suma otro.
  return `${sede} cierra a las ${h}`;
}

/** Hora de Lima de un instante, como «10:02 a. m.». */
export function horaLima12(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const lima = new Date(t - DESFASE_LIMA_MS);
  return hora12(`${lima.getUTCHours()}:${String(lima.getUTCMinutes()).padStart(2, "0")}`);
}

/**
 * La línea del día de la tarjeta: de la apertura a la hora de cierre ocupa el 80 % de la pista y lo que pasó después se
 * pinta en el 20 % restante, en proporción al turno (una hora tarde en un turno de 11 h se ve, pero no llena la pista).
 */
export function lineaDelDia(abiertaEn: string, horaCierre: string, minutos: number): { extraPct: number } {
  const cierre = instanteDeCierre(abiertaEn, horaCierre);
  const apertura = Date.parse(abiertaEn);
  if (cierre === null || Number.isNaN(apertura)) return { extraPct: 0 };
  const turno = Math.max(60, (cierre - apertura) / MS_MIN);
  return { extraPct: Math.min(20, (Math.max(0, minutos) / turno) * 80) };
}

/** «Tienda Arequipa» → «Arequipa»: la tarjeta ya dice que es una tienda. */
export function nombreCorto(etiqueta: string): string {
  return etiqueta.replace(/^tienda\s+/i, "").trim() || etiqueta;
}

/* ------------------------------------------------------------------
   Lo que viaja de la base a la píldora (`lib/recordatorio-cierre.ts` y `GET /api/caja/recordatorio`)
   ------------------------------------------------------------------ */

export type CajaRecordatorio = { id: string; abiertaEn: string; abiertaPor: string | null };

export type DatosRecordatorioCierre = {
  ubicacionId: string;
  /** Como se lee en pantalla: «Tienda Arequipa». */
  sede: string;
  /** «21:30» (hora de Lima) o `null` si la tienda no la tiene configurada: entonces no hay recordatorio. */
  horaCierre: string | null;
  caja: CajaRecordatorio | null;
};

export type CifrasRecordatorio = { esperado: number | null; ventas: number | null };

/** Evento con el que la píldora le pide a Caja que abra su cierre cuando ya se está en `/caja`. */
export const EVENTO_CERRAR_CAJA = "cayla:cerrar-caja";

/** ¿Cambió algo que importe? Evita volver a pintar la píldora cada vez que el sondeo trae lo mismo. */
export function mismosDatos(a: DatosRecordatorioCierre | null, b: DatosRecordatorioCierre | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.ubicacionId === b.ubicacionId && a.horaCierre === b.horaCierre && a.sede === b.sede && a.caja?.id === b.caja?.id && a.caja?.abiertaEn === b.caja?.abiertaEn;
}
