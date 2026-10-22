// La planilla PROVISIONADA por sede (ADR-0453, Felipe 2026-10-17; «Provisionado» y lo de hoy, 2026-10-22). Lógica pura: la usan el Resumen,
// Resultados y el medidor de confianza.
//
// EL PROBLEMA. Dynamic solo le entrega a retail la planilla cuando la marca pagada, unos días después de cerrar el período (del 29 al 28):
// casi todo el mes cada sede se veía SIN sueldos, el «te quedan» salía inflado y «Tu ritmo» pedía menos de lo que hace falta vender.
// La base ya sabe lo que corresponde pagar hasta hoy (`fn_planilla_provision`: la boleta en vivo de Dynamic, agregada por sede, con el
// sueldo fijo en proporción a los días, y —aparte— lo que llevan hoy quienes están en su jornada). Qué hace este archivo: leerlo y sumarlo, MARCADO como provisionado, a las filas del Estado de
// resultados. Qué NO hace: calcular plata (la cifra sale de Dynamic) ni tocar el libro (el diario, el Balance y el cierre siguen con lo
// pagado de verdad: la provisión vive solo en lo que se ve, y desaparece sola cuando Dynamic paga ese período).

import { solesER, type DetalleGastoER, type FilaER } from "./resultados-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);
const txt = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Una sede de Dynamic en un período sin pagar, con lo que corresponde pagar hasta hoy. Nunca una persona: solo importes por sede. */
export type FilaProvision = {
  /** `null` = «de la empresa» (la central y la oficina de Trujillo). */
  ubicacionId: string | null;
  /** El código de la sede en Dynamic («TRU», «LIM» = el Taller…). Solo para el log; la pantalla usa la unidad. */
  sedeCodigo: string;
  unidad: "tienda" | "taller" | "empresa";
  periodoId: string;
  /** «2026-09-28». */
  fechaIni: string;
  fechaFin: string;
  personas: number;
  diasPeriodo: number;
  diasCorridos: number;
  /**
   * Lo que corresponde pagar hasta hoy: las horas de las jornadas ya cerradas, el sueldo fijo en proporción a los días y, SUMADO AQUÍ al leer, lo de
   * hoy (`deHoy`). La base los devuelve en columnas aparte (`devengado`, `hoy_estimado`); la pantalla solo conoce el total.
   */
  devengado: number;
  /**
   * De `devengado`, lo que es de HOY: lo que llevan hasta ahora quienes están en su jornada, calculado por horas y movilidad (Dynamic no lo cuenta
   * hasta que cierran). 0 si no hay, si hoy es feriado o si la base todavía no lo trae. Se corrige solo cuando cada persona cierra su jornada.
   */
  deHoy: number;
  /** Lo que costaría el período entero; `null` con menos de 7 días corridos (una semana rara decidiría el mes). */
  alCierre: number | null;
};

const UNIDADES: readonly FilaProvision["unidad"][] = ["tienda", "taller", "empresa"];

/** Las filas de `fn_planilla_provision` (los `numeric` viajan como texto) → tipos de la pantalla. Lo que no es una fila válida se descarta. */
export function leerProvision(data: unknown): FilaProvision[] {
  if (!Array.isArray(data)) return [];
  const filas: FilaProvision[] = [];
  for (const x of data) {
    const r = obj(x);
    const periodoId = txt(r.periodo_id);
    if (!periodoId) continue;
    const deHoy = Math.max(0, r2(num(r.hoy_estimado)));
    filas.push({
      ubicacionId: txt(r.ubicacion_id),
      sedeCodigo: String(r.sede_codigo ?? ""),
      unidad: UNIDADES.includes(r.unidad as FilaProvision["unidad"]) ? (r.unidad as FilaProvision["unidad"]) : "empresa",
      periodoId,
      fechaIni: String(r.fecha_ini ?? "").slice(0, 10),
      fechaFin: String(r.fecha_fin ?? "").slice(0, 10),
      personas: num(r.personas),
      diasPeriodo: num(r.dias_periodo),
      diasCorridos: num(r.dias_corridos),
      // Lo de hoy viene aparte (nulo = sin estimado) y entra al devengado; una base sin la columna (antes de pegar su migración) da 0.
      devengado: r2(num(r.devengado) + deHoy),
      deHoy,
      alCierre: r.al_cierre == null ? null : num(r.al_cierre),
    });
  }
  return filas;
}

/** Las filas de un mes («2026-10»): el período que TERMINA en ese mes es la planilla de ese mes (D-35). */
export const delMes = (prov: readonly FilaProvision[], mes: string): FilaProvision[] => prov.filter((p) => p.fechaFin.slice(0, 7) === mes);

/** La clave con la que una fila de provisión cae en una fila del Estado de resultados: la ubicación, o «empresa». */
const claveDe = (p: FilaProvision): string => p.ubicacionId ?? "empresa";

type Suma = { devengado: number; alCierre: number; personas: number; deHoy: number };
const vacia = (): Suma => ({ devengado: 0, alCierre: 0, personas: 0, deHoy: 0 });
function sumar(s: Suma, p: FilaProvision): Suma {
  return {
    devengado: r2(s.devengado + p.devengado),
    // Sin proyección todavía (pocos días corridos), el período entero no se adivina: vale lo devengado, nunca menos.
    alCierre: r2(s.alCierre + Math.max(p.devengado, p.alCierre ?? p.devengado)),
    personas: s.personas + p.personas,
    deHoy: r2(s.deHoy + p.deHoy),
  };
}

/**
 * «Provisionado hasta hoy con las boletas de Dynamic (12 personas)…»: la nota que acompaña al tramo de sueldos. Dice qué parte es de hoy y por
 * qué se mueve: Dynamic cuenta las horas de un día cuando la persona cierra su jornada, así que lo de hoy es un cálculo con lo que lleva cada una.
 */
export function notaProvisionado(personas: number, deHoy: number, previa: string | null): string {
  const quienes = `${personas} ${personas === 1 ? "persona" : "personas"}`;
  const hoy = deHoy > 0 ? `${solesER(deHoy)} son de hoy, calculados con las horas que lleva cada persona, y se corrigen cuando cierra su jornada` : "las horas de cada día entran cuando la persona cierra su jornada";
  const nota = `Provisionado hasta hoy con las boletas de Dynamic (${quienes}); ${hoy}. Cuando Dynamic pague el período, entra lo pagado de verdad.`;
  return previa ? `${previa} · ${nota}` : nota;
}

function conPersonal(detalle: readonly DetalleGastoER[], monto: number): DetalleGastoER[] {
  const hay = detalle.some((d) => d.cuenta === "62");
  const sumado = detalle.map((d) => (d.cuenta === "62" ? { ...d, monto: r2(d.monto + monto) } : d));
  return hay ? sumado : [...sumado, { cuenta: "62", nombre: "Gastos de personal", monto }].sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

/**
 * Suma la planilla estimada a las filas del Estado de resultados, como lo haría el diario si Dynamic ya hubiera pagado: más
 * planilla, más gastos de operación, menos resultado. `prov` ya viene acotado a lo que se mira (el mes, la sede): aquí solo se une
 * cada fila de provisión con la suya (una ubicación, o «De la empresa»); el consolidado, que es la suma exacta de todas, lleva la
 * suma de todas. Una fila sin estimación, o con una que no suma nada, queda tal cual (y la misma referencia).
 *
 * Nunca toca lo asentado: `planilla` ya traía lo pagado de los períodos que Dynamic pagó, y la provisión solo existe para los que no.
 * Un período está pagado o no lo está: nunca entran las dos (la base deja de devolverlo apenas Dynamic lo marca pagado).
 */
export function aplicarProvision(filas: readonly FilaER[], prov: readonly FilaProvision[]): FilaER[] {
  const util = prov.filter((p) => p.devengado > 0);
  if (!util.length) return [...filas];
  const porClave = new Map<string, Suma>();
  let total = vacia();
  for (const p of util) {
    porClave.set(claveDe(p), sumar(porClave.get(claveDe(p)) ?? vacia(), p));
    total = sumar(total, p);
  }
  return filas.map((f) => {
    const s = f.unidad === "consolidado" ? total : porClave.get(f.unidad === "empresa" ? "empresa" : (f.ubicacionId ?? ""));
    if (!s || s.devengado <= 0) return f;
    return {
      ...f,
      planilla: r2(f.planilla + s.devengado),
      gastos: r2(f.gastos + s.devengado),
      resultado: r2(f.resultado - s.devengado),
      detalleGastos: conPersonal(f.detalleGastos, s.devengado),
      planillaEstimada: s.devengado,
      planillaAlCierre: s.alCierre,
      planillaPersonas: s.personas,
      planillaNota: notaProvisionado(s.personas, s.deHoy, f.planillaNota),
    };
  });
}

/** Lo que el medidor de confianza necesita saber de la provisión de un mes: cuántas sedes, cuántas personas, cuánto y cuánto de eso es de hoy. */
export type ResumenProvision = { sedes: number; personas: number; devengado: number; alCierre: number; deHoy: number };

export function resumenDeProvision(prov: readonly FilaProvision[]): ResumenProvision | null {
  const util = prov.filter((p) => p.devengado > 0);
  if (!util.length) return null;
  const s = util.reduce(sumar, vacia());
  return { sedes: util.length, personas: s.personas, devengado: s.devengado, alCierre: s.alCierre, deHoy: s.deHoy };
}
