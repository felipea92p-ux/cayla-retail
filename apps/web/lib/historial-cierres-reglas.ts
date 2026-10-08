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

// ---------------------------------------------------------------------------------------------------------------
// Página «Historial de cierres» (/caja/historial, rediseño 2026-10-08, maqueta docs/maquetas/historial-cierres-2026-10):
// una fila por cierre con columnas parejas (tienda · quién · debía haber · se contó · ¿cuadró?), agrupadas por día.

/** Cuántos cierres por página. La tabla pesa poco por fila, pero cada fila trae extras (traslados, fondo) aparte. */
export const CIERRES_POR_PAGINA = 20;

/** La respuesta de la columna «¿Cuadró?», en palabras de tienda. */
export function textoResultado(diferencia: number): string {
  const estado = estadoCierre(diferencia);
  if (estado === "cuadro") return "Sí, cuadró";
  const monto = "S/ " + Math.abs(diferencia).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${estado === "falto" ? "Faltaron" : "Sobraron"} ${monto}`;
}

/** Quién atendió la caja: dicho una vez si abrió y cerró la misma persona. `null` si no se sabe quién. */
export function quienAtendio(c: Pick<CierreCaja, "abiertaPorNombre" | "cerradaPorNombre">): { mismaPersona: true; nombre: string } | { mismaPersona: false; abrio: string; cerro: string } {
  const abrio = c.abiertaPorNombre ?? "—";
  const cerro = c.cerradaPorNombre ?? "—";
  if (c.abiertaPorNombre && c.abiertaPorNombre === c.cerradaPorNombre) return { mismaPersona: true, nombre: abrio };
  return { mismaPersona: false, abrio, cerro };
}

export type GrupoDia = { clave: string; etiqueta: string; cierres: CierreCaja[] };

/** Agrupa por día de Lima («Miércoles 7 de octubre»), conservando el orden recibido (el más reciente primero). */
export function agruparPorDia(cierres: CierreCaja[]): GrupoDia[] {
  const grupos: GrupoDia[] = [];
  for (const c of cierres) {
    const { anio, mes, dia } = partes(c.cerradaEn);
    const clave = `${anio}-${mes}-${dia.padStart(2, "0")}`;
    let g = grupos[grupos.length - 1];
    if (!g || g.clave !== clave) {
      const texto = new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(new Date(c.cerradaEn));
      g = { clave, etiqueta: texto.charAt(0).toUpperCase() + texto.slice(1).replace(",", ""), cierres: [] };
      grupos.push(g);
    }
    g.cierres.push(c);
  }
  return grupos;
}

export type FilaResumen = { ubicacionId: string; diferencia: number; cerradaEn: string };

export type ResumenPeriodo = {
  total: number;
  cuadraron: number;
  falto: number;
  cierresFalto: number;
  sobro: number;
  cierresSobro: number;
  /** El primer y el último cierre del conjunto (ISO), para decir «del 3 al 7 de octubre». */
  desde: string | null;
  hasta: string | null;
  /** Cuántos cierres tiene cada sede, para el número de su píldora de filtro. */
  porSede: Map<string, number>;
};

/** Las tres cifras de arriba, sobre TODOS los cierres del filtro (no solo la página que se ve). */
export function resumirPeriodo(filas: FilaResumen[]): ResumenPeriodo {
  const r: ResumenPeriodo = { total: filas.length, cuadraron: 0, falto: 0, cierresFalto: 0, sobro: 0, cierresSobro: 0, desde: null, hasta: null, porSede: new Map() };
  for (const f of filas) {
    const estado = estadoCierre(f.diferencia);
    if (estado === "cuadro") r.cuadraron += 1;
    else if (estado === "falto") {
      r.falto += -f.diferencia;
      r.cierresFalto += 1;
    } else {
      r.sobro += f.diferencia;
      r.cierresSobro += 1;
    }
    if (f.cerradaEn && (!r.desde || f.cerradaEn < r.desde)) r.desde = f.cerradaEn;
    if (f.cerradaEn && (!r.hasta || f.cerradaEn > r.hasta)) r.hasta = f.cerradaEn;
    r.porSede.set(f.ubicacionId, (r.porSede.get(f.ubicacionId) ?? 0) + 1);
  }
  r.falto = redondear(r.falto);
  r.sobro = redondear(r.sobro);
  return r;
}

/** «del 3 al 7 de octubre» · «del 28 de septiembre al 7 de octubre» · «del 30 de diciembre de 2025 al 4 de enero de 2026» · «el 7 de octubre». */
export function textoPeriodo(desde: string | null, hasta: string | null): string {
  if (!desde || !hasta) return "";
  const p = (iso: string) => {
    const x = new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(iso));
    const de = (t: string) => x.find((y) => y.type === t)?.value ?? "";
    return { dia: de("day"), mes: de("month"), anio: de("year") };
  };
  const a = p(desde);
  const b = p(hasta);
  if (a.dia === b.dia && a.mes === b.mes && a.anio === b.anio) return `el ${b.dia} de ${b.mes}`;
  if (a.anio !== b.anio) return `del ${a.dia} de ${a.mes} de ${a.anio} al ${b.dia} de ${b.mes} de ${b.anio}`;
  if (a.mes !== b.mes) return `del ${a.dia} de ${a.mes} al ${b.dia} de ${b.mes}`;
  return `del ${a.dia} al ${b.dia} de ${b.mes}`;
}

/** La hora del cierre en Lima («08:13 p. m.»). */
export function horaLima(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** La página pedida por URL, siempre dentro de [1, total]. */
export function paginaValida(texto: string | undefined, totalPaginas: number): number {
  const n = Number.parseInt(texto ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, totalPaginas));
}

/** La línea bajo la racha de «Último cierre»: «Últimos 5 cierres de esta tienda: 2 cuadraron, 2 faltaron, 1 sobró». */
export function rachaDeCierres(cierres: Pick<CierreCaja, "diferencia">[]): { total: number; texto: string } {
  const n = { cuadro: 0, falto: 0, sobro: 0 };
  for (const c of cierres) n[estadoCierre(c.diferencia)] += 1;
  const partes: string[] = [];
  if (n.cuadro) partes.push(`${n.cuadro} ${n.cuadro === 1 ? "cuadró" : "cuadraron"}`);
  if (n.falto) partes.push(`${n.falto} ${n.falto === 1 ? "faltó" : "faltaron"}`);
  if (n.sobro) partes.push(`${n.sobro} ${n.sobro === 1 ? "sobró" : "sobraron"}`);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : (partes[0] ?? "");
  return { total: cierres.length, texto: `Últimos ${cierres.length} cierres de esta tienda: ${lista}.` };
}
