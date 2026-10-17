// Reglas de Finanzas ▸ Gastos (ADR-0195 F2). Lógica pura: la usan la pantalla y sus pruebas.
// Las mismas reglas las cierra la base (`registrar_gasto`, checks y disparadores de 20260924235100); aquí se dicen con una
// frase clara ANTES de ir a la base, y se arma lo que la RPC espera.

import { claveTexto, type MotivoParecido } from "./nombres-parecidos";
import { proveedoresParecidos } from "./proveedores-reglas";
import { soles } from "./compras-reglas";
import { UMBRAL_BANCARIZACION } from "./no-deducible-reglas";
import { MAX_MONTO_FINANZAS } from "./finanzas-topes";
import { leerMontoPlata, MONTO_ILEGIBLE } from "./monto-plata-reglas";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

// ---- Vocabulario ------------------------------------------------------------------------------------------------------

export type TipoComprobante = "factura" | "boleta" | "recibo_por_honorarios" | "sin_comprobante";
export const TIPOS_COMPROBANTE: readonly TipoComprobante[] = ["factura", "boleta", "recibo_por_honorarios", "sin_comprobante"];
export const TEXTO_COMPROBANTE: Record<TipoComprobante, string> = {
  factura: "Factura",
  boleta: "Boleta",
  recibo_por_honorarios: "Recibo por honorarios",
  sin_comprobante: "Sin comprobante",
};

/**
 * El papel de un gasto en la lista (`comprobante_tipo` de `fn_gastos_lista`): el tipo de su comprobante de proveedor (`compras.tipo`) o,
 * en un gasto del viaje (ADR-0362, fase 6), el papel de su ficha (`gastos_viaje.papel`), que la base manda sin traducir. Son los valores
 * que aceptan esos dos candados: si la base gana otro, `pruebas:gastos-lista-viaje` falla y dice cuál falta aquí.
 */
export type PapelDeGasto = TipoComprobante | "nota_venta" | "ticket" | "planilla_movilidad";
/** Con las palabras de la hoja «Gasto del viaje» (`TEXTO_PAPEL`): quien registró el gasto reconoce lo que eligió. */
export const TEXTO_PAPEL_DE_GASTO: Record<PapelDeGasto, string> = {
  ...TEXTO_COMPROBANTE,
  nota_venta: "Nota de venta",
  ticket: "Ticket o boleto",
  planilla_movilidad: "Sin comprobante",
};

/** Cómo se pagó. `deposito` solo existe con comprobante (así lo acepta `compra_pagos`). */
export type MedioGasto = "efectivo" | "yape" | "plin" | "transferencia" | "deposito" | "tarjeta";
export const TEXTO_MEDIO: Record<MedioGasto, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
  deposito: "Depósito",
  tarjeta: "Tarjeta de crédito",
};
export function mediosPara(comprobante: TipoComprobante): MedioGasto[] {
  return comprobante === "sin_comprobante"
    ? ["efectivo", "yape", "plin", "transferencia", "tarjeta"]
    : ["transferencia", "efectivo", "yape", "plin", "deposito", "tarjeta"];
}

/** Lo que fue una salida de plata del cajón que no es gasto. */
export type TipoNoGasto = "deposito" | "retiro" | "ajuste" | "otro";
export const TEXTO_NO_GASTO: Record<TipoNoGasto, { titulo: string; detalle: string }> = {
  deposito: { titulo: "Un depósito al banco", detalle: "La plata no se fue: pasó del cajón a una cuenta." },
  retiro: { titulo: "Un retiro del dueño", detalle: "Sale del negocio, pero no es un gasto." },
  ajuste: { titulo: "Un ajuste de caja", detalle: "Corrige un conteo del cajón." },
  otro: { titulo: "Otra cosa que no es gasto", detalle: "Di qué fue, en pocas palabras." },
};

/** Lo que se le propone a quien clasifica, según el motivo que eligió la tienda al sacar la plata. */
export function sugerenciaParaEgreso(motivo: string): "gasto" | TipoNoGasto {
  if (motivo === "Depósito bancario") return "deposito";
  if (motivo === "Retiro de efectivo") return "retiro";
  if (motivo.startsWith("Ajuste de caja")) return "ajuste";
  return "gasto";
}

// ---- Montos y fechas --------------------------------------------------------------------------------------------------

const redondear = (n: number) => Math.round(n * 100) / 100;

/** "1,500", "1500.50", "648,50", "S/ 300" → número, con la regla única de `leerMontoPlata` (la coma de los céntimos se entiende). */
export function parsearMonto(texto: string): Resultado<number> {
  if (texto.trim() === "") return { ok: false, error: "Escribe el monto." };
  const n = leerMontoPlata(texto);
  if (n === null) return { ok: false, error: MONTO_ILEGIBLE };
  if (n <= 0) return { ok: false, error: "El monto tiene que ser mayor que cero." };
  return { ok: true, valor: n };
}

/** Un gasto o un movimiento de dinero llega hasta S/ 1 000 000 (ADR-0412): la base lo rechaza con `<tabla>_monto_con_tope`. */
export function montoDentroDelTope(m: Resultado<number>): Resultado<number> {
  if (m.ok && m.valor > MAX_MONTO_FINANZAS) return { ok: false, error: "El monto pasa de S/\u00a01 000 000: revisa que no sobre un cero." };
  return m;
}

/** El IGV que trae una factura por su total (18 % hoy): total − total ÷ 1.18. La base hace la misma cuenta. */
export function igvDeFactura(total: number, tasa = 0.18): number {
  return redondear(total - total / (1 + tasa));
}

/** "2026-09" del día de hoy en Lima. */
export function mesDe(hoy: string): string {
  return hoy.slice(0, 7);
}

/** El primer y el último día de un mes "YYYY-MM". */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function textoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return `${MESES[m - 1]} ${a}`;
}

/** Los últimos `n` meses hasta el de hoy, del más nuevo al más viejo. */
export function mesesRecientes(hoy: string, n = 12): string[] {
  const [a, m] = mesDe(hoy).split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function esMes(x: string | undefined): x is string {
  return !!x && /^\d{4}-(0[1-9]|1[0-2])$/.test(x);
}

// ---- «Ver»: qué se mira (la cabecera dice dónde se trabaja) ------------------------------------------------------------

export type UbicacionGastos = { id: string; nombre: string };
export type Ver = { clave: string; ubicacionId: string | null; soloEmpresa: boolean };

/**
 * `?ver=` → qué mira la pantalla. El líder: una ubicación, «todas» o «empresa» (por defecto, la sede donde trabaja). Quien
 * tiene el módulo sin ser líder ve solo su tienda: el parámetro se ignora.
 */
export function leerVer(param: string | undefined, ubicaciones: readonly UbicacionGastos[], esLider: boolean, sedeActual: string | null): Ver {
  if (!esLider) {
    const propia = ubicaciones[0]?.id ?? null;
    return { clave: propia ?? "todas", ubicacionId: propia, soloEmpresa: false };
  }
  if (param === "todas") return { clave: "todas", ubicacionId: null, soloEmpresa: false };
  if (param === "empresa") return { clave: "empresa", ubicacionId: null, soloEmpresa: true };
  const elegida = ubicaciones.find((u) => u.id === (param ?? sedeActual));
  if (elegida) return { clave: elegida.id, ubicacionId: elegida.id, soloEmpresa: false };
  return { clave: "todas", ubicacionId: null, soloEmpresa: false };
}

// ---- Lo que devuelve la base → tipos de la pantalla ---------------------------------------------------------------------

export type CategoriaGasto = { codigo: string; nombre: string; ejemplos: string; cuenta: string; cuentaNombre: string };

export type PanelGastos = {
  total: number;
  /** El IGV de las facturas de los gastos del mes (sin restar lo perdido). */
  igv: number;
  /**
   * El IGV perdido por los pagos sin banco DEL MES (ADR-0362, fase 6, decisión 76: en el mes del pago, como Impuestos), de los gastos que
   * se ven aunque sean de otro mes; `deOtrosMeses`, cuánto de eso es de gastos de otro mes. Sin la clave en la base (la migración
   * 20261014174000 sin pegar), ceros: la tarjeta dice lo de antes.
   */
  igvPerdido: { n: number; igv: number; deOtrosMeses: number };
  /** «IGV que puedes descontar»: el IGV de las facturas del mes menos lo perdido en el mes. */
  igvDescontable: number;
  n: number;
  boletas: number;
  sinComprobante: number;
  porPagar: number;
  nPorPagar: number;
  egresosSinClasificar: number;
  egresosSinClasificarMonto: number;
  porCategoria: { categoria: string; nombre: string; cuenta: string; monto: number; n: number }[];
  porUbicacion: { ubicacionId: string | null; nombre: string; monto: number; n: number }[];
};

export type GastoFila = {
  id: string;
  ubicacionId: string | null;
  ubicacionNombre: string | null;
  categoria: string;
  categoriaNombre: string;
  cuenta: string;
  descripcion: string;
  fecha: string;
  montoTotal: number;
  igv: number;
  medioPago: MedioGasto | null;
  cajaMovimientoId: string | null;
  compraId: string | null;
  comprobanteTipo: PapelDeGasto;
  comprobante: string | null;
  proveedorNombre: string | null;
  condicion: "contado" | "credito" | null;
  fechaVencimiento: string | null;
  saldo: number | null;
  tienePagos: boolean;
  estado: "vigente" | "anulado";
  motivoAnulacion: string | null;
  registradoPor: string | null;
  /** Cuándo se registró (la hora del gasto que no salió de un cajón, como el pagado con Yape desde Caja). */
  creadoEn: string | null;
  /** El IGV que se perdió por pagar sin banco (ADR-0362, fase 6, decisión 76): la suma de `pagosSinBanco`, nunca más que `igv`. */
  igvPerdido: number;
  /** Los pagos en efectivo o desde un fondo que se llevaron su parte del IGV (`fn_gastos_igv_perdido`), del más viejo al más nuevo. */
  pagosSinBanco: PagoSinBanco[];
};

/** Un pago en efectivo o desde un fondo de una factura de S/ 2 000 o más: la base dice cuánto IGV se llevó (`fn_igv_perdido`). */
export type PagoSinBanco = { pagoId: string; fecha: string; igv: number; monto: number; como: "efectivo" | "fondo" };

export type EgresoPorClasificar = {
  id: string;
  cajaId: string;
  ubicacionId: string;
  ubicacionNombre: string;
  monto: number;
  motivo: string;
  nota: string | null;
  registradoPor: string | null;
  creadoEn: string;
  cajaAbierta: boolean;
};

export type MarcaNoGasto = {
  id: string;
  cajaMovimientoId: string;
  ubicacionNombre: string;
  monto: number;
  motivoEgreso: string;
  notaEgreso: string | null;
  tipo: TipoNoGasto;
  motivo: string | null;
  revisadoPor: string | null;
  revisadoEn: string;
};

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numONull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function leerPanel(data: unknown): PanelGastos {
  const d = (data ?? {}) as Fila;
  const perdido = (d.igv_perdido ?? {}) as Fila;
  const igvPerdido = { n: num(perdido.n), igv: num(perdido.igv), deOtrosMeses: num(perdido.de_otros_meses) };
  return {
    total: num(d.total),
    igv: num(d.igv),
    igvPerdido,
    igvDescontable: redondear(num(d.igv) - igvPerdido.igv),
    n: num(d.n),
    boletas: num(d.boletas),
    sinComprobante: num(d.sin_comprobante),
    porPagar: num(d.por_pagar),
    nPorPagar: num(d.n_por_pagar),
    egresosSinClasificar: num(d.egresos_sin_clasificar),
    egresosSinClasificarMonto: num(d.egresos_sin_clasificar_monto),
    porCategoria: ((d.por_categoria ?? []) as Fila[]).map((c) => ({ categoria: String(c.categoria), nombre: String(c.nombre), cuenta: String(c.cuenta), monto: num(c.monto), n: num(c.n) })),
    porUbicacion: ((d.por_ubicacion ?? []) as Fila[]).map((u) => ({ ubicacionId: txt(u.ubicacion_id), nombre: String(u.nombre), monto: num(u.monto), n: num(u.n) })),
  };
}

export function leerGasto(g: Fila): GastoFila {
  return {
    id: String(g.id),
    ubicacionId: txt(g.ubicacion_id),
    ubicacionNombre: txt(g.ubicacion_nombre),
    categoria: String(g.categoria),
    categoriaNombre: String(g.categoria_nombre),
    cuenta: String(g.cuenta),
    descripcion: String(g.descripcion),
    fecha: String(g.fecha),
    montoTotal: num(g.monto_total),
    igv: num(g.igv),
    medioPago: (txt(g.medio_pago) as MedioGasto | null) ?? null,
    cajaMovimientoId: txt(g.caja_movimiento_id),
    compraId: txt(g.compra_id),
    comprobanteTipo: ((txt(g.comprobante_tipo) as PapelDeGasto | null) ?? "sin_comprobante"),
    comprobante: txt(g.comprobante),
    proveedorNombre: txt(g.proveedor_nombre),
    condicion: (txt(g.condicion) as "contado" | "credito" | null) ?? null,
    fechaVencimiento: txt(g.fecha_vencimiento),
    saldo: numONull(g.saldo),
    tienePagos: !!g.tiene_pagos,
    estado: g.estado === "anulado" ? "anulado" : "vigente",
    motivoAnulacion: txt(g.motivo_anulacion),
    registradoPor: txt(g.registrado_por_nombre),
    creadoEn: txt(g.creado_en),
    // Los pone `conIgvPerdido` con lo que responde `fn_gastos_igv_perdido`.
    igvPerdido: 0,
    pagosSinBanco: [],
  };
}

export function leerEgreso(e: Fila): EgresoPorClasificar {
  return {
    id: String(e.id),
    cajaId: String(e.caja_id),
    ubicacionId: String(e.ubicacion_id),
    ubicacionNombre: String(e.ubicacion_nombre),
    monto: num(e.monto),
    motivo: String(e.motivo),
    nota: txt(e.nota),
    registradoPor: txt(e.registrado_por_nombre),
    creadoEn: String(e.creado_en),
    cajaAbierta: !!e.caja_abierta,
  };
}

export function leerMarca(m: Fila): MarcaNoGasto {
  return {
    id: String(m.id),
    cajaMovimientoId: String(m.caja_movimiento_id),
    ubicacionNombre: String(m.ubicacion_nombre),
    monto: num(m.monto),
    motivoEgreso: String(m.motivo_egreso),
    notaEgreso: txt(m.nota_egreso),
    tipo: String(m.tipo) as TipoNoGasto,
    motivo: txt(m.motivo),
    revisadoPor: txt(m.revisado_por_nombre),
    revisadoEn: String(m.revisado_en),
  };
}

// ---- Estado de un gasto -----------------------------------------------------------------------------------------------

export type EstadoGasto = "pagado" | "por_pagar" | "parcial" | "anulado";
export const TEXTO_ESTADO_GASTO: Record<EstadoGasto, { texto: string; tono: "verde" | "ambar" | "apagado" }> = {
  pagado: { texto: "Pagado", tono: "verde" },
  por_pagar: { texto: "Por pagar", tono: "ambar" },
  parcial: { texto: "Pago parcial", tono: "ambar" },
  anulado: { texto: "Anulado", tono: "apagado" },
};

export function estadoGasto(g: Pick<GastoFila, "estado" | "compraId" | "saldo" | "montoTotal">): EstadoGasto {
  if (g.estado === "anulado") return "anulado";
  if (!g.compraId || !g.saldo || g.saldo <= 0) return "pagado";
  return g.saldo < g.montoTotal ? "parcial" : "por_pagar";
}

/** Un gasto con factura ya pagada no se anula (como en Compras): la base lo rechaza igual. */
export function puedeAnular(g: Pick<GastoFila, "estado" | "compraId" | "tienePagos">): boolean {
  return g.estado === "vigente" && !(g.compraId && g.tienePagos);
}

/** Cómo se pagó, en una línea (spike, tabla de Gastos): «vence 28 sep» si se debe, «Cajón · Tienda TRU» si salió de un
 *  cajón, el medio si no («Transferencia», «Yape»). */
export function textoPago(
  g: Pick<GastoFila, "medioPago" | "cajaMovimientoId" | "compraId" | "condicion" | "fechaVencimiento" | "tienePagos" | "saldo" | "estado" | "ubicacionNombre">,
  fecha: (iso: string) => string,
): string {
  if (g.compraId && g.condicion === "credito" && g.estado === "vigente" && (g.saldo ?? 0) > 0) return g.fechaVencimiento ? `vence ${fecha(g.fechaVencimiento)}` : "a crédito";
  if (g.cajaMovimientoId) return `Cajón · ${g.ubicacionNombre ?? "tienda"}`;
  if (g.medioPago) return TEXTO_MEDIO[g.medioPago];
  return g.tienePagos ? "Pagado" : "—";
}

/** ¿El gasto trae comprobante? La planilla de movilidad no: es el «sin comprobante» de un gasto del viaje (decisión 55 del ADR-0362).
 *  Un ticket o boleto sí: es un comprobante de pago, aunque hoy no dé crédito fiscal. */
export function tieneComprobante(papel: PapelDeGasto): boolean {
  return papel !== "sin_comprobante" && papel !== "planilla_movilidad";
}

/**
 * El papel de un gasto como lo dice la tabla: el tipo y, debajo, su serie y número. Debajo de una planilla de movilidad va su nombre, para
 * que nadie salga a buscar una boleta que no existe. Un valor que la pantalla no conoce se dice «Comprobante», nunca «Sin comprobante».
 */
export function papelDelGasto(g: Pick<GastoFila, "comprobanteTipo" | "comprobante">): { tipo: string; detalle: string | null } {
  if (g.comprobanteTipo === "planilla_movilidad") return { tipo: TEXTO_PAPEL_DE_GASTO.planilla_movilidad, detalle: "Planilla de movilidad" };
  const tipo = (TEXTO_PAPEL_DE_GASTO as Partial<Record<string, string>>)[g.comprobanteTipo] ?? "Comprobante";
  return { tipo, detalle: g.comprobante };
}

/** El papel en una línea (la bajada del detalle): «Factura F001-4321», «Ticket o boleto», «Sin comprobante (planilla de movilidad)». */
export function papelEnUnaLinea(g: Pick<GastoFila, "comprobanteTipo" | "comprobante">): string {
  if (g.comprobanteTipo === "planilla_movilidad") return `${TEXTO_PAPEL_DE_GASTO.planilla_movilidad} (planilla de movilidad)`;
  const { tipo, detalle } = papelDelGasto(g);
  return detalle ? `${tipo} ${detalle}` : tipo;
}

/** «S/ 5,472»: las cifras grandes de una pantalla van sin céntimos (spike); las filas, con ellos (`soles`). */
export function solesRedondo(n: number): string {
  // `|| 0`: un negativo de céntimos redondea a -0 y se escribiría «S/ -0» (el IGV del mes menos lo perdido, partido en pagos que
  // redondean cada uno, puede quedar en -0.01).
  return `S/\u00a0${(Math.round(n) || 0).toLocaleString("es-PE")}`;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «23 sep» (con el año si se pide: «23 sep 2026»). */
export function fechaCorta(iso: string | null, conAnio = false): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1]}${conAnio ? ` ${a}` : ""}`;
}

// ---- El IGV perdido por pagar sin banco (ADR-0362, fase 6, decisión 76) -----------------------------------------------
//
// Una factura de S/ 2 000 o más pagada en efectivo o desde un fondo pierde el IGV de lo pagado así (bancarización). La base dice cuánto y
// cuándo (`fn_igv_perdido`, en el mes del PAGO); aquí solo se dice con palabras de tienda. Felipe eligió (2026-10-14): la fila dice
// «perdido» en ámbar, el detalle dice por qué y en qué mes lo resta Impuestos, y la tarjeta lo resta en el mes del pago. Con /formidable
// (el mismo día): la fila en dos renglones, la nota con la factura y el mes, lo que falta pagar dice que va por el banco, y la tarjeta
// nunca dice un negativo (lo explica en palabras).

/** Una fila de `fn_gastos_igv_perdido`: a qué gasto va y el pago que se llevó su parte del IGV. */
export function leerPagoSinBanco(f: Fila): { gastoId: string; pago: PagoSinBanco } {
  return {
    gastoId: String(f.gasto_id),
    pago: { pagoId: String(f.pago_id), fecha: String(f.fecha), igv: num(f.igv), monto: num(f.monto), como: f.como === "fondo" ? "fondo" : "efectivo" },
  };
}

/**
 * Une a cada gasto sus pagos sin banco. Lo perdido nunca pasa del IGV del gasto: cada pago redondea su parte y, pagada en varias partes,
 * la suma podría pasarse por un céntimo. Un gasto sin pagos sin banco queda igual.
 */
export function conIgvPerdido(gastos: readonly GastoFila[], filas: readonly Fila[]): GastoFila[] {
  const porGasto = new Map<string, PagoSinBanco[]>();
  for (const f of filas) {
    const { gastoId, pago } = leerPagoSinBanco(f);
    porGasto.set(gastoId, [...(porGasto.get(gastoId) ?? []), pago]);
  }
  return gastos.map((g) => {
    const pagos = [...(porGasto.get(g.id) ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!pagos.length) return g;
    return { ...g, igvPerdido: Math.min(g.igv, redondear(pagos.reduce((s, p) => s + p.igv, 0))), pagosSinBanco: pagos };
  });
}

/** El IGV de un gasto, partido: lo que todavía se descuenta y lo que se perdió por pagar sin banco. */
export function igvDelGasto(g: Pick<GastoFila, "igv" | "igvPerdido">): { descontable: number; perdido: number } {
  const perdido = Math.min(Math.max(g.igvPerdido, 0), Math.max(g.igv, 0));
  return { descontable: redondear(g.igv - perdido), perdido };
}

/**
 * Lo que dice la fila bajo el monto, en dos renglones: arriba el IGV de la factura, como siempre («IGV S/ 360.00»), y debajo, si se perdió
 * algo, cuánto («perdido S/ 180.00», la pantalla lo pinta en ámbar). En un solo renglón era ambiguo (¿«IGV S/ 180.00 · perdido S/ 180.00»
 * era todo el IGV?) y ensanchaba la columna de 120 a 211 px (/formidable, 2026-10-14). Sin IGV, nada.
 */
export function igvBajoElMonto(g: Pick<GastoFila, "igv" | "igvPerdido">): { igv: string; perdido: string | null } | null {
  if (g.igv <= 0) return null;
  const { perdido } = igvDelGasto(g);
  return { igv: `IGV ${soles(g.igv)}`, perdido: perdido > 0 ? `perdido ${soles(perdido)}` : null };
}

const COMO_SE_PAGO: Record<PagoSinBanco["como"], string> = { efectivo: "en efectivo", fondo: "desde un fondo" };

/** «a», «a y b», «a, b y c». */
function enLista(t: readonly string[]): string {
  return t.length <= 1 ? (t[0] ?? "") : `${t.slice(0, -1).join(", ")} y ${t[t.length - 1]}`;
}

/** «octubre», o «enero de 2027» si el año no es `anio`. */
function nombreDeMes(mes: string, anio: string): string {
  const nombre = MESES[Number(mes.slice(5, 7)) - 1];
  return mes.slice(0, 4) === anio ? nombre : `${nombre} de ${mes.slice(0, 4)}`;
}

/**
 * El dato «IGV perdido» del detalle: cuánto, de qué pago y cuándo. Un solo pago por el total: «S/ 360.00 · se pagó en efectivo el 14 oct»;
 * uno por una parte: «S/ 180.00 · del pago de S/ 1,180.00 en efectivo (12 oct)» (antes los dos montos iban seguidos y se confundían);
 * varios: «S/ 240.00 · de 2 pagos sin banco (3 oct y 14 oct)» («sin banco» si se mezclan efectivo y fondo). La fecha lleva el año solo si
 * no es el del gasto.
 */
export function textoIgvPerdido(g: Pick<GastoFila, "igv" | "igvPerdido" | "pagosSinBanco" | "montoTotal" | "fecha">): string | null {
  const { perdido } = igvDelGasto(g);
  const pagos = g.pagosSinBanco;
  if (perdido <= 0 || pagos.length === 0) return null;
  const anio = g.fecha.slice(0, 4);
  const dia = (iso: string) => fechaCorta(iso, iso.slice(0, 4) !== anio);
  const como = new Set(pagos.map((p) => p.como)).size === 1 ? COMO_SE_PAGO[pagos[0]!.como] : "sin banco";
  if (pagos.length === 1) {
    const p = pagos[0]!;
    if (p.monto >= g.montoTotal) return `${soles(perdido)} · se pagó ${como} el ${dia(p.fecha)}`;
    return `${soles(perdido)} · del pago de ${soles(p.monto)} ${como} (${dia(p.fecha)})`;
  }
  return `${soles(perdido)} · de ${pagos.length} pagos ${como} (${enLista([...new Set(pagos.map((p) => p.fecha))].map(dia))})`;
}

/**
 * La nota del detalle, con la factura y el mes: «Esta factura es de S/ 2,360: desde S/ 2,000 se paga por el banco, y SUNAT no deja
 * descontar el IGV de lo que se pagó en efectivo o desde un fondo[, aunque ese pago sea de menos de S/ 2,000]. Ese IGV ya está restado de lo
 * que descuentas en octubre.» (la frase de Impuestos). Va «aunque ese/cada pago sea de menos de S/ 2,000» cuando lo pagado sin banco no llega
 * a S/ 2 000: la primera prueba ciega pensó que la regla no le tocaba, y la segunda preguntó «¿menor que qué?» con «aunque ese pago sea menor».
 * `mes` es el del último pago (para el enlace a Impuestos, que la pantalla pone solo si se ve ese módulo).
 */
export function notaIgvPerdido(
  g: Pick<GastoFila, "igv" | "igvPerdido" | "pagosSinBanco" | "fecha" | "montoTotal">,
): { texto: string; mes: string } | null {
  const { perdido } = igvDelGasto(g);
  const pagos = g.pagosSinBanco;
  if (perdido <= 0 || pagos.length === 0) return null;
  const meses = [...new Set(pagos.map((p) => p.fecha.slice(0, 7)))].sort();
  const menores = pagos.every((p) => p.monto < UMBRAL_BANCARIZACION);
  const tope = `S/\u00a0${UMBRAL_BANCARIZACION.toLocaleString("es-PE")}`;
  const aunque = !menores ? "" : pagos.length === 1 ? `, aunque ese pago sea de menos de ${tope}` : `, aunque cada pago sea de menos de ${tope}`;
  const texto =
    `Esta factura es de ${solesRedondo(g.montoTotal)}: desde ${tope} se paga por el banco, y SUNAT ` +
    `no deja descontar el IGV de lo que se pagó en efectivo o desde un fondo${aunque}. Ese IGV ya está restado de lo que descuentas en ` +
    `${enLista(meses.map((m) => nombreDeMes(m, g.fecha.slice(0, 4))))}.`;
  return { texto, mes: meses[meses.length - 1]! };
}

/**
 * El IGV que todavía se puede perder: el de lo que falta pagar de una factura a crédito de S/ 2 000 o más (su total, como la regla). Si se
 * paga en efectivo o desde un fondo, se pierde; el detalle lo dice («Lo que falta … se paga por el banco»). Por pagar avisa también al
 * pagar. 0 si no hay saldo, no es de S/ 2 000 o más o no trae IGV.
 */
export function igvEnRiesgo(g: Pick<GastoFila, "compraId" | "estado" | "saldo" | "igv" | "montoTotal">): number {
  if (!g.compraId || g.estado !== "vigente" || !g.saldo || g.saldo <= 0 || g.igv <= 0 || g.montoTotal < UMBRAL_BANCARIZACION) return 0;
  return redondear((g.igv * Math.min(g.saldo, g.montoTotal)) / g.montoTotal);
}

/**
 * Lo que la tarjeta muestra: el IGV que puedes descontar, nunca menos de cero. Si lo perdido en el mes (de gastos de este mes o de otros)
 * pasa el IGV de las facturas del mes, la tarjeta dice S/ 0 y la bajada explica que Impuestos resta lo que falta: «puedes descontar
 * −S/ 180» no se entiende (Felipe pidió la opción «más entendible y lógica», 2026-10-14). La cuenta de Impuestos no cambia.
 */
export function igvParaLaTarjeta(p: Pick<PanelGastos, "igvDescontable">): number {
  return Math.max(0, p.igvDescontable);
}

/**
 * El IGV de los gastos de la lista que se pierde por un pago sin banco de OTRO mes (antes o después): la tarjeta de este mes lo sigue
 * contando, porque Impuestos lo resta en el mes del pago (decisión 72), aunque la fila ya diga «perdido». Con los meses de esos pagos.
 */
export function perdidoEnOtroMes(gastos: readonly Pick<GastoFila, "estado" | "igv" | "pagosSinBanco">[], mes: string): { igv: number; meses: string[] } {
  let igv = 0;
  const meses = new Set<string>();
  for (const g of gastos) {
    if (g.estado !== "vigente") continue;
    const fuera = g.pagosSinBanco.filter((p) => p.fecha.slice(0, 7) !== mes);
    if (!fuera.length) continue;
    igv += Math.min(Math.max(g.igv, 0), fuera.reduce((s, p) => s + p.igv, 0));
    for (const p of fuera) meses.add(p.fecha.slice(0, 7));
  }
  return { igv: redondear(igv), meses: [...meses].sort() };
}

/** Una cifra de la bajada de una tarjeta: redonda como la tarjeta, salvo que sea menos de un sol (nunca «S/ 0» de algo que sí hay). */
function cifraDeBajada(n: number): string {
  return Math.abs(n) < 1 ? soles(n) : solesRedondo(n);
}

/**
 * La bajada de la tarjeta «IGV que puedes descontar»: de dónde sale y, si en el mes se pagó sin banco una factura grande, cuánto IGV se
 * perdió (ya restado del número, como en Impuestos), y si es de gastos de otro mes. Si lo perdido pasa el IGV de las facturas del mes, la
 * tarjeta dice S/ 0 y aquí se dice que Impuestos resta lo que falta. Y si la tarjeta cuenta un IGV que se pierde en otro mes (`otroMes`, de
 * `perdidoEnOtroMes`), lo dice: la fila ya dice «perdido» y la tarjeta no lo resta este mes.
 */
export function bajadaIgvDelMes(
  p: Pick<PanelGastos, "boletas" | "igv" | "igvPerdido" | "igvDescontable"> & { mes?: string },
  otroMes?: { igv: number; meses: string[] },
): string {
  const { igv: perdido, deOtrosMeses } = p.igvPerdido;
  const otros =
    deOtrosMeses <= 0 ? "" : deOtrosMeses >= perdido ? " (de gastos de otros meses)" : ` (${cifraDeBajada(deOtrosMeses)} de gastos de otros meses)`;
  let frase = "Solo de facturas.";
  if (perdido > 0 && p.igvDescontable >= 0) frase = `Solo de facturas, menos ${cifraDeBajada(perdido)} que se pierde por pagar sin banco${otros}.`;
  else if (perdido > 0 && p.igv <= 0) frase = `Las facturas del mes no traen IGV, y se pierde ${cifraDeBajada(perdido)} por pagar sin banco${otros}: Impuestos lo resta este mes.`;
  else if (perdido > 0)
    frase =
      `Se pierde ${cifraDeBajada(perdido)} por pagar sin banco${otros}, más que los ${cifraDeBajada(p.igv)} de IGV de las facturas del mes: ` +
      `Impuestos resta los ${cifraDeBajada(-p.igvDescontable)} que faltan.`;
  let incluye = "";
  if (otroMes && otroMes.igv > 0 && otroMes.meses.length) {
    const anio = (p.mes ?? otroMes.meses[0]!).slice(0, 4);
    const varios = otroMes.meses.length > 1;
    incluye =
      ` Incluye ${cifraDeBajada(otroMes.igv)} que se pierde por ${varios ? "pagos" : "un pago"} sin banco de ` +
      `${enLista(otroMes.meses.map((m) => nombreDeMes(m, anio)))}: Impuestos lo resta en ${varios ? "esos meses" : "ese mes"}.`;
  }
  return `${frase}${incluye} ${p.boletas} ${p.boletas === 1 ? "boleta" : "boletas"} sin IGV descontable.`;
}

// ---- El formulario ----------------------------------------------------------------------------------------------------

/** «empresa» = de la empresa (sin tienda). */
export type BorradorGasto = {
  ubicacion: string;
  categoria: string;
  descripcion: string;
  fecha: string;
  monto: string;
  comprobante: TipoComprobante;
  proveedorId: string;
  serie: string;
  numero: string;
  condicion: "contado" | "credito";
  vence: string;
  medio: MedioGasto | "";
  /** Con efectivo: la caja abierta de la tienda de la que salió (se crea su egreso). */
  cajaId: string;
  /** Clasificar un egreso ya registrado (viene fijo desde «Egresos de caja por clasificar»). */
  egresoId: string;
  referencia: string;
  /** F2b: el gasto fijo del que sale este gasto, si viene de «Fijos del mes». */
  gastoFijoId?: string;
  /** F3b: la cuenta de «Salió de» (cajón, caja fuerte, lo que tiene el líder, un banco o la tarjeta). La base la sella. */
  cuentaId?: string;
};

export type PayloadGasto = {
  p_ubicacion_id: string | null;
  p_categoria: string;
  p_descripcion: string;
  p_fecha: string;
  p_monto_total: number;
  p_comprobante: null | {
    tipo: Exclude<TipoComprobante, "sin_comprobante">;
    proveedor_id: string;
    serie: string;
    numero: string;
    condicion: "contado" | "credito";
    fecha_vencimiento?: string;
  };
  p_medio_pago: MedioGasto | null;
  p_caja_id: string | null;
  p_caja_movimiento_id: string | null;
  p_referencia: string | null;
  /** F2b: el gasto fijo del que sale (uno por mes). */
  p_gasto_fijo_id?: string | null;
  /** F3b: de qué cuenta salió (se sella en el gasto o en el pago de su factura). */
  p_cuenta_id?: string | null;
};

/** "F001-00140", "F001 140", "S120-560233" → serie y número. */
export function partirSerieNumero(texto: string): { serie: string; numero: string } {
  const limpio = texto.trim().toUpperCase();
  const m = limpio.match(/^([A-Z0-9]{1,4})[\s-]+0*(\d+)$/);
  if (m) return { serie: m[1]!, numero: m[2]! };
  return { serie: "", numero: "" };
}

export function validarGasto(b: BorradorGasto, hoy: string): Resultado<PayloadGasto> {
  if (!b.ubicacion) return { ok: false, error: "Elige a qué tienda se le carga." };
  if (!b.categoria) return { ok: false, error: "Elige la categoría." };
  if (!b.descripcion.trim()) return { ok: false, error: "Escribe qué se pagó." };
  if (!b.fecha) return { ok: false, error: "Falta la fecha." };
  if (b.fecha > hoy) return { ok: false, error: "La fecha no puede ser futura." };
  const monto = montoDentroDelTope(parsearMonto(b.monto));
  if (!monto.ok) return monto;

  const conComprobante = b.comprobante !== "sin_comprobante";
  const aCredito = conComprobante && b.condicion === "credito";
  if (conComprobante) {
    if (!b.proveedorId) return { ok: false, error: "Elige el proveedor del comprobante." };
    if (!b.serie.trim() || !b.numero.trim()) return { ok: false, error: "Escribe la serie y el número del comprobante." };
    if (aCredito && (!b.vence || b.vence < b.fecha)) return { ok: false, error: "A crédito, di cuándo vence (no antes de la fecha)." };
  }
  if (!aCredito && !b.egresoId) {
    if (!b.medio) return { ok: false, error: "Di cómo se pagó." };
    if (!mediosPara(b.comprobante).includes(b.medio)) return { ok: false, error: `${TEXTO_MEDIO[b.medio]} no va con este comprobante.` };
    // F3b: en efectivo sale de la caja abierta (el cajón) o de la cuenta elegida (una caja fuerte, lo que tiene el líder).
    if (b.medio === "efectivo" && !b.cajaId && !b.cuentaId) return { ok: false, error: "En efectivo, sale de la caja abierta de la tienda. Si la caja está cerrada, registra el egreso en Caja primero." };
  }
  const medio: MedioGasto | null = aCredito ? null : b.egresoId ? "efectivo" : (b.medio as MedioGasto);
  return {
    ok: true,
    valor: {
      p_ubicacion_id: b.ubicacion === "empresa" ? null : b.ubicacion,
      p_categoria: b.categoria,
      p_descripcion: b.descripcion.trim(),
      p_fecha: b.fecha,
      p_monto_total: monto.valor,
      p_comprobante: conComprobante
        ? {
            tipo: b.comprobante as Exclude<TipoComprobante, "sin_comprobante">,
            proveedor_id: b.proveedorId,
            serie: b.serie.trim().toUpperCase(),
            numero: b.numero.trim(),
            condicion: aCredito ? "credito" : "contado",
            ...(aCredito ? { fecha_vencimiento: b.vence } : {}),
          }
        : null,
      p_medio_pago: medio,
      p_caja_id: medio === "efectivo" && !b.egresoId ? b.cajaId || null : null,
      p_caja_movimiento_id: b.egresoId || null,
      p_referencia: b.referencia.trim() || null,
      ...(b.gastoFijoId ? { p_gasto_fijo_id: b.gastoFijoId } : {}),
      ...(b.cuentaId && !aCredito && !b.egresoId ? { p_cuenta_id: b.cuentaId } : {}),
    },
  };
}

/** Un activo usa el mismo paso «comprobante + pago» que un gasto; cambia qué es y su vida útil. */
export type BorradorActivo = Omit<BorradorGasto, "categoria" | "descripcion" | "gastoFijoId"> & { tipo: string; nombre: string; serie: string; vidaUtilMeses: string };

export function validarActivo(b: BorradorActivo, hoy: string) {
  if (!b.ubicacion || b.ubicacion === "empresa") return { ok: false as const, error: "Un activo está en una tienda, el Taller o el almacén: elige dónde." };
  if (!b.tipo) return { ok: false as const, error: "Elige qué tipo de activo es." };
  if (!b.nombre.trim()) return { ok: false as const, error: "Escribe qué es." };
  if (b.comprobante === "recibo_por_honorarios") return { ok: false as const, error: "Un activo no llega con recibo por honorarios: es factura o boleta." };
  const vida = Number(b.vidaUtilMeses);
  if (!Number.isInteger(vida) || vida < 12 || vida > 600) return { ok: false as const, error: "La vida útil va de 1 a 50 años." };
  const base = validarGasto({ ...b, categoria: b.tipo, descripcion: b.nombre }, hoy);
  if (!base.ok) return base;
  const v = base.valor;
  return {
    ok: true as const,
    valor: {
      p_ubicacion_id: v.p_ubicacion_id,
      p_tipo: b.tipo,
      p_nombre: b.nombre.trim(),
      p_fecha: v.p_fecha,
      p_monto_total: v.p_monto_total,
      p_comprobante: v.p_comprobante,
      p_medio_pago: v.p_medio_pago,
      p_caja_id: v.p_caja_id,
      p_caja_movimiento_id: v.p_caja_movimiento_id,
      p_referencia: v.p_referencia,
      p_vida_util_meses: vida,
      p_serie: b.serie.trim() || null,
      ...(v.p_cuenta_id ? { p_cuenta_id: v.p_cuenta_id } : {}),
    },
  };
}

// ---- Sumar el proveedor de un gasto: «¿no será uno que ya tienes?» (2026-09-25, ADR-0109 act. (c)) -------------------
//
// «¿No está? Súmalo» llama a `registrar_proveedor_de_gasto`, que ya reutiliza el proveedor si el RUC coincide o si el
// nombre es IGUAL (`fn_clave_texto`); pero para la base «Hidrandina S.A.A.» y «Hidrandina SA» son dos nombres distintos,
// y el RUC es opcional: el recibo de la luz terminaba en una ficha nueva. Esta regla dice, mientras se escribe, qué va a
// pasar al sumar:
//   PROMETE: «es» cuando la base devolvería uno que ya está en la lista (mismo RUC primero, después mismo nombre: el orden
//            de la RPC), así la pantalla lo elige sin crear nada; «preguntar» con los parecidos que nadie contestó todavía;
//            «sumar» solo cuando no queda pregunta abierta.
//   ASUME:   que `existentes` es la lista del formulario (los proveedores activos). Uno desactivado no entra en la
//            comparación: la base igual lo reutiliza si es el mismo RUC o nombre (1 de 76 el 2026-09-25).
//   NO HACE: no bloquea al que es otro de verdad: «No, es otro» (los `descartados`) deja seguir.

export type SumarProveedorGasto<P> =
  | { paso: "incompleto" }
  | { paso: "es"; proveedor: P; por: "ruc" | "nombre" }
  | { paso: "preguntar"; parecidos: { proveedor: P; por: MotivoParecido }[] }
  | { paso: "sumar" };

export function sumarProveedorDeGasto<P extends { id: string; nombre: string; ruc: string | null }>(
  nuevo: { nombre: string; ruc: string },
  existentes: readonly P[],
  descartados: ReadonlySet<string>,
  max = 3,
): SumarProveedorGasto<P> {
  const ruc = nuevo.ruc.trim();
  // El RUC contesta antes que el nombre, aunque el nombre todavía no esté escrito: con él, la base ya sabe quién es.
  const mismoRuc = /^\d{11}$/.test(ruc) ? existentes.find((p) => p.ruc === ruc) : undefined;
  if (mismoRuc) return { paso: "es", proveedor: mismoRuc, por: "ruc" };
  if (!claveTexto(nuevo.nombre)) return { paso: "incompleto" };
  // Sin tope: el tope va después de sacar a los que ya contestaron «es otro», para que los siguientes también se pregunten.
  const { igual, parecidos } = proveedoresParecidos(nuevo, existentes, existentes.length);
  if (igual) return { paso: "es", proveedor: igual, por: "nombre" };
  const abiertos = parecidos.filter((p) => !descartados.has(p.proveedor.id)).slice(0, max);
  return abiertos.length > 0 ? { paso: "preguntar", parecidos: abiertos } : { paso: "sumar" };
}

// ---- F2b: el gasto fijo del que sale un gasto ------------------------------------------------------------------------

/** El borrador de un gasto que nace de un gasto fijo: ya viene con su tienda, categoría, proveedor y monto de siempre. */
export function borradorDesdeFijo(f: GastoFijoMes, hoy: string): Partial<BorradorGasto> & { gastoFijoId: string } {
  return {
    gastoFijoId: f.id,
    ubicacion: f.ubicacionId ?? "empresa",
    categoria: f.categoria,
    descripcion: f.descripcion,
    comprobante: f.comprobanteTipo,
    proveedorId: f.proveedorId ?? "",
    monto: f.montoVariable ? "" : String(f.monto),
    fecha: f.fechaEsperada <= hoy ? f.fechaEsperada : hoy,
  };
}

// ---- F2b: activos fijos -----------------------------------------------------------------------------------------------

export type TipoActivo = { codigo: string; nombre: string; ejemplos: string; cuenta: string; cuentaNombre: string; vidaUtilMeses: number };

export type ActivoFila = {
  id: string;
  ubicacionId: string;
  ubicacionNombre: string;
  tipo: string | null;
  tipoNombre: string | null;
  cuenta: string | null;
  nombre: string;
  serie: string | null;
  fechaAdquisicion: string;
  costo: number;
  vidaUtilMeses: number;
  depreciacionMensual: number;
  mesesDepreciados: number;
  depreciacionAcumulada: number;
  valorHoy: number;
  estado: "activo" | "baja" | "vendido" | "anulado";
  fechaBaja: string | null;
  motivoBaja: string | null;
  compraId: string | null;
  comprobante: string | null;
  comprobanteTipo: string | null;
  proveedorNombre: string | null;
  condicion: "contado" | "credito" | null;
  saldo: number | null;
  tienePagos: boolean;
  medioPago: MedioGasto | null;
  cajaMovimientoId: string | null;
  motivoAnulacion: string | null;
  registradoPor: string | null;
  /** «Ya lo teníamos» (ADR-0335): lo tenía CAYLA antes del sistema; sin comprobante ni pago, y no movió plata. */
  cargaInicial: boolean;
};

export function leerTipoActivo(t: Fila): TipoActivo {
  return { codigo: String(t.codigo), nombre: String(t.nombre), ejemplos: String(t.ejemplos ?? ""), cuenta: String(t.cuenta), cuentaNombre: String(t.cuenta_nombre), vidaUtilMeses: num(t.vida_util_meses) };
}

export function leerActivo(a: Fila): ActivoFila {
  return {
    id: String(a.id),
    ubicacionId: String(a.ubicacion_id),
    ubicacionNombre: String(a.ubicacion_nombre ?? ""),
    tipo: txt(a.tipo),
    tipoNombre: txt(a.tipo_nombre),
    cuenta: txt(a.cuenta),
    nombre: String(a.nombre),
    serie: txt(a.serie),
    fechaAdquisicion: String(a.fecha_adquisicion),
    costo: num(a.costo),
    vidaUtilMeses: num(a.vida_util_meses),
    depreciacionMensual: num(a.depreciacion_mensual),
    mesesDepreciados: num(a.meses_depreciados),
    depreciacionAcumulada: num(a.depreciacion_acumulada),
    valorHoy: num(a.valor_hoy),
    estado: (String(a.estado) as ActivoFila["estado"]) ?? "activo",
    fechaBaja: txt(a.fecha_baja),
    motivoBaja: txt(a.motivo_baja),
    compraId: txt(a.compra_id),
    comprobante: txt(a.comprobante),
    comprobanteTipo: txt(a.comprobante_tipo),
    proveedorNombre: txt(a.proveedor_nombre),
    condicion: (txt(a.condicion) as "contado" | "credito" | null) ?? null,
    saldo: numONull(a.saldo),
    tienePagos: !!a.tiene_pagos,
    medioPago: (txt(a.medio_pago) as MedioGasto | null) ?? null,
    cajaMovimientoId: txt(a.caja_movimiento_id),
    motivoAnulacion: txt(a.motivo_anulacion),
    registradoPor: txt(a.registrado_por_nombre),
    cargaInicial: !!a.carga_inicial,
  };
}

export const TEXTO_ESTADO_ACTIVO: Record<ActivoFila["estado"], { texto: string; tono: "verde" | "ambar" | "apagado" | "neutro" }> = {
  activo: { texto: "En uso", tono: "verde" },
  baja: { texto: "Dado de baja", tono: "neutro" },
  vendido: { texto: "Vendido", tono: "neutro" },
  anulado: { texto: "Anulado", tono: "apagado" },
};

/** «10 años», «4 años», «1 año y 6 meses». */
export function textoVidaUtil(meses: number): string {
  const a = Math.floor(meses / 12), m = meses % 12;
  const anios = a ? `${a} ${a === 1 ? "año" : "años"}` : "";
  const mes = m ? `${m} ${m === 1 ? "mes" : "meses"}` : "";
  return [anios, mes].filter(Boolean).join(" y ") || "0 meses";
}

/** Los totales de la lista de activos en uso: lo que costaron, lo depreciado, lo que valen hoy y lo que se deprecia al mes. */
export function totalesActivos(activos: readonly ActivoFila[]): { costo: number; depreciado: number; valorHoy: number; alMes: number; enUso: number } {
  const enUso = activos.filter((a) => a.estado === "activo");
  const suma = (f: (a: ActivoFila) => number) => Math.round(enUso.reduce((t, a) => t + f(a), 0) * 100) / 100;
  return {
    costo: suma((a) => a.costo),
    depreciado: suma((a) => a.depreciacionAcumulada),
    valorHoy: suma((a) => a.valorHoy),
    alMes: suma((a) => (a.mesesDepreciados < a.vidaUtilMeses ? a.depreciacionMensual : 0)),
    enUso: enUso.length,
  };
}

/** Una sede con lo que tiene en uso (ADR-0335): cuántos activos, lo que costaron, lo depreciado, lo que valen hoy y lo que se deprecia al mes. */
export type ResumenActivosSede = { ubicacionId: string; nombre: string; activos: number; costo: number; depreciado: number; valorHoy: number; alMes: number };

/**
 * La vista integrada de los activos: una fila por sede y el total de CAYLA, solo de lo que está en uso (como el pie de la tabla).
 *
 * CONTRATO. Promete: `porSede` trae TODAS las sedes que se le pasan, en ese orden, aun sin un solo activo (ceros: así se ve lo que
 *   falta cargar, como la Tienda LIM), y `total` es la suma de los activos en uso. Asume: `sedes` son las unidades que la cuenta ve y
 *   cada activo trae el `ubicacionId` de una de ellas (la base solo devuelve activos de unidades activas que la cuenta ve).
 */
export function resumenActivosPorSede(
  activos: readonly ActivoFila[],
  sedes: readonly UbicacionGastos[]
): { porSede: ResumenActivosSede[]; total: Omit<ResumenActivosSede, "ubicacionId" | "nombre"> } {
  const fila = (lista: readonly ActivoFila[]) => {
    const t = totalesActivos(lista);
    return { activos: t.enUso, costo: t.costo, depreciado: t.depreciado, valorHoy: t.valorHoy, alMes: t.alMes };
  };
  return {
    porSede: sedes.map((s) => ({ ubicacionId: s.id, nombre: s.nombre, ...fila(activos.filter((a) => a.ubicacionId === s.id)) })),
    total: fila(activos),
  };
}

/** Anular: solo en uso y sin factura pagada (si no, se da de baja). */
export function puedeAnularActivo(a: Pick<ActivoFila, "estado" | "compraId" | "tienePagos">): boolean {
  return a.estado === "activo" && !(a.compraId && a.tienePagos);
}

// ---- F2b: gastos fijos ------------------------------------------------------------------------------------------------

export type EstadoFijo = "registrado" | "por_llegar" | "falta";

/** Cuándo llega un gasto fijo cada mes (ADR-0437): un día fijo (1 al 28), la primera semana, la quincena o fin de mes. */
/** Un proveedor para elegir en un gasto, con cómo contactarlo (ADR-0437). Lo bancario no va aquí: se pide al elegir. */
export type ProveedorGasto = {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto?: string | null;
  telefono?: string | null;
  forma_pago_preferida?: string | null;
  plazo_credito_dias?: number | null;
};

export type MomentoFijo = "dia" | "primera_semana" | "quincena" | "fin_de_mes";

export const MOMENTOS_FIJO: readonly MomentoFijo[] = ["dia", "primera_semana", "quincena", "fin_de_mes"];

export const TEXTO_MOMENTO_FIJO: Record<MomentoFijo, string> = {
  dia: "Un día fijo del mes",
  primera_semana: "La primera semana",
  quincena: "La quincena",
  fin_de_mes: "A fin de mes",
};

/** La ayuda bajo «Cuándo llega»: qué día se espera en cada opción (ADR-0437). */
export const AYUDA_MOMENTO_FIJO: Record<MomentoFijo, string | undefined> = {
  dia: undefined,
  primera_semana: "Se espera el 7 de cada mes; recién falta si pasa el 7.",
  quincena: "Se espera el 15 de cada mes.",
  fin_de_mes: "Se espera el último día de cada mes (28, 29, 30 o 31). Recién falta al día siguiente.",
};

/** Lee el momento que trae la base; una base sin la migración (o un valor raro) cuenta como «un día fijo». */
export function leerMomentoFijo(v: unknown): MomentoFijo {
  return MOMENTOS_FIJO.includes(v as MomentoFijo) ? (v as MomentoFijo) : "dia";
}

/** «el día 10», «la primera semana», «la quincena», «a fin de mes»: cuándo llega un fijo, para leerlo en una frase. */
export function textoCuandoLlega(momento: MomentoFijo, dia: number): string {
  if (momento === "primera_semana") return "la primera semana";
  if (momento === "quincena") return "la quincena";
  if (momento === "fin_de_mes") return "a fin de mes";
  return `el día ${dia}`;
}

/** Lo que va en la columna «Día» de la lista de fijos: el número o la palabra. */
export function textoColumnaCuando(momento: MomentoFijo, dia: number): string {
  if (momento === "primera_semana") return "1.ª semana";
  if (momento === "quincena") return "Quincena";
  if (momento === "fin_de_mes") return "Fin de mes";
  return String(dia);
}

export type GastoFijoMes = {
  id: string;
  ubicacionId: string | null;
  ubicacionNombre: string;
  categoria: string;
  categoriaNombre: string;
  descripcion: string;
  proveedorId: string | null;
  proveedorNombre: string | null;
  comprobanteTipo: TipoComprobante;
  monto: number;
  montoVariable: boolean;
  diaDelMes: number;
  /** Cuándo llega (ADR-0437). Una base sin la migración no lo trae: se lee como «dia». */
  momento: MomentoFijo;
  fechaEsperada: string;
  estado: EstadoFijo;
  gastoId: string | null;
  gastoMonto: number | null;
};

export type FijoSugerido = {
  ubicacionId: string | null;
  ubicacionNombre: string;
  categoria: string;
  categoriaNombre: string;
  proveedorId: string | null;
  proveedorNombre: string | null;
  descripcion: string;
  comprobanteTipo: TipoComprobante;
  monto: number;
  diaDelMes: number;
  meses: number;
};

export function leerFijoMes(f: Fila): GastoFijoMes {
  return {
    id: String(f.id),
    ubicacionId: txt(f.ubicacion_id),
    ubicacionNombre: String(f.ubicacion_nombre ?? ""),
    categoria: String(f.categoria),
    categoriaNombre: String(f.categoria_nombre),
    descripcion: String(f.descripcion),
    proveedorId: txt(f.proveedor_id),
    proveedorNombre: txt(f.proveedor_nombre),
    comprobanteTipo: (String(f.comprobante_tipo) as TipoComprobante) ?? "factura",
    monto: num(f.monto),
    montoVariable: !!f.monto_variable,
    diaDelMes: num(f.dia_del_mes),
    momento: leerMomentoFijo(f.momento),
    fechaEsperada: String(f.fecha_esperada),
    estado: (String(f.estado) as EstadoFijo) ?? "por_llegar",
    gastoId: txt(f.gasto_id),
    gastoMonto: numONull(f.gasto_monto),
  };
}

export function leerSugerido(f: Fila): FijoSugerido {
  return {
    ubicacionId: txt(f.ubicacion_id),
    ubicacionNombre: String(f.ubicacion_nombre ?? ""),
    categoria: String(f.categoria),
    categoriaNombre: String(f.categoria_nombre),
    proveedorId: txt(f.proveedor_id),
    proveedorNombre: txt(f.proveedor_nombre),
    descripcion: String(f.descripcion),
    comprobanteTipo: (String(f.comprobante_tipo) as TipoComprobante) ?? "factura",
    monto: num(f.monto),
    diaDelMes: num(f.dia_del_mes),
    meses: num(f.meses),
  };
}

/** Lo que pide la cifra de la pestaña: cuántos faltan y cuántos vienen este mes. */
export function resumenFijos(fijos: readonly GastoFijoMes[]): { faltan: number; vienen: number; registrados: number; montoPendiente: number } {
  const pend = fijos.filter((f) => f.estado !== "registrado");
  return {
    faltan: fijos.filter((f) => f.estado === "falta").length,
    vienen: fijos.filter((f) => f.estado === "por_llegar").length,
    registrados: fijos.filter((f) => f.estado === "registrado").length,
    montoPendiente: Math.round(pend.reduce((t, f) => t + f.monto, 0) * 100) / 100,
  };
}

export type BorradorFijo = { ubicacion: string; categoria: string; descripcion: string; proveedorId: string; comprobante: TipoComprobante; monto: string; variable: boolean; dia: string; momento: MomentoFijo };

export type ParamsFijo = { p_ubicacion_id: string | null; p_categoria: string; p_descripcion: string; p_proveedor_id: string | null; p_comprobante_tipo: TipoComprobante; p_monto: number; p_monto_variable: boolean; p_dia_del_mes: number; p_momento?: MomentoFijo };

/** El día que respalda a cada momento (el mismo que exige la base: 7, 15 y 28 son solo el orden). */
const DIA_DE_RESPALDO: Record<Exclude<MomentoFijo, "dia">, number> = { primera_semana: 7, quincena: 15, fin_de_mes: 28 };

export function validarFijo(b: BorradorFijo): Resultado<ParamsFijo> {
  if (!b.ubicacion) return { ok: false, error: "Elige a qué tienda se le carga." };
  if (!b.categoria) return { ok: false, error: "Elige la categoría." };
  if (!b.descripcion.trim()) return { ok: false, error: "Escribe qué se paga." };
  const m = parsearMonto(b.monto);
  if (!m.ok) return m;
  let dia: number;
  if (b.momento === "dia") {
    dia = Number(b.dia);
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) return { ok: false, error: "El día va del 1 al 28. Si llega el 29, 30 o 31, elige «A fin de mes»." };
  } else {
    dia = DIA_DE_RESPALDO[b.momento];
  }
  return {
    ok: true,
    valor: {
      p_ubicacion_id: b.ubicacion === "empresa" ? null : b.ubicacion,
      p_categoria: b.categoria,
      p_descripcion: b.descripcion.trim(),
      p_proveedor_id: b.proveedorId || null,
      p_comprobante_tipo: b.comprobante,
      p_monto: m.valor,
      p_monto_variable: b.variable,
      p_dia_del_mes: dia,
      // Solo si no es «un día fijo»: así la web sirve también antes de que la base tenga la migración (ADR-0437).
      ...(b.momento === "dia" ? {} : { p_momento: b.momento }),
    },
  };
}
