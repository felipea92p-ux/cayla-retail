// «Pedir a otra sede» (ADR-0242 D-7, migración 20260927210000): lógica pura de la reposición entre tiendas.
// La base guarda una fila por prenda con un `grupo_id` común; `fn_pedidos_entre_sedes` ya los devuelve agrupados.
// Aquí se decide lo que la pantalla muestra: qué va en «Te piden» y en «Pediste», qué dice cada estado, qué botones ve
// cada lado y cómo se arma lo que se manda a la base. Sin React ni Supabase: se prueba en `pedidos-entre-sedes-reglas.test.ts`.

export type EstadoPedidoEntreSedes = "pedido" | "en_camino" | "recibido" | "cancelado";
export type DireccionPedido = "pedi" | "me_piden";

export type LineaPedidoEntreSedes = {
  pedidoId: string;
  varianteId: string;
  producto: string;
  color: string | null;
  talla: string | null;
  /** El código de la etiqueta (o el SKU viejo si la prenda no tiene código). */
  sku: string | null;
  cantidad: number;
  estado: EstadoPedidoEntreSedes;
  /** Lo que la sede que envía tiene HOY libre (sin apartar), en todas sus sububicaciones. */
  disponibleEnOrigen: number;
};

export type PedidoEntreSedes = {
  grupoId: string;
  direccion: DireccionPedido;
  /** La otra sede: a la que pedí (pedi) o la que me pide (me_piden). */
  otraSede: string;
  otraSedeId: string;
  estado: EstadoPedidoEntreSedes;
  creadoEn: string;
  creadoPorNombre: string | null;
  nota: string | null;
  trasladoId: string | null;
  trasladoNumero: number | null;
  canceladoMotivo: string | null;
  lineas: LineaPedidoEntreSedes[];
};

const ESTADOS: readonly EstadoPedidoEntreSedes[] = ["pedido", "en_camino", "recibido", "cancelado"];
const estadoDe = (v: unknown): EstadoPedidoEntreSedes =>
  ESTADOS.includes(v as EstadoPedidoEntreSedes) ? (v as EstadoPedidoEntreSedes) : "pedido";
const textoONull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function lineaDeJson(l: Record<string, unknown>): LineaPedidoEntreSedes {
  return {
    pedidoId: String(l.pedido_id ?? ""),
    varianteId: String(l.variante_id ?? ""),
    producto: String(l.producto ?? "Prenda"),
    color: textoONull(l.color),
    talla: textoONull(l.talla),
    sku: textoONull(l.sku),
    cantidad: Number(l.cantidad ?? 0),
    estado: estadoDe(l.estado),
    disponibleEnOrigen: Math.max(0, Number(l.disponible_en_origen ?? 0)),
  };
}

/** Una fila de `fn_pedidos_entre_sedes` → el pedido que usa la pantalla. */
export function pedidoEntreSedesDeFila(f: Record<string, unknown>): PedidoEntreSedes {
  const lineas = Array.isArray(f.lineas) ? (f.lineas as Record<string, unknown>[]).map(lineaDeJson) : [];
  return {
    grupoId: String(f.grupo_id),
    direccion: f.direccion === "me_piden" ? "me_piden" : "pedi",
    otraSede: String(f.otra_sede ?? ""),
    otraSedeId: String(f.otra_sede_id ?? ""),
    estado: estadoDe(f.estado),
    creadoEn: String(f.created_at ?? ""),
    creadoPorNombre: textoONull(f.creado_por_nombre),
    nota: textoONull(f.nota),
    trasladoId: textoONull(f.traslado_id),
    trasladoNumero: f.traslado_numero == null ? null : Number(f.traslado_numero),
    canceladoMotivo: textoONull(f.cancelado_motivo),
    lineas,
  };
}

/** «Blusa Carlita · Blanco · M»: lo que se dice por teléfono. */
export function etiquetaLinea(l: Pick<LineaPedidoEntreSedes, "producto" | "color" | "talla">): string {
  return [l.producto, l.color, l.talla].filter((x): x is string => !!x && x.trim() !== "").join(" · ");
}

export function totalPrendas(p: Pick<PedidoEntreSedes, "lineas">): number {
  return p.lineas.reduce((s, l) => s + l.cantidad, 0);
}

export function textoPrendas(n: number): string {
  return n === 1 ? "1 prenda" : `${n} prendas`;
}

/** La sede que envía ya no tiene libre lo que se pidió de esa prenda (se vendió o se apartó después del pedido). */
export function faltaEnOrigen(l: Pick<LineaPedidoEntreSedes, "cantidad" | "disponibleEnOrigen" | "estado">): boolean {
  return l.estado === "pedido" && l.disponibleEnOrigen < l.cantidad;
}

/**
 * Las dos listas de la tarjeta:
 *  · «Te piden»: lo que otra sede me pidió y todavía no sale (es trabajo por hacer HOY).
 *  · «Pediste»: lo que yo pedí, en cualquier estado (abierto o cerrado hace menos de 7 días, lo filtra la base).
 * Lo que me pidieron y ya salió no se repite aquí: ya está en la lista de traslados, en camino.
 */
export function separarPedidos(pedidos: PedidoEntreSedes[]): { tePiden: PedidoEntreSedes[]; pediste: PedidoEntreSedes[] } {
  return {
    tePiden: pedidos.filter((p) => p.direccion === "me_piden" && p.estado === "pedido"),
    pediste: pedidos.filter((p) => p.direccion === "pedi"),
  };
}

/** La tarjeta solo se dibuja si hay algo que mostrar (nunca una tarjeta vacía). */
export function hayPedidosQueMostrar(pedidos: PedidoEntreSedes[]): boolean {
  const { tePiden, pediste } = separarPedidos(pedidos);
  return tePiden.length + pediste.length > 0;
}

export type TonoEstadoPedido = "ambar" | "pizarra" | "verde" | "apagado";

/** Lo que dice el chip, según de qué lado se mira. */
export function estadoVisiblePedido(p: Pick<PedidoEntreSedes, "estado" | "direccion" | "otraSede">): { texto: string; tono: TonoEstadoPedido } {
  switch (p.estado) {
    case "pedido":
      return p.direccion === "pedi" ? { texto: `Esperando a ${p.otraSede}`, tono: "ambar" } : { texto: "Por enviar", tono: "ambar" };
    case "en_camino":
      return { texto: "En camino", tono: "pizarra" };
    case "recibido":
      return { texto: "Llegó", tono: "verde" };
    case "cancelado":
      return { texto: "Cancelado", tono: "apagado" };
  }
}

export type AccionesPedido = {
  /** «Enviar» (arma el traslado): solo la sede a la que le piden, mientras nada salió. */
  enviar: boolean;
  /** «No la tengo»: la sede a la que le piden, mientras nada salió. */
  noLaTengo: boolean;
  /** «Ya no la necesito»: la sede que pidió, mientras nada salió. */
  yaNoLaNecesito: boolean;
  /** Enlace al traslado, cuando ya salió. */
  verTraslado: boolean;
};

export function accionesDePedido(p: Pick<PedidoEntreSedes, "estado" | "direccion" | "trasladoId">): AccionesPedido {
  const abierto = p.estado === "pedido";
  return {
    enviar: abierto && p.direccion === "me_piden",
    noLaTengo: abierto && p.direccion === "me_piden",
    yaNoLaNecesito: abierto && p.direccion === "pedi",
    verTraslado: p.trasladoId !== null && p.estado !== "pedido",
  };
}

/** El motivo que queda guardado al cancelar, según quién cancela. */
export function motivoCancelacion(direccion: DireccionPedido): string {
  return direccion === "me_piden" ? "No la tengo" : "Ya no la necesito";
}

// ---------------------------------------------------------------------------
// Llegada estimada: Hoy / Mañana / Pasado mañana (como el «Nuevo traslado» de ADR-0242 D-2)
// ---------------------------------------------------------------------------
export type OpcionLlegada = { clave: "hoy" | "manana" | "pasado"; etiqueta: string; fecha: string };

const DIA_MS = 86_400_000;
const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);

/** `hoy` en YYYY-MM-DD de Lima. */
export function opcionesLlegada(hoy: string): OpcionLlegada[] {
  return [
    { clave: "hoy", etiqueta: "Hoy", fecha: hoy },
    { clave: "manana", etiqueta: "Mañana", fecha: sumarDias(hoy, 1) },
    { clave: "pasado", etiqueta: "Pasado mañana", fecha: sumarDias(hoy, 2) },
  ];
}

/** La hora que se guarda: el cierre de la tienda de ese día, en Lima (UTC−5, sin horario de verano). */
export function llegadaIso(fecha: string): string {
  return `${fecha}T19:00:00-05:00`;
}

// ---------------------------------------------------------------------------
// El modal «Pedir a otra sede»: cantidades con − / + y lo que se manda a la base
// ---------------------------------------------------------------------------
export type LineaParaPedir = { varianteId: string; etiqueta: string; disponibleEnOrigen: number; cantidad: number };

/** − / +: entre 0 (no la pido) y lo que la otra sede tiene libre. */
export function ajustarCantidad(actual: number, delta: number, tope: number): number {
  return Math.min(Math.max(0, tope), Math.max(0, actual + delta));
}

/** Lo que se manda a `pedir_a_otra_sede`: solo las prendas con cantidad, cada una topada a lo disponible. */
export function lineasParaRpc(lineas: LineaParaPedir[]): { variante_id: string; cantidad: number }[] {
  return lineas
    .map((l) => ({ variante_id: l.varianteId, cantidad: Math.min(l.cantidad, Math.max(0, l.disponibleEnOrigen)) }))
    .filter((l) => l.cantidad > 0);
}

export const TOPE_LINEAS_PEDIDO = 100;

/** Por qué todavía no se puede pedir (`null` = se puede). */
export function motivoNoSePuedePedir(lineas: LineaParaPedir[]): string | null {
  const aPedir = lineasParaRpc(lineas);
  if (aPedir.length === 0) return "Elige al menos una prenda";
  if (aPedir.length > TOPE_LINEAS_PEDIDO) return `Un pedido lleva hasta ${TOPE_LINEAS_PEDIDO} prendas distintas`;
  return null;
}
