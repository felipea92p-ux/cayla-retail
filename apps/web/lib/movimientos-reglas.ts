import type { TonoChip } from "@/components/ui/Chip";
// Relativo, no `@/`: vitest no resuelve el alias y este archivo tiene pruebas.
import { ESTADO_ETIQUETA, ETIQUETA_TIPO, type EstadoComprobante, type TipoComprobante } from "./comprobantes-reglas";

// Reglas de lectura de Movimientos, sin nada de servidor: las importan los
// componentes cliente (lista, filtros, detalle). Las lecturas contra Postgres
// viven en `movimientos-v2.ts` (mismo reparto que compras-reglas / compras).
//
// La idea central (ADR-0050): `retail.movimientos` tiene 4 `tipo`
// (entrada/salida/ajuste/traslado) y eso NO cambia. La pantalla muestra 5
// CATEGORÍAS porque «reposición interna» y «transferencia entre sedes» son las
// dos cosas que una encargada de sede distingue de un vistazo — y las dos son
// `traslado` en la base. `fn_movimientos` calcula la categoría una vez, en SQL;
// acá solo se etiqueta y se colorea.

export type TipoMovimiento = "entrada" | "salida" | "ajuste" | "traslado";
export type CategoriaMovimiento = "entrada" | "salida" | "interno" | "ajuste" | "transferencia";

export const CATEGORIAS: CategoriaMovimiento[] = ["entrada", "salida", "interno", "ajuste", "transferencia"];

export const ETIQUETA_CATEGORIA: Record<CategoriaMovimiento, string> = {
  entrada: "Entrada",
  salida: "Salida",
  interno: "Interno",
  ajuste: "Ajuste",
  transferencia: "Transferencia",
};

// Sobrio a propósito: verde = llegó mercadería, ámbar = se movió dentro de la
// tienda (piso ↔ almacén), rojo = un ajuste que RESTA (hay que mirarlo), el
// resto neutro. Un ajuste que suma no es alarma.
export function tonoCategoria(categoria: CategoriaMovimiento, delta: number): TonoChip {
  if (categoria === "entrada") return "verde";
  if (categoria === "interno") return "ambar";
  if (categoria === "ajuste" && delta < 0) return "rojo";
  return "neutro";
}

/** El proceso que originó el movimiento (`movimientos.motivo`). Los de
 *  operación los escriben las RPC; los de «sistema» son cargas hechas por
 *  script, sin persona (`usuario_id` null): existen en producción y se
 *  muestran con nombre propio, no se inventan. `reposicion`/`merma`/
 *  `conteo_fisico`/`otro` son de `AjustarInventarioModal.tsx` — un ajuste
 *  suelto vía `registrar_movimiento`, tipo='ajuste' — y se distinguen a
 *  propósito de `conteo` (ADR-0023): ese lo escribe SOLO `cerrar_conteo`, con
 *  `conteo_item_id` enlazado al conteo formal; `conteo_fisico` es el mismo
 *  gesto (contar y corregir) pero sin abrir un conteo de verdad. Un motivo
 *  que no esté acá se muestra tal cual — nunca rompe la pantalla.
 *
 *  `cuarentena_*` (2026-09-17, "Dañado"): la SALIDA de cuarentena cuando un
 *  líder resuelve una prenda dañada — `resolver_prenda_danada`, una por
 *  cada uno de los 3 estados de salida. La ENTRADA a cuarentena sigue
 *  usando el motivo `devolucion` de siempre (mismo gesto que una devolución
 *  vendible, solo cambia la sububicación destino). */
export const ETIQUETA_PROCESO: Record<string, string> = {
  recepcion: "Recepción",
  venta: "Venta",
  transferencia: "Transferencia (modelo anterior)",
  traslado_salida: "Traslado — salida",
  traslado_entrada: "Traslado — llegada",
  movimiento_interno: "Reposición interna",
  devolucion: "Devolución",
  cambio: "Cambio",
  anulacion_venta: "Anulación de venta",
  produccion: "Producción del Taller",
  conteo: "Ajuste por conteo",
  reposicion: "Reposición",
  merma: "Merma",
  conteo_fisico: "Conteo físico (manual)",
  otro: "Otro ajuste",
  carga_inicial: "Carga inicial",
  activacion_piso_almacen: "Activación piso/almacén",
  siembra_cargo_especial: "Cargo especial",
  cuarentena_liquidada: "Dañado — liquidada",
  cuarentena_se_boto: "Dañado — se botó",
  cuarentena_donada: "Dañado — donada",
};

/** Los procesos que ofrece el filtro, en el orden en que se leen. */
export const PROCESOS_FILTRO: { valor: string; etiqueta: string }[] = [
  "recepcion",
  "venta",
  "traslado_salida",
  "traslado_entrada",
  "movimiento_interno",
  "devolucion",
  "cambio",
  "anulacion_venta",
  "produccion",
  "conteo",
  "reposicion",
  "merma",
  "conteo_fisico",
  "otro",
  "carga_inicial",
  "activacion_piso_almacen",
  "cuarentena_liquidada",
  "cuarentena_se_boto",
  "cuarentena_donada",
].map((valor) => ({ valor, etiqueta: ETIQUETA_PROCESO[valor] }));

export function etiquetaProceso(motivo: string | null): string {
  if (!motivo) return "Sin proceso";
  return ETIQUETA_PROCESO[motivo] ?? motivo.replace(/_/g, " ");
}

export const ETIQUETA_ESTADO_DEVOLUCION: Record<string, string> = {
  pendiente: "Pendiente de aprobar",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

/** `transferencias.estado` (20260916150000): "completada" son filas del
 *  modelo atómico anterior a esta migración — no vuelven a escribirse, pero
 *  siguen existiendo en el historial y hay que poder mostrarlas. */
export const ETIQUETA_ESTADO_TRASLADO: Record<string, string> = {
  completada: "Completada",
  en_transito: "En tránsito",
  recibido_con_diferencia: "Con diferencia — pendiente de líder",
  cerrada: "Cerrada",
};

export function tonoEstadoTraslado(estado: string): TonoChip {
  if (estado === "recibido_con_diferencia") return "ambar";
  if (estado === "en_transito") return "neutro";
  return "verde";
}

// ---------------------------------------------------------------------------
// La fila que devuelve `fn_movimientos`, ya en castellano de pantalla. Cada
// proceso trae su referencia como un objeto propio (o null): así el detalle
// pregunta «¿tiene venta?» y no «¿venta_id es null y comprobante_numero…?».
// ---------------------------------------------------------------------------
export type Movimiento = {
  id: string;
  /** ISO con microsegundos y zona, tal cual lo devuelve Postgres — es la
   *  mitad del cursor de paginado y se reenvía sin tocar. */
  creadoEn: string;
  /** `aaaa-mm-dd` en hora de Lima: por esto se agrupa la lista. */
  fecha: string;
  hora: string;
  tipo: TipoMovimiento;
  categoria: CategoriaMovimiento;
  motivo: string | null;
  cantidad: number;
  /** Efecto sobre la ubicación que se está mirando: + entra, − sale, 0 interno. */
  delta: number;
  /** Sin persona detrás: carga por script (`usuario_id` null). */
  esSistema: boolean;
  nota: string | null;
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  ubicacionId: string;
  ubicacion: string;
  ubicacionDestinoId: string | null;
  ubicacionDestino: string | null;
  sububicacion: { id: string; nombre: string; tipo: string | null } | null;
  sububicacionDestino: { id: string; nombre: string; tipo: string | null } | null;
  usuarioId: string | null;
  usuario: string | null;
  venta: { id: string; nota: string | null; comprobante: { tipo: TipoComprobante; numero: string; estado: EstadoComprobante } | null } | null;
  lote: { id: string; guia: string | null; nota: string | null; proveedor: string | null } | null;
  compra: { id: string; documento: string | null } | null;
  transferencia: { id: string; estado: string | null; nota: string | null } | null;
  conteo: { id: string; sistema: number | null; contado: number | null } | null;
  devolucion: { id: string; motivo: string | null; estado: string | null } | null;
  cambio: { id: string; diferencia: number | null } | null;
};

/** Cursor de paginado: «las 50 después de ESTA fila». Dos partes, no tres como
 *  el de Compras: acá no hay una fecha de negocio distinta de `created_at`. */
export type CursorMovimientos = { creadoEn: string; id: string };

const ES_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const ES_UUID = /^[0-9a-f-]{36}$/i;

export function serializarCursorMovimientos(c: CursorMovimientos): string {
  return `${c.creadoEn}~${c.id}`;
}

export function leerCursorMovimientos(texto: string | undefined): CursorMovimientos | null {
  if (!texto) return null;
  const [creadoEn, id] = texto.split("~");
  return ES_TIMESTAMP.test(creadoEn ?? "") && ES_UUID.test(id ?? "") ? { creadoEn, id } : null;
}

// ---------------------------------------------------------------------------
// Cómo se lee cada movimiento. Texto, no JSX: lo usan la lista, el detalle y
// el `title` de una celda truncada por igual.
// ---------------------------------------------------------------------------

/** «+3», «−1», o «3» cuando es interno (no cambia el total de la tienda). */
export function textoDelta(m: Pick<Movimiento, "categoria" | "cantidad" | "delta">): string {
  if (m.categoria === "interno") return String(Math.abs(m.cantidad));
  if (m.delta > 0) return `+${m.delta}`;
  if (m.delta < 0) return `−${Math.abs(m.delta)}`;
  return "0";
}

/** El nombre de una sububicación para una celda angosta: las dos que el motor
 *  conoce se abrevian («Piso», «Almacén»); cualquier otra (un rack del Taller)
 *  va con su nombre. El detalle muestra siempre el nombre completo. */
export function nombreCortoSububicacion(s: Movimiento["sububicacion"]): string {
  if (!s) return "Sin sububicación";
  if (s.tipo === "piso_venta") return "Piso";
  if (s.tipo === "almacen_tienda") return "Almacén";
  return s.nombre;
}

/** De dónde a dónde, según lo que importa en cada categoría: sububicaciones
 *  en un interno, sedes en una transferencia, la sububicación tocada en el
 *  resto (o nada, en una ubicación sin piso/almacén). */
export function textoOrigenDestino(m: Movimiento): string | null {
  if (m.categoria === "interno") {
    return `${nombreCortoSububicacion(m.sububicacion)} → ${nombreCortoSububicacion(m.sububicacionDestino)}`;
  }
  if (m.categoria === "transferencia") {
    return `${m.ubicacion} → ${m.ubicacionDestino ?? "—"}`;
  }
  return m.sububicacion?.nombre ?? null;
}

/** De dónde a dónde, para la columna «Origen → Destino» de la lista (diseño
 *  de Felipe, 2026-09-16): cada proceso nombra sus dos puntas en el
 *  vocabulario de la tienda, no en el de la base. Una venta sale del piso
 *  hacia la clienta; una recepción llega del proveedor al almacén; un ajuste
 *  no tiene dos puntas — es un solo lugar y el proceso ya dice qué pasó.
 *  `destino` null = mostrar solo el origen. */
export function partesOrigenDestino(m: Movimiento): { origen: string; destino: string | null } {
  const aqui = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : m.ubicacion;
  switch (m.categoria) {
    case "interno":
      return { origen: nombreCortoSububicacion(m.sububicacion), destino: nombreCortoSububicacion(m.sububicacionDestino) };
    case "transferencia":
      return { origen: m.ubicacion, destino: m.ubicacionDestino ?? "—" };
    case "ajuste":
      return { origen: aqui, destino: null };
  }
  switch (m.motivo) {
    case "venta":
    case "cuarentena_liquidada":
      return { origen: aqui, destino: "Clienta" };
    case "anulacion_venta":
    case "devolucion":
      return { origen: "Clienta", destino: aqui };
    case "cambio":
      return m.delta > 0 ? { origen: "Clienta", destino: aqui } : { origen: aqui, destino: "Clienta" };
    case "recepcion":
      return { origen: m.lote?.proveedor ?? "Proveedor", destino: aqui };
    case "produccion":
      return { origen: "Producción", destino: aqui };
  }
  return { origen: aqui, destino: null };
}

export function textoComprobante(c: NonNullable<Movimiento["venta"]>["comprobante"]): string {
  if (!c) return "Sin comprobante";
  return `${ETIQUETA_TIPO[c.tipo] ?? c.tipo} ${c.numero}`;
}

/** La referencia al proceso en una línea: el comprobante de la venta, la guía
 *  y el proveedor de la recepción, el sistema/contado del conteo… Null si el
 *  proceso no dejó referencia (una carga de sistema, un traslado sin nota). */
export function textoReferencia(m: Movimiento): string | null {
  switch (m.motivo) {
    case "venta":
    case "cuarentena_liquidada":
      return m.venta ? textoComprobante(m.venta.comprobante) : null;
    case "recepcion": {
      const partes: string[] = [];
      if (m.lote?.guia) partes.push(`Guía ${m.lote.guia}`);
      if (m.compra?.documento) partes.push(`Factura ${m.compra.documento}`);
      if (m.lote?.proveedor) partes.push(m.lote.proveedor);
      return partes.length > 0 ? partes.join(" · ") : null;
    }
    case "devolucion":
      return m.devolucion
        ? `${ETIQUETA_ESTADO_DEVOLUCION[m.devolucion.estado ?? ""] ?? m.devolucion.estado ?? ""} · ${m.venta ? textoComprobante(m.venta.comprobante) : "Sin comprobante"}`
        : null;
    case "cambio":
      return m.venta ? `Venta original: ${textoComprobante(m.venta.comprobante)}` : null;
    case "conteo":
      return m.conteo && m.conteo.sistema !== null && m.conteo.contado !== null
        ? `Sistema ${m.conteo.sistema} → contado ${m.conteo.contado}`
        : null;
    case "transferencia":
      return m.transferencia?.nota ?? null;
    default:
      return m.nota;
  }
}

/** «Hoy», «Ayer», o «lunes 15 de septiembre». `fecha` viene en día de Lima;
 *  se arma con componentes locales para que un servidor en UTC no la corra un
 *  día hacia atrás (`new Date("2026-09-15")` sería medianoche UTC). */
export function etiquetaDia(fecha: string, hoyLima: string): string {
  if (fecha === hoyLima) return "Hoy";
  const [a, m, d] = fecha.split("-").map(Number);
  const [ha, hm, hd] = hoyLima.split("-").map(Number);
  const dia = new Date(a, m - 1, d);
  const hoy = new Date(ha, hm - 1, hd);
  if (hoy.getTime() - dia.getTime() === 86_400_000) return "Ayer";
  const texto = dia.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: a === ha ? undefined : "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** El día de hoy en Lima como `aaaa-mm-dd`, venga de donde venga el servidor. */
export function hoyEnLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** `aaaa-mm-dd` de hace N días en Lima. */
export function diasAtrasEnLima(dias: number): string {
  const [a, m, d] = hoyEnLima().split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d - dias));
  return fecha.toISOString().slice(0, 10);
}

export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function etiquetaEstadoComprobante(estado: EstadoComprobante): string {
  return ESTADO_ETIQUETA[estado] ?? estado;
}
