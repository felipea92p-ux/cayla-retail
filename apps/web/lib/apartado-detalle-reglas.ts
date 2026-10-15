// El detalle de UN apartado (ADR-0414, Felipe 2026-10-15): su historial completo y las opciones para aplazarlo. Sin React ni red:
// se prueba en `apartado-detalle-reglas.test.ts`. La base vuelve a validar todo (`aplazar_separacion`); esto solo guía a quien atiende.
//
// CONTRATO
//   PROMETE: `detalleDeFila` lee lo que devuelve `fn_detalle_separacion` (o null si no llegó); `historialDelApartado` arma la historia
//            en orden de cuándo pasó, con la fecha y hora exactas de cada pago y quién lo cobró; si el detalle no llegó (la base no
//            responde o todavía no tiene la función), la arma con lo que la lista ya trae, sin nombres. `opcionesAplazar` dice desde
//            qué día se aplaza, hasta cuál se puede y por qué no, con las mismas reglas y frases que la base.
//   ASUME:   un `Apartado` de `buscar_separaciones` y `hoy` en `aaaa-mm-dd` de Lima.

import type { MetodoPago } from "@cayla-retail/shared";
import { diaLima, diasEntreFechas, sumarDias } from "./fechas-lima";
import { EXTENSIONES_MAX, type Apartado } from "./separaciones-reglas";

/** Un apartado se guarda como mucho 30 días desde el día en que se apartó (Felipe 2026-10-15). La base usa el mismo número. */
export const TOPE_DIAS_APARTADO = 30;
/** Los dos atajos de «Aplazar», en días desde el vencimiento (o desde hoy, si ya venció). */
export const ATAJOS_APLAZAR = [3, 7] as const;

export type PagoDetalle = {
  id: string;
  metodo: MetodoPago;
  monto: number;
  /** En efectivo: con cuánto pagó (el vuelto es la diferencia). */
  recibido: number | null;
  fecha: string;
  abono: boolean;
  /** «Esperarla N días más» que se eligió al abonar: 0 si no. */
  diasEspera: number;
  venceDespues: string | null;
  por: string | null;
};
export type AplazamientoDetalle = { venceAntes: string; venceDespues: string; fecha: string; por: string | null };
export type DetalleApartado = {
  creadaPor: string | null;
  extensiones: number;
  pagos: PagoDetalle[];
  aplazamientos: AplazamientoDetalle[];
  avisos: { fecha: string; por: string | null }[];
  entregadaEn: string | null;
  entregadaPor: string | null;
  liberadaEn: string | null;
  liberadaPor: string | null;
  liberadaMotivo: string | null;
  devueltaEn: string | null;
  devueltaPor: string | null;
  devolucionMedioReal: string | null;
};

const texto = (x: unknown) => (typeof x === "string" && x !== "" ? x : null);
const lista = (x: unknown) => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);

/** Lo que devuelve `fn_detalle_separacion` (jsonb), con nombres de TypeScript. `null` si no es un detalle. */
export function detalleDeFila(j: unknown): DetalleApartado | null {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const f = j as Record<string, unknown>;
  return {
    creadaPor: texto(f.creada_por),
    extensiones: Number(f.extensiones ?? 0),
    pagos: lista(f.pagos).map((p) => ({
      id: String(p.id ?? ""),
      metodo: p.metodo as MetodoPago,
      monto: Number(p.monto ?? 0),
      recibido: p.recibido == null ? null : Number(p.recibido),
      fecha: String(p.fecha ?? ""),
      abono: Boolean(p.abono),
      diasEspera: Number(p.dias_espera ?? 0),
      venceDespues: texto(p.vence_despues),
      por: texto(p.por),
    })),
    aplazamientos: lista(f.aplazamientos).map((a) => ({
      venceAntes: String(a.vence_antes ?? ""),
      venceDespues: String(a.vence_despues ?? ""),
      fecha: String(a.fecha ?? ""),
      por: texto(a.por),
    })),
    avisos: lista(f.avisos).map((a) => ({ fecha: String(a.fecha ?? ""), por: texto(a.por) })),
    entregadaEn: texto(f.entregada_en),
    entregadaPor: texto(f.entregada_por),
    liberadaEn: texto(f.liberada_en),
    liberadaPor: texto(f.liberada_por),
    liberadaMotivo: texto(f.liberada_motivo),
    devueltaEn: texto(f.devuelta_en),
    devueltaPor: texto(f.devuelta_por),
    devolucionMedioReal: texto(f.devolucion_medio_real),
  };
}

export type EventoApartado =
  | { tipo: "aparto"; fecha: string; por: string | null; total: number }
  | { tipo: "pago"; fecha: string; por: string | null; pago: Omit<PagoDetalle, "por" | "fecha"> }
  | { tipo: "aplazo"; fecha: string; por: string | null; venceAntes: string; venceDespues: string }
  | { tipo: "aviso"; fecha: string; por: string | null }
  | { tipo: "entrego"; fecha: string; por: string | null; saldo: number }
  | { tipo: "libero"; fecha: string; por: string | null; motivo: string | null; solo: boolean }
  | { tipo: "devolvio"; fecha: string; por: string | null; monto: number; medio: string | null };

// Si dos cosas pasaron en el mismo instante (el adelanto nace en la misma transacción que el apartado), va primero lo que pasó antes
// en la vida del apartado.
const ORDEN: Record<EventoApartado["tipo"], number> = { aparto: 0, pago: 1, aviso: 2, aplazo: 3, entrego: 4, libero: 5, devolvio: 6 };

/**
 * La historia del apartado, de lo más antiguo a lo más nuevo. Con `detalle` lleva quién hizo cada cosa; sin él (la base no respondió),
 * lo mismo que la lista ya trae —el apartado y cada pago con su fecha y hora—, sin nombres.
 */
export function historialDelApartado(a: Apartado, detalle: DetalleApartado | null): EventoApartado[] {
  const eventos: EventoApartado[] = [{ tipo: "aparto", fecha: a.creadaEn, por: detalle?.creadaPor ?? null, total: a.total }];
  const pagos: PagoDetalle[] =
    detalle?.pagos ??
    a.pagos.map((p, i) => ({ id: String(i), metodo: p.metodo, monto: p.monto, recibido: null, fecha: p.fecha ?? a.creadaEn, abono: p.abono, diasEspera: 0, venceDespues: null, por: null }));
  for (const { fecha, por, ...pago } of pagos) eventos.push({ tipo: "pago", fecha, por, pago });
  if (detalle) {
    for (const x of detalle.aplazamientos) eventos.push({ tipo: "aplazo", ...x });
    for (const x of detalle.avisos) eventos.push({ tipo: "aviso", ...x });
    if (detalle.entregadaEn) eventos.push({ tipo: "entrego", fecha: detalle.entregadaEn, por: detalle.entregadaPor, saldo: a.total - a.adelanto });
    if (detalle.liberadaEn)
      eventos.push({ tipo: "libero", fecha: detalle.liberadaEn, por: detalle.liberadaPor, motivo: detalle.liberadaMotivo, solo: detalle.liberadaPor === null && a.liberadaSola });
    if (detalle.devueltaEn) eventos.push({ tipo: "devolvio", fecha: detalle.devueltaEn, por: detalle.devueltaPor, monto: a.adelanto, medio: detalle.devolucionMedioReal });
  }
  // En el mismo instante, el adelanto antes que un abono.
  const rango = (e: EventoApartado) => ORDEN[e.tipo] * 2 + (e.tipo === "pago" && e.pago.abono ? 1 : 0);
  return eventos.sort((x, y) => Date.parse(x.fecha) - Date.parse(y.fecha) || rango(x) - rango(y));
}

/** Los aplazamientos de antes del historial (ADR-0414): la base los contó pero no guardó cuándo ni quién. */
export function aplazamientosSinFecha(a: Pick<Apartado, "extensiones">, detalle: DetalleApartado | null): number {
  return detalle ? Math.max(0, a.extensiones - detalle.aplazamientos.length) : 0;
}

export type OpcionesAplazar = {
  /** Desde qué día se cuenta: el vencimiento, o hoy si ya venció. La nueva fecha tiene que ser posterior. */
  desde: string;
  /** El último día posible: 30 días desde que se apartó. */
  tope: string;
  /** Cuántos aplazamientos le quedan (0, 1 o 2). */
  restantes: number;
  /** Por qué no se puede aplazar, en palabras de tienda; null si se puede. */
  bloqueo: string | null;
  atajos: { dias: number; fecha: string; cabe: boolean }[];
};

const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function opcionesAplazar(a: Pick<Apartado, "estado" | "venceEl" | "creadaEn" | "extensiones">, hoy: string): OpcionesAplazar {
  const desde = a.venceEl > hoy ? a.venceEl : hoy;
  const tope = sumarDias(diaLima(a.creadaEn) ?? hoy, TOPE_DIAS_APARTADO);
  const restantes = Math.max(0, EXTENSIONES_MAX - a.extensiones);
  const bloqueo =
    a.estado !== "abierta"
      ? "Solo se aplaza un apartado abierto."
      : restantes === 0
        ? `Ya se aplazó ${EXTENSIONES_MAX} veces: no se puede aplazar más.`
        : desde >= tope
          ? `Ya llegó al tope: un apartado se guarda como mucho ${TOPE_DIAS_APARTADO} días desde que se apartó.`
          : null;
  const atajos = ATAJOS_APLAZAR.map((dias) => {
    const fecha = sumarDias(desde, dias);
    return { dias, fecha, cabe: fecha <= tope };
  });
  return { desde, tope, restantes, bloqueo, atajos };
}

/** Lo que la base rechazaría de esa fecha, con su misma frase; null si se puede guardar. */
export function motivoFechaAplazar(fecha: string, o: OpcionesAplazar): string | null {
  if (o.bloqueo) return o.bloqueo;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Elige hasta qué día se aplaza.";
  if (fecha <= o.desde) return `La nueva fecha tiene que ser después del ${ddmmaaaa(o.desde)}.`;
  if (fecha > o.tope) return `Un apartado se guarda como mucho ${TOPE_DIAS_APARTADO} días desde que se apartó: hasta el ${ddmmaaaa(o.tope)}.`;
  return null;
}

/** «3 días más», «1 día más»: cuánto se estira contra la fecha de hoy del apartado. */
export function textoDiasMas(desde: string, fecha: string): string {
  const n = diasEntreFechas(desde, fecha);
  return `${n} ${n === 1 ? "día" : "días"} más`;
}
