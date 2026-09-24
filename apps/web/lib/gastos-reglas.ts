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

/** Cómo se pagó, en una línea: «Yape», «Efectivo del cajón», «A crédito · vence 12 oct». */
export function textoPago(g: Pick<GastoFila, "medioPago" | "cajaMovimientoId" | "compraId" | "condicion" | "fechaVencimiento" | "tienePagos">, fecha: (iso: string) => string): string {
  if (g.compraId && g.condicion === "credito") return g.fechaVencimiento ? `A crédito · vence ${fecha(g.fechaVencimiento)}` : "A crédito";
  if (g.cajaMovimientoId) return "Efectivo del cajón";
  if (g.medioPago) return TEXTO_MEDIO[g.medioPago];
  return g.tienePagos ? "Pagado" : "—";
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
    },
  };
}
