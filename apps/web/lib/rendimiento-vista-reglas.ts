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

/** Lo de UNA persona en el tramo. `turno` es su turno de hoy, y `ahoraMin`, los minutos de Lima (`null` si todavía no se conocen). */
export function medirPersona(entrada: {
  personaId: string;
  nombre: string;
  filas: readonly FilaPersonaDia[];
  tramo: Tramo;
  hoy: string;
  turno: TurnoDeHoy | null;
  ahoraMin: number | null;
}): MedidaPersona {
  const { personaId, nombre, filas, tramo, hoy, turno, ahoraMin } = entrada;
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
  const { meta, tocaba, metaHoy, tocabaHoy } = metaYTocaba(filas, tramo, hoy, fraccion);
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
    lectura: lecturaDeRitmo(vendido, meta, ritmo),
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
    medirPersona({ personaId: p.personaId, nombre: p.nombre, filas: porPersona.get(p.personaId) ?? [], tramo, hoy, turno: p, ahoraMin }),
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
    lectura: meta !== null && meta > 0 && tocaba !== null ? lecturaDeRitmo(vendido, meta, tocaba / meta) : null,
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

function juntar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** La frase de arriba: a quién reconocer y a quién acompañar. Solo dice lo que `lecturaDeRitmo` ya dijo; sin lecturas, no dice nada. */
export function fraseDelEquipo(medidas: readonly MedidaPersona[]): string | null {
  const conLectura = medidas.filter((m) => m.lectura !== null);
  if (conLectura.length === 0) return null;
  const adelante = conLectura.filter((m) => m.lectura === "Adelante").map((m) => primerNombre(m.nombre));
  const debajo = conLectura.filter((m) => m.lectura === "Por debajo").map((m) => primerNombre(m.nombre));
  if (adelante.length === 0 && debajo.length === 0) return conLectura.length === 1 ? `${primerNombre(conLectura[0].nombre)} va en ritmo.` : "Todo el equipo va en ritmo.";
  return [
    adelante.length ? `${juntar(adelante)} ${adelante.length > 1 ? "van" : "va"} adelante.` : "",
    debajo.length ? `Conviene acompañar a ${juntar(debajo)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
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
