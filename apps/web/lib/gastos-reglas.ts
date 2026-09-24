// Reglas de Finanzas ▸ Gastos (ADR-0195 F2). Lógica pura: la usan la pantalla y sus pruebas.
// Las mismas reglas las cierra la base (`registrar_gasto`, checks y disparadores de 20260924235100); aquí se dicen con una
// frase clara ANTES de ir a la base, y se arma lo que la RPC espera.

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

/** "1,500", "1500.50", "S/ 300" → número. */
export function parsearMonto(texto: string): Resultado<number> {
  const limpio = texto.replace(/s\/|\s/gi, "").replace(/,/g, "");
  if (limpio === "") return { ok: false, error: "Escribe el monto." };
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return { ok: false, error: "Escribe un monto, por ejemplo 648.50." };
  const n = Number(limpio);
  if (n <= 0) return { ok: false, error: "El monto tiene que ser mayor que cero." };
  return { ok: true, valor: n };
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

export function nombreVer(ver: Ver, ubicaciones: readonly UbicacionGastos[]): string {
  if (ver.soloEmpresa) return "de la empresa";
  if (!ver.ubicacionId) return "de todas las tiendas";
  return `de ${ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "la tienda"}`;
}

// ---- Lo que devuelve la base → tipos de la pantalla ---------------------------------------------------------------------

export type CategoriaGasto = { codigo: string; nombre: string; ejemplos: string; cuenta: string; cuentaNombre: string };

export type PanelGastos = {
  total: number;
  igv: number;
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
  comprobanteTipo: TipoComprobante;
  comprobante: string | null;
  proveedorNombre: string | null;
  condicion: "contado" | "credito" | null;
  fechaVencimiento: string | null;
  saldo: number | null;
  tienePagos: boolean;
  estado: "vigente" | "anulado";
  motivoAnulacion: string | null;
  registradoPor: string | null;
};

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
  return {
    total: num(d.total),
    igv: num(d.igv),
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
    comprobanteTipo: ((txt(g.comprobante_tipo) as TipoComprobante | null) ?? "sin_comprobante"),
    comprobante: txt(g.comprobante),
    proveedorNombre: txt(g.proveedor_nombre),
    condicion: (txt(g.condicion) as "contado" | "credito" | null) ?? null,
    fechaVencimiento: txt(g.fecha_vencimiento),
    saldo: numONull(g.saldo),
    tienePagos: !!g.tiene_pagos,
    estado: g.estado === "anulado" ? "anulado" : "vigente",
    motivoAnulacion: txt(g.motivo_anulacion),
    registradoPor: txt(g.registrado_por_nombre),
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

/** «S/ 5,472»: las cifras grandes de una pantalla van sin céntimos (spike); las filas, con ellos (`soles`). */
export function solesRedondo(n: number): string {
  return `S/ ${Math.round(n).toLocaleString("es-PE")}`;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «23 sep» (con el año si se pide: «23 sep 2026»). */
export function fechaCorta(iso: string | null, conAnio = false): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1]}${conAnio ? ` ${a}` : ""}`;
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
  const monto = parsearMonto(b.monto);
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
    if (b.medio === "efectivo" && !b.cajaId) return { ok: false, error: "En efectivo, sale de la caja abierta de la tienda. Si la caja está cerrada, registra el egreso en Caja primero." };
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
    },
  };
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

/** Anular: solo en uso y sin factura pagada (si no, se da de baja). */
export function puedeAnularActivo(a: Pick<ActivoFila, "estado" | "compraId" | "tienePagos">): boolean {
  return a.estado === "activo" && !(a.compraId && a.tienePagos);
}

// ---- F2b: gastos fijos ------------------------------------------------------------------------------------------------

export type EstadoFijo = "registrado" | "por_llegar" | "falta";
export const TEXTO_ESTADO_FIJO: Record<EstadoFijo, { texto: string; tono: "verde" | "pizarra" | "ambar" }> = {
  registrado: { texto: "Registrado", tono: "verde" },
  por_llegar: { texto: "Viene", tono: "pizarra" },
  falta: { texto: "Falta registrar", tono: "ambar" },
};

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

export type BorradorFijo = { ubicacion: string; categoria: string; descripcion: string; proveedorId: string; comprobante: TipoComprobante; monto: string; variable: boolean; dia: string };

export function validarFijo(b: BorradorFijo): Resultado<{ p_ubicacion_id: string | null; p_categoria: string; p_descripcion: string; p_proveedor_id: string | null; p_comprobante_tipo: TipoComprobante; p_monto: number; p_monto_variable: boolean; p_dia_del_mes: number }> {
  if (!b.ubicacion) return { ok: false, error: "Elige a qué tienda se le carga." };
  if (!b.categoria) return { ok: false, error: "Elige la categoría." };
  if (!b.descripcion.trim()) return { ok: false, error: "Escribe qué se paga." };
  const m = parsearMonto(b.monto);
  if (!m.ok) return m;
  const dia = Number(b.dia);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) return { ok: false, error: "El día va del 1 al 28 (para que exista en todos los meses)." };
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
    },
  };
}
