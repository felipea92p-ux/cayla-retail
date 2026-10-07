// Reglas puras del «Historial de cierres» de Caja (modal de la cabecera y detalle de cada cierre). Sin React ni
// Supabase: el resumen, el agrupado por mes y las cifras del cuadre se calculan aquí y se prueban aparte.

import type { CierreCaja } from "@/lib/caja";

const ZONA = "America/Lima";

export type EstadoCierre = "cuadro" | "sobro" | "falto";

/** Mismo umbral que `CerrarCajaModalV2` y el historial de siempre: menos de 1 céntimo es «cuadró». */
export function estadoCierre(diferencia: number): EstadoCierre {
  if (Math.abs(diferencia) < 0.01) return "cuadro";
  return diferencia > 0 ? "sobro" : "falto";
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export type ResumenCierres = { total: number; cuadraron: number; conDiferencia: number; diferenciaNeta: number };

export function resumirCierres(cierres: CierreCaja[]): ResumenCierres {
  let cuadraron = 0;
  let neta = 0;
  for (const c of cierres) {
    if (estadoCierre(c.diferencia) === "cuadro") cuadraron += 1;
    else neta += c.diferencia;
  }
  return { total: cierres.length, cuadraron, conDiferencia: cierres.length - cuadraron, diferenciaNeta: redondear(neta) };
}

export type GrupoMes = { clave: string; etiqueta: string; cierres: CierreCaja[] };

function partes(iso: string) {
  const p = new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "numeric", weekday: "short" }).formatToParts(new Date(iso));
  const de = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { anio: de("year"), mes: de("month"), dia: de("day"), diaSemana: de("weekday").replace(".", "") };
}

/** El número de día y el día de la semana, para el bloque de fecha de cada fila (hora de Lima). */
export function bloqueFecha(iso: string): { dia: string; diaSemana: string } {
  const { dia, diaSemana } = partes(iso);
  return { dia, diaSemana };
}

/** Agrupa por mes de Lima conservando el orden recibido (el más reciente primero). */
export function agruparPorMes(cierres: CierreCaja[]): GrupoMes[] {
  const grupos: GrupoMes[] = [];
  for (const c of cierres) {
    const { anio, mes } = partes(c.cerradaEn);
    const clave = `${anio}-${mes}`;
    let g = grupos.find((x) => x.clave === clave);
    if (!g) {
      const nombre = new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, month: "long" }).format(new Date(c.cerradaEn));
      g = { clave, etiqueta: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`, cierres: [] };
      grupos.push(g);
    }
    g.cierres.push(c);
  }
  return grupos;
}

/** «12 h 35 min» · «45 min». Vacío si las fechas no se pueden leer o van al revés. */
export function duracionTurno(abiertaEn: string, cerradaEn: string): string {
  const min = Math.round((new Date(cerradaEn).getTime() - new Date(abiertaEn).getTime()) / 60000);
  if (!Number.isFinite(min) || min < 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")} min`;
}

/**
 * El cuadre en tres cifras que SIEMPRE suman: apertura + lo que movió el efectivo = lo que el sistema esperaba.
 * «Lo que movió» se deriva (esperado − apertura) en vez de sumar ventas, ingresos y devoluciones por separado: las
 * ventas de pago mixto no dicen cuánto fue efectivo, y una suma aparte podría no calzar con el esperado de la base.
 */
export function cuadreDelTurno(c: Pick<CierreCaja, "montoApertura" | "montoCierreSistema">) {
  return { apertura: c.montoApertura, movio: redondear(c.montoCierreSistema - c.montoApertura), esperado: c.montoCierreSistema };
}

/** A dónde fue el efectivo contado: lo trasladado y lo que quedó en el cajón, con su parte de la barra (0–100). `null` en cierres sin traslado registrado (anteriores a ADR-0186). */
export function rutaDelEfectivo(c: Pick<CierreCaja, "montoCierreReal" | "montoFondo" | "traslados">) {
  if (c.montoFondo === null) return null;
  const trasladado = redondear(c.traslados.reduce((a, t) => a + t.monto, 0));
  const total = redondear(trasladado + c.montoFondo);
  const pctTrasladado = total > 0 ? Math.round((trasladado / total) * 100) : 0;
  return { trasladado, quedo: c.montoFondo, total, pctTrasladado, pctQuedo: total > 0 ? 100 - pctTrasladado : 0 };
}
