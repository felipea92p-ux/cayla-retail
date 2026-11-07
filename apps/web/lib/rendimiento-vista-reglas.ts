/**
 * Rendimiento con superpoderes (ADR-0610): la lógica pura de la pantalla, sobre lo que trae `fn_rendimiento_persona_dias`.
 * Sin React ni supabase, para probarla contra números a mano (`rendimiento-vista-reglas.test.ts`). Quien dice «Adelante / En ritmo / Por
 * debajo» sigue siendo `lecturaDeRitmo`, y a dónde se llega, `proyectarMes`: aquí no se escribe otra versión de esas reglas.
 *
 * PROMETE:
 *   (1) un tramo de días cualquiera se mide con las metas REALES de esos días (por horas programadas o partes iguales), nunca con un reparto inventado;
 *   (2) sin meta, ni porcentaje ni lectura: `null`, y la pantalla dice qué falta;
 *   (3) lo que tocaba solo cuenta lo que ya pasó: de hoy, la parte del turno que ya corrió; sin turno, nada de hoy;
 *   (4) un tramo que empieza el 1 del mes se mide contra la meta de TODO el mes, y uno que empieza después, contra la de sus días;
 *   (5) las ventas sin quien atendió suman en la tienda y nunca en una persona.
 * ASUME: fechas `aaaa-mm-dd` de Lima; `hoy` lo calcula el servidor; `ahoraMin` es `null` hasta que el navegador conoce la hora.
 */

import { diasEntreFechas, sumarDias } from "./fechas-lima";
import { esMuestraChica } from "./rendimiento-reglas";
import {
  lecturaDeRitmo,
  primerDiaDelMes,
  proyectarMes,
  ritmoDelTurno,
  ultimoDiaDelMes,
  type DiaSerie,
  type LecturaRitmo,
  type PersonaMeta,
  type ProyeccionMes,
} from "./rendimiento-meta-reglas";

/** Una fila de `fn_rendimiento_persona_dias`. `personaId` nulo: ventas sin quien atendió. */
export type FilaPersonaDia = {
  personaId: string | null;
  nombre: string | null;
  fecha: string;
  metaDia: number | null;
  ventas: number;
  total: number;
  prendas: number;
};

/** Días elegidos, los dos incluidos. */
export type Tramo = { desde: string; hasta: string };
export type Preset = "hoy" | "semana" | "mes";

export const PRESETS: { clave: Preset; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "semana", etiqueta: "7 días" },
  { clave: "mes", etiqueta: "Este mes" },
];

export function tramoDePreset(preset: Preset, hoy: string): Tramo {
  if (preset === "hoy") return { desde: hoy, hasta: hoy };
  if (preset === "semana") return { desde: sumarDias(hoy, -6), hasta: hoy };
  return { desde: primerDiaDelMes(hoy), hasta: hoy };
}

/** El preset que corresponde a un tramo; `null` si se eligió a mano. El 1 del mes, «Hoy» gana a «Este mes» (son el mismo día). */
export function presetDeTramo(t: Tramo, hoy: string): Preset | null {
  return (["hoy", "semana", "mes"] as const).find((p) => {
    const x = tramoDePreset(p, hoy);
    return x.desde === t.desde && x.hasta === t.hasta;
  }) ?? null;
}

/** Lo que se le pide a la base: el mes pasado entero (para comparar) y este mes hasta su último día (las metas de lo que falta). */
export function rangoDeLecturaPersonas(hoy: string): Tramo {
  const inicio = primerDiaDelMes(hoy);
  return { desde: primerDiaDelMes(sumarDias(inicio, -1)), hasta: ultimoDiaDelMes(hoy) };
}

/** Los días del eje: el mes entero y, a inicio de mes, lo que le falta para que quepan los últimos 7 días. */
export function diasDelEje(hoy: string): string[] {
  const ini = primerDiaDelMes(hoy);
  const semana = sumarDias(hoy, -6);
  const desde = semana < ini ? semana : ini;
  const fin = ultimoDiaDelMes(hoy);
  return Array.from({ length: diasEntreFechas(desde, fin) + 1 }, (_, i) => sumarDias(desde, i));
}

const dentro = (f: string, t: Tramo) => f >= t.desde && f <= t.hasta;

export type MedidaPersona = {
  personaId: string;
  nombre: string;
  vendido: number;
  ventas: number;
  prendas: number;
  /** Soles por venta; `null` sin ventas. */
  ticket: number | null;
  /** Menos de 40 ventas en el tramo: su ticket todavía se mueve mucho. */
  muestraChica: boolean;
  /** La meta contra la que se mide: la del mes si el tramo empieza el 1; si no, la de sus días. `null`: sin meta. */
  meta: number | null;
  /** Lo que tocaba llevar hasta ahora dentro del tramo. */
  tocaba: number | null;
  /** Avance contra `meta`, sin redondear. */
  pct: number | null;
  /** Dónde va la marca de «lo que tocaba», contra `meta`. */
  tocaPct: number | null;
  lectura: LecturaRitmo | null;
  /** De hoy dentro del tramo: su meta y la parte que ya corrió de su turno. Con esto la tienda calcula lo que tocaba hoy. */
  metaHoy: number;
  tocabaHoy: number;
  /** El día del tramo en que más vendió; `null` si no vendió nada. */
  mejorDia: { fecha: string; total: number } | null;
};

type TurnoDeHoy = Pick<PersonaMeta, "entradaHoy" | "salidaHoy">;

/**
 * La meta y lo que tocaba de un grupo de filas en un tramo. De hoy solo cuenta lo que ya pasó del turno (D-159): sin turno o sin hora,
 * nada de hoy; así, un tramo que es solo hoy no dice «por debajo» a las 10 de la mañana a quien recién entra.
 */
function metaYTocaba(filas: readonly FilaPersonaDia[], tramo: Tramo, hoy: string, fraccionDeHoy: number | null) {
  const inicioMes = primerDiaDelMes(hoy);
  const finMes = ultimoDiaDelMes(hoy);
  const desdeInicio = tramo.desde === inicioMes;
  let meta = 0;
  let tocaba = 0;
  let metaHoy = 0;
  let tocabaHoy = 0;
  let hayMeta = false;
  for (const f of filas) {
    const m = f.metaDia ?? 0;
    if (m <= 0) continue;
    if (desdeInicio ? f.fecha >= inicioMes && f.fecha <= finMes : dentro(f.fecha, tramo)) {
      meta += m;
      hayMeta = true;
    }
    if (!dentro(f.fecha, tramo) || f.fecha > hoy) continue;
    if (f.fecha === hoy) {
      metaHoy += m;
      tocabaHoy += m * (fraccionDeHoy ?? 0);
      tocaba += m * (fraccionDeHoy ?? 0);
    } else tocaba += m;
  }
  return hayMeta ? { meta, tocaba, metaHoy, tocabaHoy } : { meta: null, tocaba: null, metaHoy: 0, tocabaHoy: 0 };
}

/** Desde cuántos días ya pasados del tramo se compara contra lo que tocaba. Antes, una sola venta decidiría. */
const DIAS_PARA_MEDIR_CONTRA_LO_QUE_TOCABA = 3;

/** Los días del tramo que ya terminaron. Son los mismos para todo el equipo: si dependieran del descanso de cada uno, el mismo día habría dos medidas. */
function diasYaPasados(tramo: Tramo, hoy: string): number {
  const ayer = sumarDias(hoy, -1);
  const hasta = tramo.hasta < ayer ? tramo.hasta : ayer;
  return tramo.desde > hasta ? 0 : diasEntreFechas(tramo.desde, hasta) + 1;
}

/**
 * Cómo va en un tramo (ADR-0610, Felipe 2026-11-04). Fuera de hoy, 10 % arriba o abajo de lo que tocaba: así la palabra dice lo mismo el día 4
 * que el día 25. Medido contra el mes entero, el día 4 casi nadie podía estar «Por debajo». Hoy y los primeros días siguen con `lecturaDeRitmo`
 * (D-159): ahí la banda sería de un par de tickets.
 */
function lecturaDelTramo(vendido: number, meta: number | null, tocaba: number | null, tramo: Tramo, hoy: string): LecturaRitmo | null {
  if (meta === null || meta <= 0 || tocaba === null || tocaba <= 0) return null;
  if (diasYaPasados(tramo, hoy) < DIAS_PARA_MEDIR_CONTRA_LO_QUE_TOCABA) return lecturaDeRitmo(vendido, meta, tocaba / meta);
  const d = Math.round((vendido / tocaba - 1) * 1000) / 1000;
  return d >= 0.1 ? "Adelante" : d <= -0.1 ? "Por debajo" : "En ritmo";
}

/** Lo de UNA persona en el tramo. `turno` es su turno de hoy, y `ahoraMin`, los minutos de Lima (`null` si todavía no se conocen). */
export function medirPersona(entrada: {
  personaId: string;
  nombre: string;
  filas: readonly FilaPersonaDia[];
  tramo: Tramo;
  hoy: string;
  turno: TurnoDeHoy | null;
  ahoraMin: number | null;
  /** Su meta del mes tal como la guarda la base. Las metas de cada día van redondeadas: sumadas no dan exacto, y la cifra que se ve es esta. */
  metaMes?: number | null;
}): MedidaPersona {
  const { personaId, nombre, filas, tramo, hoy, turno, ahoraMin, metaMes } = entrada;
  let vendido = 0;
  let ventas = 0;
  let prendas = 0;
  let mejorDia: MedidaPersona["mejorDia"] = null;
  for (const f of filas) {
    if (!dentro(f.fecha, tramo)) continue;
    vendido += f.total;
    ventas += f.ventas;
    prendas += f.prendas;
    if (f.total > 0 && (mejorDia === null || f.total > mejorDia.total)) mejorDia = { fecha: f.fecha, total: f.total };
  }
  const fraccion = turno !== null && ahoraMin !== null ? ritmoDelTurno(turno, ahoraMin) : null;
  const medido = metaYTocaba(filas, tramo, hoy, fraccion);
  const { tocaba, metaHoy, tocabaHoy } = medido;
  const meta = medido.meta !== null && tramo.desde === primerDiaDelMes(hoy) && (metaMes ?? 0) > 0 ? (metaMes as number) : medido.meta;
  const conMeta = meta !== null && meta > 0;
  const ritmo = conMeta && tocaba !== null ? tocaba / meta : null;
  return {
    personaId,
    nombre,
    vendido,
    ventas,
    prendas,
    ticket: ventas > 0 ? vendido / ventas : null,
    muestraChica: esMuestraChica(ventas),
    meta,
    tocaba,
    pct: conMeta ? (vendido / meta) * 100 : null,
    tocaPct: ritmo !== null ? ritmo * 100 : null,
    lectura: lecturaDelTramo(vendido, meta, tocaba, tramo, hoy),
    metaHoy,
    tocabaHoy,
    mejorDia,
  };
}

/** Las filas de la tienda agrupadas por persona, para no recorrerlas todas por cada persona en cada gesto. */
export function filasPorPersona(filas: readonly FilaPersonaDia[]): Map<string, FilaPersonaDia[]> {
  const m = new Map<string, FilaPersonaDia[]>();
  for (const f of filas) {
    if (f.personaId === null) continue;
    const lista = m.get(f.personaId);
    if (lista) lista.push(f);
    else m.set(f.personaId, [f]);
  }
  return m;
}

/**
 * Una medida por persona: las del equipo (aunque no hayan vendido) y quien vendió sin estar en él (con su nombre y sin meta), en el orden
 * alfabético de siempre. La tabla los ordena después como pida la persona.
 */
export function medirEquipo(entrada: {
  personas: readonly PersonaMeta[];
  filas: readonly FilaPersonaDia[];
  tramo: Tramo;
  hoy: string;
  ahoraMin: number | null;
}): MedidaPersona[] {
  const { personas, filas, tramo, hoy, ahoraMin } = entrada;
  const porPersona = filasPorPersona(filas);
  const delEquipo = personas.map((p) =>
    medirPersona({ personaId: p.personaId, nombre: p.nombre, filas: porPersona.get(p.personaId) ?? [], tramo, hoy, turno: p, ahoraMin, metaMes: p.metaMes }),
  );
  const ids = new Set(personas.map((p) => p.personaId));
  const deAfuera = [...porPersona.entries()]
    .filter(([id, fs]) => !ids.has(id) && fs.some((f) => f.total > 0 && dentro(f.fecha, tramo)))
    .map(([id, fs]) => medirPersona({ personaId: id, nombre: fs[0]?.nombre ?? "Sin nombre", filas: fs, tramo, hoy, turno: null, ahoraMin }));
  return [...delEquipo, ...deAfuera].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** La serie de un grupo de personas, con la forma de la de la tienda: así `proyectarMes` y el gráfico sirven igual. */
export function serieDeFilas(filas: readonly FilaPersonaDia[], incluir: (personaId: string | null) => boolean): DiaSerie[] {
  const m = new Map<string, DiaSerie>();
  for (const f of filas) {
    if (!incluir(f.personaId)) continue;
    const d = m.get(f.fecha) ?? { fecha: f.fecha, total: 0, ventas: 0, metaSede: null, metaAsignada: null };
    d.total += f.total;
    d.ventas += f.ventas;
    if ((f.metaDia ?? 0) > 0) d.metaSede = (d.metaSede ?? 0) + (f.metaDia ?? 0);
    m.set(f.fecha, d);
  }
  return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type MedidaGrupo = {
  vendido: number;
  ventas: number;
  prendas: number;
  ticket: number | null;
  meta: number | null;
  tocaba: number | null;
  /** Positiva: va por encima de lo que tocaba. `null`: sin meta, o todavía no toca nada (hoy, antes de los turnos): no hay contra qué comparar. */
  diferencia: number | null;
  lectura: LecturaRitmo | null;
};

/**
 * Lo de un grupo en el tramo. Con `serieTienda` es la tienda entera: lo vendido y la meta salen de su serie (cuadra con caja y con el resto del
 * ERP, y cuenta las ventas sin quien atendió), y lo que tocaba hoy, de cuánto ha corrido el turno de cada persona. Sin ella, la suma de las personas.
 */
export function medirGrupo(entrada: { medidas: readonly MedidaPersona[]; tramo: Tramo; hoy: string; serieTienda?: readonly DiaSerie[] | null }): MedidaGrupo {
  const { medidas, tramo, hoy, serieTienda } = entrada;
  const sumaPersonas = (f: (m: MedidaPersona) => number | null) => medidas.reduce((s, m) => s + (f(m) ?? 0), 0);
  const prendas = sumaPersonas((m) => m.prendas);
  const metaPersonas = sumaPersonas((m) => m.meta);
  const tocabaPersonas = sumaPersonas((m) => m.tocaba);
  let vendido = sumaPersonas((m) => m.vendido);
  let ventas = sumaPersonas((m) => m.ventas);
  let meta: number | null = medidas.some((m) => m.meta !== null) ? metaPersonas : null;
  let tocaba: number | null = meta === null ? null : tocabaPersonas;
  if (serieTienda) {
    const dias = serieTienda.filter((d) => dentro(d.fecha, tramo));
    vendido = dias.reduce((s, d) => s + d.total, 0);
    ventas = dias.reduce((s, d) => s + d.ventas, 0);
    const inicioMes = primerDiaDelMes(hoy);
    const finMes = ultimoDiaDelMes(hoy);
    const contados = tramo.desde === inicioMes ? serieTienda.filter((d) => d.fecha >= inicioMes && d.fecha <= finMes) : dias;
    const conMeta = contados.filter((d) => (d.metaSede ?? 0) > 0);
    meta = conMeta.length > 0 ? conMeta.reduce((s, d) => s + (d.metaSede ?? 0), 0) : null;
    if (meta === null) tocaba = null;
    else {
      // La meta puede no cuadrar con lo repartido (una líder ajustó a alguien): lo que tocaba de hoy se saca en proporción a las personas.
      const pasados = dias.filter((d) => d.fecha < hoy).reduce((s, d) => s + (d.metaSede ?? 0), 0);
      const deHoy = dias.find((d) => d.fecha === hoy)?.metaSede ?? 0;
      const metaHoyPersonas = sumaPersonas((m) => m.metaHoy);
      const fraccion = dentro(hoy, tramo) && metaHoyPersonas > 0 ? sumaPersonas((m) => m.tocabaHoy) / metaHoyPersonas : 0;
      tocaba = pasados + deHoy * fraccion;
    }
  }
  const conMeta = meta !== null && meta > 0;
  return {
    vendido,
    ventas,
    prendas,
    ticket: ventas > 0 ? vendido / ventas : null,
    meta,
    tocaba,
    diferencia: conMeta && tocaba !== null && tocaba > 0 ? vendido - tocaba : null,
    lectura: lecturaDelTramo(vendido, meta, tocaba, tramo, hoy),
  };
}

/** A dónde se llega con un grupo: la proyección real, y lo que hace falta por día para llegar a la meta. */
export function simuladorDeCierre(serie: readonly DiaSerie[], hoy: string): (ProyeccionMes & { faltaPorDia: number | null; tope: number }) | null {
  const p = proyectarMes([...serie], hoy);
  if (!p) return null;
  const faltaPorDia = p.metaMes !== null && p.diasQueQuedan > 0 ? Math.max(0, (p.metaMes - p.vendido) / p.diasQueQuedan) : null;
  // La barra llega hasta un poco más de lo que haría falta, para que siempre se pueda probar «¿y si llegamos?».
  const tope = Math.max(50, Math.ceil((Math.max(p.ritmoPorDia * 2, (faltaPorDia ?? 0) * 1.2) || 50) / 50) * 50);
  return { ...p, faltaPorDia, tope };
}

/** Dónde cierra el mes si desde mañana se vende `porDia` cada día de trabajo. */
export function cierreSimulado(p: Pick<ProyeccionMes, "vendido" | "diasQueQuedan">, porDia: number): number {
  return p.vendido + Math.max(0, porDia) * p.diasQueQuedan;
}

const primerNombre = (nombre: string) => nombre.split(" ")[0] ?? nombre;

export type ParteFrase = string | { personaId: string; nombre: string };

function juntar(medidas: readonly MedidaPersona[]): ParteFrase[] {
  return medidas.flatMap((m, i): ParteFrase[] => {
    const nombre = { personaId: m.personaId, nombre: primerNombre(m.nombre) };
    if (i === 0) return [nombre];
    return [i === medidas.length - 1 ? " y " : ", ", nombre];
  });
}

/** La frase de arriba, en piezas: cada nombre lleva a su persona. Solo dice lo que ya dijo la lectura de cada una; sin lecturas, no dice nada. */
export function fraseDelEquipo(medidas: readonly MedidaPersona[]): ParteFrase[] | null {
  const conLectura = medidas.filter((m) => m.lectura !== null);
  if (conLectura.length === 0) return null;
  const adelante = conLectura.filter((m) => m.lectura === "Adelante");
  const debajo = conLectura.filter((m) => m.lectura === "Por debajo");
  if (adelante.length === 0 && debajo.length === 0) return conLectura.length === 1 ? [...juntar(conLectura), " va en ritmo."] : ["Todo el equipo va en ritmo."];
  const partes: ParteFrase[] = [];
  if (adelante.length) partes.push(...juntar(adelante), adelante.length > 1 ? " van adelante." : " va adelante.");
  if (debajo.length) partes.push(adelante.length ? " Conviene acompañar a " : "Conviene acompañar a ", ...juntar(debajo), ".");
  return partes;
}

/** La misma frase, de corrido. */
export function fraseEnTexto(partes: readonly ParteFrase[]): string {
  return partes.map((p) => (typeof p === "string" ? p : p.nombre)).join("");
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const mesDe = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1];
const diaDe = (iso: string) => Number(iso.slice(8, 10));

/** El tramo dicho en palabras: «este mes», «hoy», «los últimos 7 días», «el 12 de octubre», «del 5 al 12 de octubre». */
export function tramoEnPalabras(t: Tramo, hoy: string): string {
  const p = presetDeTramo(t, hoy);
  if (p === "hoy") return "hoy";
  if (p === "semana") return "los últimos 7 días";
  if (p === "mes") return "este mes";
  if (t.desde === t.hasta) return `el ${diaDe(t.desde)} de ${mesDe(t.desde)}`;
  if (t.desde.slice(0, 7) === t.hasta.slice(0, 7)) return `del ${diaDe(t.desde)} al ${diaDe(t.hasta)} de ${mesDe(t.hasta)}`;
  return `del ${diaDe(t.desde)} de ${mesDe(t.desde)} al ${diaDe(t.hasta)} de ${mesDe(t.hasta)}`;
}

/** «hoy», «ayer», «hace 3 días». */
export function hacePocoEnPalabras(fecha: string, hoy: string): string {
  const d = diasEntreFechas(fecha, hoy);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

// ───────────────────────── el gráfico ─────────────────────────

/** Lo de un día del eje, por persona. `null` en `metaDia`: ese día nadie tiene meta. */
export type DiaEje = { fecha: string; porPersona: ReadonlyMap<string | null, number>; total: number; metaDia: number | null };

/** Cada día del eje con lo que vendió cada persona que se está mirando. `incluir` decide quién (nulo: las ventas sin quien atendió). */
export function diasParaGrafico(dias: readonly string[], filas: readonly FilaPersonaDia[], incluir: (personaId: string | null) => boolean): DiaEje[] {
  const porFecha = new Map<string, { porPersona: Map<string | null, number>; meta: number; hayMeta: boolean; total: number }>();
  for (const f of filas) {
    if (!incluir(f.personaId)) continue;
    const d = porFecha.get(f.fecha) ?? { porPersona: new Map<string | null, number>(), meta: 0, hayMeta: false, total: 0 };
    d.porPersona.set(f.personaId, (d.porPersona.get(f.personaId) ?? 0) + f.total);
    d.total += f.total;
    if ((f.metaDia ?? 0) > 0) {
      d.meta += f.metaDia ?? 0;
      d.hayMeta = true;
    }
    porFecha.set(f.fecha, d);
  }
  return dias.map((fecha) => {
    const d = porFecha.get(fecha);
    return { fecha, porPersona: d?.porPersona ?? new Map(), total: d?.total ?? 0, metaDia: d?.hayMeta ? d.meta : null };
  });
}

/** Lo sumado día a día desde el 1 del mes; `null` en los días de antes (a inicio de mes el eje empieza en el mes pasado). */
export function sumadoDelMes(eje: readonly DiaEje[], hoy: string, hasta: string = hoy): (number | null)[] {
  const inicio = primerDiaDelMes(hoy);
  let suma = 0;
  return eje.map((d) => {
    if (d.fecha < inicio) return null;
    if (d.fecha <= hasta) suma += d.total;
    return suma;
  });
}

/** La meta sumada día a día desde el 1 del mes: la curva de lo que tocaba. `null` antes del mes o si nadie tiene meta. */
export function metaSumadaDelMes(eje: readonly DiaEje[], hoy: string): (number | null)[] {
  const inicio = primerDiaDelMes(hoy);
  if (!eje.some((d) => d.fecha >= inicio && (d.metaDia ?? 0) > 0)) return eje.map(() => null);
  let suma = 0;
  return eje.map((d) => {
    if (d.fecha < inicio) return null;
    suma += d.metaDia ?? 0;
    return suma;
  });
}

/**
 * Lo del mes pasado puesto sobre los días de este: el día 12 con el día 12. Si el mes pasado fue más corto, los últimos días no tienen con qué
 * compararse (`null`). `sumado` lo va acumulando desde el 1.
 */
export function mesPasadoEnEje(dias: readonly string[], filas: readonly FilaPersonaDia[], hoy: string, incluir: (personaId: string | null) => boolean, sumado: boolean): (number | null)[] {
  const inicio = primerDiaDelMes(hoy);
  const pasadoIni = primerDiaDelMes(sumarDias(inicio, -1));
  const pasadoFin = sumarDias(inicio, -1);
  const porDia = new Map<number, number>();
  for (const f of filas) {
    if (f.fecha < pasadoIni || f.fecha > pasadoFin || !incluir(f.personaId)) continue;
    const n = Number(f.fecha.slice(8, 10));
    porDia.set(n, (porDia.get(n) ?? 0) + f.total);
  }
  const ultimo = Number(pasadoFin.slice(8, 10));
  let suma = 0;
  return dias.map((fecha) => {
    if (fecha < inicio) return null;
    const n = Number(fecha.slice(8, 10));
    if (n > ultimo) return null;
    const v = porDia.get(n) ?? 0;
    suma += v;
    return sumado ? suma : v;
  });
}

export type GestoTramo = "nuevo" | "desde" | "hasta" | "mover";

/** Qué hace arrastrar desde un punto: sobre un borde lo mueve, dentro del tramo lo traslada, y fuera elige uno nuevo. Con el mes entero, siempre uno nuevo. */
export function gestoEn(x: number, bordeDesde: number, bordeHasta: number, todoElMes: boolean, tolerancia = 12): GestoTramo {
  if (todoElMes) return "nuevo";
  if (Math.abs(x - bordeDesde) <= tolerancia) return "desde";
  if (Math.abs(x - bordeHasta) <= tolerancia) return "hasta";
  return x > bordeDesde && x < bordeHasta ? "mover" : "nuevo";
}

/**
 * El tramo mientras se arrastra, por posición en el eje. Nunca pasa de hoy (lo que no ha llegado no se elige) y nunca queda al revés. `inicio`
 * es el tramo al empezar a arrastrar, y `desdeI` y `hastaI`, sus posiciones.
 */
export function tramoArrastrado(entrada: { gesto: GestoTramo; dias: readonly string[]; hoy: string; desdeI: number; hastaI: number; puntoInicial: number; puntoAhora: number }): Tramo {
  const { gesto, dias, hoy, desdeI, hastaI, puntoInicial, puntoAhora } = entrada;
  const ultimo = Math.max(0, dias.lastIndexOf(hoy));
  const pos = (i: number) => Math.max(0, Math.min(ultimo, i));
  let a: number;
  let b: number;
  if (gesto === "desde") {
    a = Math.min(pos(puntoAhora), hastaI);
    b = hastaI;
  } else if (gesto === "hasta") {
    a = desdeI;
    b = Math.max(pos(puntoAhora), desdeI);
  } else if (gesto === "mover") {
    const largo = hastaI - desdeI;
    a = Math.max(0, Math.min(ultimo - largo, desdeI + (puntoAhora - puntoInicial)));
    b = a + largo;
  } else {
    a = Math.min(pos(puntoInicial), pos(puntoAhora));
    b = Math.max(pos(puntoInicial), pos(puntoAhora));
  }
  return { desde: dias[a], hasta: dias[b] };
}

// ───────────────────────── la fila abierta ─────────────────────────

/**
 * Lo de una persona si su meta del mes fuera otra: «la meta de cada día se recalcula sola, en la misma proporción» (D-146). Solo cambia el mes en curso;
 * el mes pasado no se toca. Sirve para mostrar qué pasaría ANTES de guardar.
 */
export function filasConOtraMeta(filas: readonly FilaPersonaDia[], hoy: string, metaActual: number, metaNueva: number): FilaPersonaDia[] {
  if (metaActual <= 0) return [...filas];
  const inicio = primerDiaDelMes(hoy);
  const factor = metaNueva / metaActual;
  return filas.map((f) => (f.fecha >= inicio && f.metaDia !== null ? { ...f, metaDia: f.metaDia * factor } : f));
}

const DIAS_EN_PLURAL = ["los domingos", "los lunes", "los martes", "los miércoles", "los jueves", "los viernes", "los sábados"];

/** El día de la semana que más vende una persona en el mes en curso, y qué parte de lo suyo es. `null` sin ventas, o si ese día solo vendió una vez. */
export function suDiaFuerte(filas: readonly FilaPersonaDia[], hoy: string): { dia: string; parte: number } | null {
  const inicio = primerDiaDelMes(hoy);
  const suma = [0, 0, 0, 0, 0, 0, 0];
  const veces = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const f of filas) {
    if (f.fecha < inicio || f.fecha > hoy || f.total <= 0) continue;
    const dia = new Date(`${f.fecha}T12:00:00Z`).getUTCDay();
    suma[dia] += f.total;
    veces[dia] += 1;
    total += f.total;
  }
  if (total <= 0) return null;
  const i = suma.indexOf(Math.max(...suma));
  // Un solo lunes no dice que venda más los lunes: hacen falta al menos dos.
  if (veces[i] < 2) return null;
  return { dia: DIAS_EN_PLURAL[i], parte: Math.round((suma[i] / total) * 100) };
}

export type DiaCalendario = { fecha: string; n: number; total: number; intensidad: number; llego: boolean };

/** El mes de una persona, para su calendario: cuánto vendió cada día, con la intensidad (0–1) contra su mejor día. Lo que no ha llegado va apagado. */
export function calendarioDelMes(filas: readonly FilaPersonaDia[], hoy: string): { hueco: number; dias: DiaCalendario[] } {
  const inicio = primerDiaDelMes(hoy);
  const fin = ultimoDiaDelMes(hoy);
  const porFecha = new Map<string, number>();
  for (const f of filas) if (f.fecha >= inicio && f.fecha <= fin) porFecha.set(f.fecha, (porFecha.get(f.fecha) ?? 0) + f.total);
  const tope = Math.max(1, ...porFecha.values());
  const largo = diasEntreFechas(inicio, fin) + 1;
  // La semana empieza el lunes, como en la pared de la tienda.
  const hueco = (new Date(`${inicio}T12:00:00Z`).getUTCDay() + 6) % 7;
  return {
    hueco,
    dias: Array.from({ length: largo }, (_, i) => {
      const fecha = sumarDias(inicio, i);
      const total = porFecha.get(fecha) ?? 0;
      return { fecha, n: i + 1, total, intensidad: total / tope, llego: fecha <= hoy };
    }),
  };
}

// ───────────────────────── la URL y el buscador ─────────────────────────

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Los días que pide la URL: un tramo válido dentro del eje y sin pasar de hoy; `vista` es el enlace de antes; sin nada, este mes. */
export function tramoDeUrl(p: { desde?: string | null; hasta?: string | null; vista?: string | null }, hoy: string): Tramo {
  const { desde, hasta, vista } = p;
  if (desde && hasta && FECHA_ISO.test(desde) && FECHA_ISO.test(hasta) && desde <= hasta && hasta <= hoy && diasDelEje(hoy).includes(desde)) return { desde, hasta };
  if (vista === "hoy" || vista === "semana") return tramoDePreset(vista, hoy);
  return tramoDePreset("mes", hoy);
}

const sinMarcas = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type IntencionBusqueda =
  | { tipo: "persona"; personaId: string; nombre: string }
  | { tipo: "lectura"; lectura: LecturaRitmo; cuantas: number }
  | { tipo: "tramo"; tramo: Tramo; texto: string }
  | { tipo: "sede"; ubicacionId: string; nombre: string }
  | { tipo: "modo"; modo: "dia" | "persona" | "suma"; texto: string }
  | { tipo: "mesPasado" };

const PALABRAS_MODO: { clave: string; modo: "dia" | "persona" | "suma"; texto: string }[] = [
  { clave: "sumado", modo: "suma", texto: "Ver lo sumado" },
  { clave: "acumulado", modo: "suma", texto: "Ver lo sumado" },
  { clave: "por persona", modo: "persona", texto: "Ver por persona" },
  { clave: "cada dia", modo: "dia", texto: "Ver cada día" },
];

/**
 * Lo que puede querer decir lo que se escribió: una persona, «por debajo», «esta semana», «día 10», «del 5 al 12», una tienda, un modo del gráfico o
 * «mes pasado». No adivina: solo ofrece, y la persona elige. Un día que no ha llegado o de otro mes no se ofrece.
 */
export function interpretarBusqueda(
  texto: string,
  c: { medidas: readonly MedidaPersona[]; sedes: readonly { ubicacionId: string; nombre: string }[]; activaId: string; hoy: string },
): IntencionBusqueda[] {
  const q = sinMarcas(texto);
  if (!q) return [];
  const res: IntencionBusqueda[] = [];
  const delMes = (n: number) => {
    const iso = `${c.hoy.slice(0, 8)}${String(n).padStart(2, "0")}`;
    return n >= 1 && iso <= c.hoy ? iso : null;
  };
  const rango = q.match(/^del?\s*(\d{1,2})\s*(?:al?|-)\s*(\d{1,2})$/);
  if (rango) {
    const [x, y] = [Number(rango[1]), Number(rango[2])];
    const a = delMes(Math.min(x, y));
    const b = delMes(Math.max(x, y));
    if (a && b) {
      const t = { desde: a, hasta: b };
      res.push({ tipo: "tramo", tramo: t, texto: tramoEnPalabras(t, c.hoy) });
    }
  }
  const uno = q.match(/^(?:dia\s*)?(\d{1,2})$/);
  if (uno) {
    const d = delMes(Number(uno[1]));
    if (d) {
      const t = { desde: d, hasta: d };
      res.push({ tipo: "tramo", tramo: t, texto: tramoEnPalabras(t, c.hoy) });
    }
  }
  for (const m of c.medidas) if (sinMarcas(m.nombre).includes(q)) res.push({ tipo: "persona", personaId: m.personaId, nombre: m.nombre });
  for (const l of ["Adelante", "En ritmo", "Por debajo"] as const) {
    if (!sinMarcas(l).includes(q)) continue;
    const cuantas = c.medidas.filter((m) => m.lectura === l).length;
    if (cuantas > 0) res.push({ tipo: "lectura", lectura: l, cuantas });
  }
  const periodos: [string, Preset][] = [["hoy", "hoy"], ["7 dias", "semana"], ["semana", "semana"], ["este mes", "mes"], ["mes", "mes"]];
  const periodo = periodos.find(([k]) => k.startsWith(q) && q.length >= 2);
  if (periodo) {
    const t = tramoDePreset(periodo[1], c.hoy);
    res.push({ tipo: "tramo", tramo: t, texto: tramoEnPalabras(t, c.hoy) });
  }
  if (q === "ayer" || (q.length >= 3 && "ayer".startsWith(q))) {
    const d = sumarDias(c.hoy, -1);
    if (diasDelEje(c.hoy).includes(d)) res.push({ tipo: "tramo", tramo: { desde: d, hasta: d }, texto: "ayer" });
  }
  for (const s of c.sedes) if (s.ubicacionId !== c.activaId && sinMarcas(s.nombre).includes(q)) res.push({ tipo: "sede", ubicacionId: s.ubicacionId, nombre: s.nombre });
  for (const m of PALABRAS_MODO) if (m.clave.includes(q) && q.length >= 3 && !res.some((r) => r.tipo === "modo" && r.modo === m.modo)) res.push({ tipo: "modo", modo: m.modo, texto: m.texto });
  if (q.length >= 5 && "mes pasado".startsWith(q)) res.push({ tipo: "mesPasado" });
  if (q.length >= 3 && "pasado".startsWith(q)) res.push({ tipo: "mesPasado" });
  return res.slice(0, 6);
}

/** ¿El nombre de esta persona tiene lo que se escribió? Sin escribir, todas. */
export function nombreCoincide(nombre: string, texto: string): boolean {
  const q = sinMarcas(texto);
  return q === "" || sinMarcas(nombre).includes(q);
}

/** Lo que se ve, para bajarlo: columnas y filas, sin meta si la tienda no tiene. El archivo lo arma `descargarCsv`, el de todo el ERP. */
export function loQueSeBaja(medidas: readonly MedidaPersona[], conMeta: boolean): { encabezados: string[]; filas: (string | number)[][] } {
  return {
    encabezados: ["Persona", ...(conMeta ? ["Cómo va", "Avance %", "Meta"] : []), "Vendido", "Ventas", "Prendas", "Ticket", "Mejor día"],
    filas: medidas.map((m) => [
      m.nombre,
      ...(conMeta ? [m.lectura ?? "", m.pct === null ? "" : Math.round(m.pct), m.meta === null ? "" : Math.round(m.meta)] : []),
      Math.round(m.vendido),
      m.ventas,
      m.prendas,
      m.ticket === null ? "" : Math.round(m.ticket),
      m.mejorDia?.fecha ?? "",
    ]),
  };
}
