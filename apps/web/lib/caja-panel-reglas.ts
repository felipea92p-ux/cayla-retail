// Aritmética pura del rediseño visual de Caja (2026-09-18) — mismo patrón que
// panel-serie.ts: separar lo que se puede probar sin Supabase de lo que hace
// SELECTs. Nada acá conoce `createClient` ni React.

import { diaLima, horaDelDiaLima, inicioDeDiaLima } from "./panel-serie";

const DIAS_TREND_CIERRES = 7;
const NOMBRES_DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

/** Iniciales de un nombre completo (ej. "Felipe Alvarez" → "FA") — mismo criterio
 *  que ya usa la tarjeta de producto del POS para su placeholder sin foto. */
export function iniciales(nombreCompleto: string): string {
  const palabras = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "—";
  return palabras
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Agrupa eventos de venta por hora del día (0-23, hora de Lima), sumando su
 * `total`. Devuelve un Map — el caller decide qué rango de horas mostrar (desde
 * que abrió la caja hasta ahora), esta función no inventa un rango fijo.
 */
export function ventasPorHora(eventos: readonly { hora: string; total: number }[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const e of eventos) {
    const t = new Date(e.hora).getTime();
    if (Number.isNaN(t)) continue;
    const hora = Math.floor(horaDelDiaLima(t) / 3_600_000);
    mapa.set(hora, (mapa.get(hora) ?? 0) + e.total);
  }
  return mapa;
}

/** Las horas a dibujar en el gráfico: desde que abrió la caja hasta ahora (o hasta
 *  la última hora con datos si "ahora" cayó antes por algún reloj desfasado). Nunca
 *  un rango fijo 9am-8pm — una sede que abre a las 8 o cierra a las 9 se vería con
 *  columnas vacías que no existen. */
export function rangoHorasCaja(abiertaEn: string, ahora: Date): number[] {
  const horaApertura = Math.floor(horaDelDiaLima(new Date(abiertaEn).getTime()) / 3_600_000);
  const horaActual = Math.floor(horaDelDiaLima(ahora.getTime()) / 3_600_000);
  const desde = Math.min(horaApertura, horaActual);
  const hasta = Math.max(horaApertura, horaActual);
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

export type PuntoTendenciaCierres = { diaLabel: string; monto: number; descuadre: boolean; esHoy: boolean };

/**
 * Últimos 7 días (calendario Lima) de cierres de ESTA sede, uno por día — si un día
 * tuvo más de un cierre se suman. `monto` es lo neto que entró en efectivo al cajón
 * ese día (cierre real − apertura, la misma resta que ya hace `montoCierreReal −
 * montoApertura` en el resto del sistema); `descuadre` es true si algún cierre de
 * ese día no cuadró (mismo umbral < 0.01 que `CerrarCajaModalV2`/`CierreCajaDetalle`).
 */
export function tendenciaCierres7Dias(
  cierres: readonly { ubicacionId: string; cerradaEn: string; montoApertura: number; montoCierreReal: number; diferencia: number }[],
  ubicacionId: string,
  ahora: Date
): PuntoTendenciaCierres[] {
  const hoy = diaLima(ahora.getTime());
  const porDia = new Map<number, { monto: number; descuadre: boolean }>();
  for (const c of cierres) {
    if (c.ubicacionId !== ubicacionId || !c.cerradaEn) continue;
    const dia = diaLima(new Date(c.cerradaEn).getTime());
    if (hoy - dia < 0 || hoy - dia >= DIAS_TREND_CIERRES) continue;
    const previo = porDia.get(dia) ?? { monto: 0, descuadre: false };
    porDia.set(dia, {
      monto: previo.monto + (c.montoCierreReal - c.montoApertura),
      descuadre: previo.descuadre || Math.abs(c.diferencia) >= 0.01,
    });
  }

  return Array.from({ length: DIAS_TREND_CIERRES }, (_, i) => {
    const dia = hoy - (DIAS_TREND_CIERRES - 1 - i);
    const punto = porDia.get(dia);
    const fecha = inicioDeDiaLima(dia);
    return {
      diaLabel: NOMBRES_DIA[fecha.getUTCDay()]!,
      monto: punto?.monto ?? 0,
      descuadre: punto?.descuadre ?? false,
      esHoy: dia === hoy,
    };
  });
}

export type Comparativo = { texto: string; positivo: boolean };

/** "▲ 12% vs. martes pasado" / null si no hay con qué comparar (semana pasada en
 *  cero: dividir daría un falso "infinito por ciento" en vez de decir la verdad). */
export function comparativoSemanaAnterior(hoy: number, semanaAnterior: number, nombreDiaPasado: string): Comparativo | null {
  if (semanaAnterior <= 0) return null;
  const pct = Math.round(((hoy - semanaAnterior) / semanaAnterior) * 100);
  const flecha = pct >= 0 ? "▲" : "▼";
  return { texto: `${flecha} ${Math.abs(pct)}% vs. ${nombreDiaPasado} pasado`, positivo: pct >= 0 };
}

/**
 * ponytail: el pedido original comparaba egresos contra el promedio de la semana
 * PARA ESTA HORA — eso pide historial de egresos por hora que hoy no existe en
 * ningún lado (ver auditoría). En vez de inventar esa infraestructura para un
 * banner, se usa una señal más simple pero igual de real: egresos ya son una
 * porción grande de lo vendido HOY MISMO (sin datos históricos, sin queries
 * nuevas). Umbral 15%: por encima de eso un egreso deja de ser un gasto chico del
 * día y empieza a valer la pena que alguien lo mire. Subir a comparar contra el
 * promedio real de días anteriores cuando exista esa serie histórica (BACKLOG).
 */
const UMBRAL_EGRESOS_SOBRE_VENTAS = 0.15;

export function egresosElevados(egresosHoy: number, ventasHoy: number): { alerta: boolean; pct: number } {
  if (ventasHoy <= 0 || egresosHoy <= 0) return { alerta: false, pct: 0 };
  const pct = egresosHoy / ventasHoy;
  return { alerta: pct >= UMBRAL_EGRESOS_SOBRE_VENTAS, pct: Math.round(pct * 100) };
}

/** Repropone el badge del encabezado sin romper el conteo ciego (ADR-0042): nunca
 *  compara contra "lo esperado" mientras la caja sigue abierta — solo informa si
 *  hay ventas offline sin subir, que es una señal real y verificable en cualquier
 *  momento sin necesidad de contar el cajón. */
export function senalCaja(cantidadEnCola: number): { tono: "verde" | "ambar"; texto: string } {
  if (cantidadEnCola === 0) return { tono: "verde", texto: "Caja abierta · sin pendientes" };
  return {
    tono: "ambar",
    texto: cantidadEnCola === 1 ? "1 venta sin subir" : `${cantidadEnCola} ventas sin subir`,
  };
}
