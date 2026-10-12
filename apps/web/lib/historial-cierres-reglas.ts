// Reglas puras del «Historial de cierres» de Caja (modal de la cabecera y detalle de cada cierre). Sin React ni
// Supabase: el resumen, el agrupado por mes y las cifras del cuadre se calculan aquí y se prueban aparte.

import type { CierreCaja } from "@/lib/caja";
import { claveDeMetodo, cobradoDelTurno, type MetodoCobrado } from "./caja-tablero-reglas";
import { NOMBRES_MES, type Mes } from "./facturacion-reglas";

const ZONA = "America/Lima";

export type EstadoCierre = "cuadro" | "sobro" | "falto";

/** Mismo umbral que `CerrarCajaModalV2` y el historial de siempre: menos de 1 céntimo es «cuadró». */
export function estadoCierre(diferencia: number): EstadoCierre {
  if (Math.abs(diferencia) < 0.01) return "cuadro";
  return diferencia > 0 ? "sobro" : "falto";
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Cuántas veces y cuánto, en positivo: lo que dice cada sello del modal («FALTÓ · 4 veces · S/ 631.80»). */
export type VecesYMonto = { veces: number; monto: number };

export type ResumenCierres = {
  total: number;
  cuadraron: number;
  conDiferencia: number;
  diferenciaNeta: number;
  faltaron: VecesYMonto;
  sobraron: VecesYMonto;
};

export function resumirCierres(cierres: CierreCaja[]): ResumenCierres {
  let cuadraron = 0;
  let neta = 0;
  const faltaron = { veces: 0, monto: 0 };
  const sobraron = { veces: 0, monto: 0 };
  for (const c of cierres) {
    const estado = estadoCierre(c.diferencia);
    if (estado === "cuadro") {
      cuadraron += 1;
      continue;
    }
    neta += c.diferencia;
    const lado = estado === "falto" ? faltaron : sobraron;
    lado.veces += 1;
    lado.monto += Math.abs(c.diferencia);
  }
  return {
    total: cierres.length,
    cuadraron,
    conDiferencia: cierres.length - cuadraron,
    diferenciaNeta: redondear(neta),
    faltaron: { veces: faltaron.veces, monto: redondear(faltaron.monto) },
    sobraron: { veces: sobraron.veces, monto: redondear(sobraron.monto) },
  };
}

/** El filtro del modal: todos, solo los que faltó o solo los que sobró (Felipe 2026-10-12, maqueta E «Los tickets»). */
export type FiltroCierres = "todos" | "falto" | "sobro";

export function filtrarCierres(cierres: CierreCaja[], filtro: FiltroCierres): CierreCaja[] {
  return filtro === "todos" ? cierres : cierres.filter((c) => estadoCierre(c.diferencia) === filtro);
}

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

// ---------------------------------------------------------------------------------------------------------------
// El mes del modal y su gráfico (Felipe 2026-10-12): el modal abre siempre en el mes actual, se puede elegir cualquier
// mes del año (los que aún no llegan, bloqueados) o pasar al año anterior, y arriba un gráfico de barras con lo que se
// contó en cada cierre del mes, día por día. Todo en hora de Lima (UTC−5 fijo, Perú no cambia la hora).

/** El mes (de Lima) en que cayó un instante. */
export function mesDeLima(iso: string): Mes {
  const { anio, mes } = partes(iso);
  return { anio: Number(anio), mes: Number(mes) };
}

/** El día de Lima (año, mes y día) de un instante. */
export function diaDeLima(iso: string): Mes & { dia: number } {
  const { anio, mes, dia } = partes(iso);
  return { anio: Number(anio), mes: Number(mes), dia: Number(dia) };
}

/** Desde y hasta (sin incluir) de un mes de Lima, para pedirle a la base los cierres de ese mes. */
export function limitesDelMes({ anio, mes }: Mes): { desde: string; hasta: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const sig = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
  return { desde: `${anio}-${pad(mes)}-01T00:00:00-05:00`, hasta: `${sig.anio}-${pad(sig.mes)}-01T00:00:00-05:00` };
}

export function diasEnMes({ anio, mes }: Mes): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

const compararMes = (a: Mes, b: Mes) => a.anio * 12 + a.mes - (b.anio * 12 + b.mes);

/** Un mes del selector: su nombre y si todavía no llega (se ve, no se elige). */
export type MesDelSelector = { mes: number; nombre: string; bloqueado: boolean };

/** Los doce meses de un año para el selector; los posteriores al mes actual van bloqueados. */
export function mesesDelSelector(anio: number, actual: Mes): MesDelSelector[] {
  return NOMBRES_MES.map((nombre, i) => ({ mes: i + 1, nombre, bloqueado: compararMes({ anio, mes: i + 1 }, actual) > 0 }));
}

/**
 * Un día del gráfico. `cierres`: los que se CERRARON ese día, del más antiguo al más nuevo (así quedan de izquierda a
 * derecha). Sin cierres, el día es `abierta` si una caja seguía abierta esa noche (se abrió antes y se cerró después),
 * `hoy` si es hoy, `futuro` si todavía no llega y `vacio` si no hubo caja.
 */
export type DiaGrafico = { dia: number; cierres: CierreCaja[]; tipo: "con" | "abierta" | "hoy" | "futuro" | "vacio" };

export function diasDelGrafico(cierres: CierreCaja[], mes: Mes, hoy: Mes & { dia: number }): DiaGrafico[] {
  const total = diasEnMes(mes);
  const porDia = new Map<number, CierreCaja[]>();
  const abiertas = new Set<number>();
  // Un día se cuenta por su número dentro del mes; lo de otros meses queda fuera (o, si la caja cruzó de mes, en el borde).
  const indice = (d: Mes & { dia: number }) => {
    const c = compararMes(d, mes);
    return c < 0 ? 0 : c > 0 ? total + 1 : d.dia;
  };
  for (const c of [...cierres].sort((a, b) => a.cerradaEn.localeCompare(b.cerradaEn))) {
    const cierre = diaDeLima(c.cerradaEn);
    if (compararMes(cierre, mes) === 0) porDia.set(cierre.dia, [...(porDia.get(cierre.dia) ?? []), c]);
    // La caja quedó abierta las noches entre el día que se abrió y el anterior al que se cerró.
    for (let d = Math.max(1, indice(diaDeLima(c.abiertaEn))); d < Math.min(total + 1, indice(cierre)); d++) abiertas.add(d);
  }
  const esMesActual = compararMes(mes, hoy) === 0;
  const esFuturo = compararMes(mes, hoy) > 0;
  return Array.from({ length: total }, (_, i) => {
    const dia = i + 1;
    const delDia = porDia.get(dia) ?? [];
    if (delDia.length > 0) return { dia, cierres: delDia, tipo: "con" as const };
    const tipo = abiertas.has(dia)
      ? ("abierta" as const)
      : esFuturo || (esMesActual && dia > hoy.dia)
        ? ("futuro" as const)
        : esMesActual && dia === hoy.dia
          ? ("hoy" as const)
          : ("vacio" as const);
    return { dia, cierres: [], tipo };
  });
}

/** El techo del gráfico: lo más alto entre lo que se contó y lo que debía haber, redondeado hacia arriba a S/ 500. */
export function topeDelGrafico(cierres: Pick<CierreCaja, "montoCierreReal" | "montoCierreSistema">[]): number {
  const max = Math.max(0, ...cierres.map((c) => Math.max(c.montoCierreReal, c.montoCierreSistema)));
  return Math.max(500, Math.ceil(max / 500) * 500);
}

/** «Octubre 2026». */
export function nombreDelMes({ anio, mes }: Mes): string {
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
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

// ---------------------------------------------------------------------------------------------------------------
// Detalle de un cierre (2026-10-10): lo cobrado en el turno, por medio de pago.

export type CobroMedio = { clave: MetodoCobrado["clave"]; texto: string; monto: number; ventas: number; pct: number };

/**
 * Lo cobrado en una caja por medio de pago, para «Qué se cobró» del detalle de un cierre. Recibe un renglón por cada pago de una venta NO
 * anulada y reusa `cobradoDelTurno` (Yape y Plin juntos; el anticipo de una separación y el redondeo no son una forma de pago), así que
 * suma igual que el tablero de Caja. `ventas` cuenta ventas distintas que usaron ese medio (una venta con pago mixto cuenta en cada uno).
 * `pct` es la parte del total (0–100, redondeada: la suma de los porcentajes puede dar 99 o 101).
 */
export function cobrosPorMedio(pagos: readonly { ventaId: string; metodo: string; monto: number }[]): { total: number; anticipo: number; medios: CobroMedio[] } {
  const porMetodo: Record<string, number> = {};
  const ventasDe = new Map<MetodoCobrado["clave"], Set<string>>();
  for (const p of pagos) {
    porMetodo[p.metodo] = (porMetodo[p.metodo] ?? 0) + p.monto;
    if (p.metodo === "anticipo" || p.metodo === "redondeo" || !(p.monto > 0)) continue;
    const clave = claveDeMetodo(p.metodo);
    const set = ventasDe.get(clave) ?? new Set<string>();
    set.add(p.ventaId);
    ventasDe.set(clave, set);
  }
  const { total, anticipo, metodos } = cobradoDelTurno(porMetodo);
  return {
    total,
    anticipo,
    medios: metodos.map((m) => ({ clave: m.clave, texto: m.texto, monto: m.monto, ventas: ventasDe.get(m.clave)?.size ?? 0, pct: total > 0 ? Math.round((m.monto / total) * 100) : 0 })),
  };
}
