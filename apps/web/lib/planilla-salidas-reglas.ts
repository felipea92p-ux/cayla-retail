import { soles } from "./compras-reglas";
import { diaMes } from "./fechas-lima";
import type { Resultado } from "./gastos-reglas";
import type { CampoDeGuia } from "./guia-campos";
import { leerMontoPlata, MONTO_ILEGIBLE } from "./monto-plata-reglas";

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
  /** Lo que Dynamic decía que salía de este tramo cuando se registró su salida. */
  netoAlRegistrar: number | null;
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
    netoAlRegistrar: numONull(f.neto_al_registrar),
    cuentaId: texto(f.cuenta_id),
    cuentaNombre: texto(f.cuenta_nombre),
    fechaRegistrada: texto(f.fecha_registrada),
  };
}

/** De qué cuenta de CAYLA sale la planilla de quienes cobran en un banco (Configuración ▸ Cuentas y cobros). */
export type CuentaPlanilla = { banco: Exclude<BancoColaborador, "sin_banco">; cuentaId: string | null; cuentaNombre: string | null };
export const BANCOS_CON_CUENTA: readonly CuentaPlanilla["banco"][] = ["bcp", "interbank"];

export function leerCuentaPlanilla(f: Fila): CuentaPlanilla {
  return { banco: f.banco === "interbank" ? "interbank" : "bcp", cuentaId: texto(f.cuenta_id), cuentaNombre: texto(f.cuenta_nombre) };
}

/** La cuenta que se propone para un tramo: la guardada para su banco; quien no tiene banco en Dynamic no tiene ninguna. */
export function cuentaPropuesta(banco: BancoColaborador, cuentas: readonly CuentaPlanilla[]): CuentaPlanilla | null {
  const c = cuentas.find((x) => x.banco === banco);
  return c?.cuentaId ? c : null;
}

/** Registrada con otro monto que el neto NO es un problema (es lo que de verdad salió del banco); que Dynamic cambie después, sí. */
export type EstadoTramo = "por_registrar" | "registrado" | "cambio_en_dynamic";
const centimos = (n: number) => Math.round(n * 100);
export function estadoTramo(t: Pick<TramoPlanilla, "movimientoId" | "netoAlRegistrar" | "neto">): EstadoTramo {
  if (!t.movimientoId) return "por_registrar";
  return t.netoAlRegistrar !== null && centimos(t.netoAlRegistrar) !== centimos(t.neto) ? "cambio_en_dynamic" : "registrado";
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

export type LineaTramo = TramoPlanilla & { estado: EstadoTramo; texto: string; propuesta: CuentaPlanilla | null };
export type AvisoPlanilla = {
  clave: string;
  periodoId: string;
  grupo: string;
  pagadoEl: string;
  titulo: string;
  detalle: string;
  tramos: LineaTramo[];
  /** Los tramos que todavía no tienen su salida: los que la hoja registra. */
  porRegistrar: LineaTramo[];
  /** Lo que salió del banco según Dynamic, en todos los bancos del grupo. */
  total: number;
};

/** Lo que falta, con la cuenta de donde sale si ya se sabe: «falta registrar · sale de BCP Empresa». */
function falta(t: TramoPlanilla, propuesta: CuentaPlanilla | null): string {
  if (propuesta) return `falta registrar · sale de ${propuesta.cuentaNombre}`;
  if (t.banco === "sin_banco") return "falta registrar · eliges la cuenta al registrarla";
  return "falta registrar · elige su cuenta en Configuración";
}

function lineaDe(t: TramoPlanilla, cuentas: readonly CuentaPlanilla[]): LineaTramo {
  const estado = estadoTramo(t);
  const propuesta = cuentaPropuesta(t.banco, cuentas);
  const base = `${TEXTO_BANCO[t.banco]} · ${personas(t.personas)} · ${soles(t.neto)}`;
  const desde = `desde ${t.cuentaNombre ?? "su cuenta"} el ${diaMes(t.fechaRegistrada)}`;
  const otroMonto = t.registrado !== null && centimos(t.registrado) !== centimos(t.neto) ? ` por ${soles(t.registrado)}` : "";
  const cola =
    estado === "por_registrar"
      ? falta(t, propuesta)
      : estado === "registrado"
        ? `registrado ${desde}${otroMonto}`
        : `registrado ${desde} por ${soles(t.registrado ?? 0)}; Dynamic decía ${soles(t.netoAlRegistrar ?? 0)}`;
  return { ...t, estado, texto: `${base} — ${cola}`, propuesta };
}

/**
 * Un aviso por grupo pagado (período + grupo), con una línea por banco. El título dice lo que falta; si nada falta pero un monto no
 * cuadra, dice eso. El día en que Dynamic lo pagó va en el detalle, con lo que este monto es y lo que no es.
 */
export function avisosDePlanilla(tramos: readonly TramoPlanilla[], cuentas: readonly CuentaPlanilla[] = []): AvisoPlanilla[] {
  const grupos = new Map<string, TramoPlanilla[]>();
  for (const t of tramos) {
    const clave = `${t.periodoId}:${t.grupo}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), t]);
  }
  return [...grupos.entries()].map(([clave, del]) => {
    const lineas = [...del].sort((a, b) => ORDEN_BANCO[a.banco] - ORDEN_BANCO[b.banco]).map((t) => lineaDe(t, cuentas));
    const [primero] = lineas;
    const periodo = `del ${diaMes(primero.fechaIni)} al ${diaMes(primero.fechaFin)}`;
    const porRegistrar = lineas.filter((l) => l.estado === "por_registrar");
    const faltan = porRegistrar.length > 0;
    const cambio = lineas.some((l) => l.estado === "cambio_en_dynamic");
    const que = queSePago(primero.grupo);
    return {
      clave,
      periodoId: primero.periodoId,
      grupo: primero.grupo,
      pagadoEl: primero.pagadoEl,
      titulo: faltan ? `Falta registrar de qué banco salió ${que} ${periodo}` : `Dynamic cambió ${que} ${periodo} después de registrar su salida`,
      detalle:
        `Pagado en Dynamic el ${diaMes(primero.pagadoEl)}. Es lo que recibe cada persona en su banco; la AFP, el EsSalud y la renta de 4ª se pagan aparte.` +
        (cambio ? " Si del banco salió otra cosa, anula esa salida en «Movimientos entre cuentas» y vuelve a registrarla." : ""),
      tramos: lineas,
      porRegistrar,
      total: Math.round(lineas.reduce((a, l) => a + l.neto, 0) * 100) / 100,
    };
  });
}

// ---- La hoja «Registrar la salida» (actividad 3) ------------------------------------------------------------------------

/** Un «Pago de la planilla» registrado a mano que no está enlazado a ningún tramo: se puede enlazar en vez de crear otro. */
export type SalidaSuelta = { movimientoId: string; fecha: string; monto: number; cuentaId: string; cuentaNombre: string; referencia: string | null };
export function leerSalidaSuelta(f: Fila): SalidaSuelta {
  return {
    movimientoId: String(f.movimiento_id),
    fecha: String(f.fecha),
    monto: Number(f.monto ?? 0),
    cuentaId: String(f.cuenta_id),
    cuentaNombre: String(f.cuenta_nombre),
    referencia: texto(f.referencia),
  };
}
export const textoSuelta = (x: SalidaSuelta) => `${diaMes(x.fecha)} · ${soles(x.monto)} · ${x.cuentaNombre}${x.referencia ? ` · ${x.referencia}` : ""}`;

/** Una fila de la hoja: registrar la salida de un banco («nueva») o decir cuál de las ya registradas a mano es («ya»). */
export type FilaSalida = {
  banco: BancoColaborador;
  personas: number;
  neto: number;
  modo: "nueva" | "ya";
  cuentaId: string;
  monto: string;
  fecha: string;
  movimientoId: string;
};

/** Las filas arrancan con lo que la pantalla ya sabe: la cuenta de su banco, el neto de Dynamic y el día que Dynamic lo pagó. */
export function filasDeSalidas(aviso: Pick<AvisoPlanilla, "porRegistrar" | "pagadoEl">): FilaSalida[] {
  return aviso.porRegistrar.map((t) => ({
    banco: t.banco,
    personas: t.personas,
    neto: t.neto,
    modo: "nueva",
    cuentaId: t.propuesta?.cuentaId ?? "",
    monto: t.neto.toFixed(2),
    fecha: aviso.pagadoEl,
    movimientoId: "",
  }));
}

type Problemas = { cuenta?: string; monto?: string; fecha?: string; ya?: string };
/** Lo que impide guardar una fila, campo por campo: la misma regla dice el error y enciende la guía. */
function problemasDe(f: FilaSalida, filas: readonly FilaSalida[], hoy: string): Problemas {
  const quien = TEXTO_BANCO[f.banco];
  if (f.modo === "ya") {
    if (!f.movimientoId) return { ya: `Elige cuál de las salidas ya registradas es la de ${quien}.` };
    if (filas.some((o) => o !== f && o.modo === "ya" && o.movimientoId === f.movimientoId)) return { ya: "La misma salida no puede ser de dos bancos." };
    return {};
  }
  const p: Problemas = {};
  if (!f.cuentaId) p.cuenta = `Elige de qué cuenta salió lo de ${quien}.`;
  const monto = leerMontoPlata(f.monto);
  if (monto === null) p.monto = MONTO_ILEGIBLE;
  else if (monto <= 0) p.monto = `El monto de ${quien} tiene que ser mayor que cero.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) p.fecha = `Elige el día en que salió lo de ${quien}.`;
  else if (f.fecha > hoy) p.fecha = `La fecha de ${quien} no puede ser después de hoy.`;
  return p;
}

export const idCampoSalida = (banco: BancoColaborador, campo: keyof Problemas) => `sal-${banco}-${campo}`;

export type PayloadSalidas = {
  p_periodo_id: string;
  p_grupo: string;
  p_salidas: ({ banco: BancoColaborador; cuenta_id: string; monto: number; fecha: string } | { banco: BancoColaborador; movimiento_id: string })[];
};
export function validarSalidas(aviso: Pick<AvisoPlanilla, "periodoId" | "grupo">, filas: readonly FilaSalida[], hoy: string): Resultado<PayloadSalidas> {
  if (filas.length === 0) return { ok: false, error: "No queda nada por registrar en este grupo." };
  for (const f of filas) {
    const p = problemasDe(f, filas, hoy);
    const error = p.ya ?? p.cuenta ?? p.monto ?? p.fecha;
    if (error) return { ok: false, error };
  }
  return {
    ok: true,
    valor: {
      p_periodo_id: aviso.periodoId,
      p_grupo: aviso.grupo,
      p_salidas: filas.map((f) =>
        f.modo === "ya" ? { banco: f.banco, movimiento_id: f.movimientoId } : { banco: f.banco, cuenta_id: f.cuentaId, monto: leerMontoPlata(f.monto) ?? 0, fecha: f.fecha },
      ),
    },
  };
}

/** Los campos de la guía de foco, uno por control de cada fila, con «hecho» sacado de la MISMA regla que valida. */
export function camposDeSalidas(filas: readonly FilaSalida[], hoy: string): CampoDeGuia[] {
  return filas.flatMap((f) => {
    const p = problemasDe(f, filas, hoy);
    const quien = TEXTO_BANCO[f.banco];
    if (f.modo === "ya") return [{ id: idCampoSalida(f.banco, "ya"), nombre: `Salida de ${quien}`, requerido: true, hecho: !p.ya, pendiente: p.ya ?? "" }];
    return [
      { id: idCampoSalida(f.banco, "cuenta"), nombre: `Cuenta de ${quien}`, requerido: true, hecho: !p.cuenta, pendiente: p.cuenta ?? "" },
      { id: idCampoSalida(f.banco, "monto"), nombre: `Monto de ${quien}`, requerido: true, hecho: !p.monto, pendiente: p.monto ?? "" },
      { id: idCampoSalida(f.banco, "fecha"), nombre: `Fecha de ${quien}`, requerido: true, hecho: !p.fecha, pendiente: p.fecha ?? "" },
    ];
  });
}

export const textoRegistrar = (n: number) => (n === 1 ? "Registrar la salida" : `Registrar las ${n} salidas`);

/** Si la fecha es anterior al saldo inicial de la cuenta, la salida queda registrada pero no le cambia el saldo: ya estaba adentro. */
export function notaAntesDelSaldo(fecha: string, cuenta: { nombre: string; saldoDesde: string | null } | null | undefined): string | null {
  if (!cuenta?.saldoDesde || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha >= cuenta.saldoDesde) return null;
  return `${cuenta.nombre} tiene su saldo inicial desde el ${diaMes(cuenta.saldoDesde)}: esta salida queda registrada, pero no le baja el saldo porque ya estaba en ese saldo inicial.`;
}
