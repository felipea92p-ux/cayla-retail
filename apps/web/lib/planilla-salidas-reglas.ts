import { soles } from "./compras-reglas";
import { diaMes } from "./fechas-lima";

// Finanzas ▸ Cuentas y dinero: la planilla que Dynamic marcó pagada y su salida del banco (ADR-0567). Lógica pura, sin servidor ni
// navegador. La base parte cada grupo pagado por el banco donde cobran sus personas (`fn_planilla_salidas_por_registrar`, que solo
// trae los grupos con algo por registrar o con otro monto); aquí se agrupan y se dicen con palabras de tienda.

export type BancoColaborador = "bcp" | "interbank" | "sin_banco";
export const TEXTO_BANCO: Record<BancoColaborador, string> = {
  bcp: "BCP",
  interbank: "Interbank",
  sin_banco: "Sin banco en Dynamic",
};
const ORDEN_BANCO: Record<BancoColaborador, number> = { bcp: 0, interbank: 1, sin_banco: 2 };

/** Un tramo: lo que se pagó a las personas de un grupo que cobran en un mismo banco. */
export type TramoPlanilla = {
  periodoId: string;
  fechaIni: string;
  fechaFin: string;
  grupo: string;
  pagadoEl: string;
  banco: BancoColaborador;
  personas: number;
  /** Lo que recibe cada persona que cobra algo, sumado: lo que sale del banco. */
  neto: number;
  movimientoId: string | null;
  registrado: number | null;
  cuentaId: string | null;
  cuentaNombre: string | null;
  fechaRegistrada: string | null;
};

type Fila = Record<string, unknown>;
const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const banco = (v: unknown): BancoColaborador => (v === "bcp" || v === "interbank" ? v : "sin_banco");

export function leerTramo(f: Fila): TramoPlanilla {
  return {
    periodoId: String(f.periodo_id),
    fechaIni: String(f.fecha_ini),
    fechaFin: String(f.fecha_fin),
    grupo: String(f.grupo),
    pagadoEl: String(f.pagado_el),
    banco: banco(f.banco),
    personas: Number(f.personas ?? 0),
    neto: Number(f.neto ?? 0),
    movimientoId: texto(f.movimiento_id),
    registrado: numONull(f.registrado),
    cuentaId: texto(f.cuenta_id),
    cuentaNombre: texto(f.cuenta_nombre),
    fechaRegistrada: texto(f.fecha_registrada),
  };
}

export type EstadoTramo = "por_registrar" | "registrado" | "otro_monto";
export function estadoTramo(t: Pick<TramoPlanilla, "movimientoId" | "registrado" | "neto">): EstadoTramo {
  if (!t.movimientoId || t.registrado === null) return "por_registrar";
  return Math.round(t.registrado * 100) === Math.round(t.neto * 100) ? "registrado" : "otro_monto";
}

/** Qué se pagó, como sustantivo: «la planilla», «el pago a los practicantes». Un grupo nuevo de Dynamic se nombra tal cual. */
export function queSePago(grupo: string): string {
  switch (grupo) {
    case "planilla":
      return "la planilla";
    case "rxh":
      return "el pago de los recibos por honorarios";
    case "practicante":
      return "el pago a los practicantes";
    case "prueba":
      return "el pago del período de prueba";
    case "no_trabajador":
      return "el pago a quienes no están en planilla";
    default:
      return `el pago del grupo «${grupo}»`;
  }
}

const personas = (n: number) => (n === 1 ? "1 persona" : `${n} personas`);
/** «de la planilla», «del pago a los practicantes». */
const de = (que: string) => (que.startsWith("el ") ? `del ${que.slice(3)}` : `de ${que}`);

export type LineaTramo = TramoPlanilla & { estado: EstadoTramo; texto: string };
export type AvisoPlanilla = {
  clave: string;
  periodoId: string;
  grupo: string;
  pagadoEl: string;
  titulo: string;
  detalle: string;
  tramos: LineaTramo[];
  /** Lo que salió del banco según Dynamic, en todos los bancos del grupo. */
  total: number;
};

function lineaDe(t: TramoPlanilla): LineaTramo {
  const estado = estadoTramo(t);
  const base = `${TEXTO_BANCO[t.banco]} · ${personas(t.personas)} · ${soles(t.neto)}`;
  const cola =
    estado === "por_registrar"
      ? "falta registrar"
      : estado === "registrado"
        ? `registrado desde ${t.cuentaNombre ?? "su cuenta"} el ${diaMes(t.fechaRegistrada)}`
        : `registraste ${soles(t.registrado ?? 0)} desde ${t.cuentaNombre ?? "su cuenta"}: no cuadra`;
  return { ...t, estado, texto: `${base} — ${cola}` };
}

/**
 * Un aviso por grupo pagado (período + grupo), con una línea por banco. El título dice lo que falta; si nada falta pero un monto no
 * cuadra, dice eso. El día en que Dynamic lo pagó va en el detalle, con lo que este monto es y lo que no es.
 */
export function avisosDePlanilla(tramos: readonly TramoPlanilla[]): AvisoPlanilla[] {
  const grupos = new Map<string, TramoPlanilla[]>();
  for (const t of tramos) {
    const clave = `${t.periodoId}:${t.grupo}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), t]);
  }
  return [...grupos.entries()].map(([clave, del]) => {
    const lineas = [...del].sort((a, b) => ORDEN_BANCO[a.banco] - ORDEN_BANCO[b.banco]).map(lineaDe);
    const [primero] = lineas;
    const periodo = `del ${diaMes(primero.fechaIni)} al ${diaMes(primero.fechaFin)}`;
    const faltan = lineas.some((l) => l.estado === "por_registrar");
    const que = queSePago(primero.grupo);
    return {
      clave,
      periodoId: primero.periodoId,
      grupo: primero.grupo,
      pagadoEl: primero.pagadoEl,
      titulo: faltan ? `Falta registrar de qué banco salió ${que} ${periodo}` : `Lo que registraste ${de(que)} ${periodo} no cuadra con Dynamic`,
      detalle: `Pagado en Dynamic el ${diaMes(primero.pagadoEl)}. Es lo que recibe cada persona en su banco; la AFP, el EsSalud y la renta de 4ª se pagan aparte.`,
      tramos: lineas,
      total: Math.round(lineas.reduce((a, l) => a + l.neto, 0) * 100) / 100,
    };
  });
}
