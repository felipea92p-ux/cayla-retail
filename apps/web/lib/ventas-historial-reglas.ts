import type { MetodoPago } from "@cayla-retail/shared";
import type { EstadoComprobante, TipoComprobante } from "./comprobantes-reglas";
import {
  filtrosDesdeParams as filtrosDeMovimientos,
  leerCursorMovimientos,
  restarDias,
  serializarCursorMovimientos,
  type CursorMovimientos,
  type PeriodoMovimientos,
} from "./movimientos-reglas";
import { NOMBRE_METODO, textoNumeroRecibo } from "./recibo-reglas";

// Historial de ventas (Ventas ▸ Historial, ADR-0144): reglas puras — lo que decide qué se
// pide, qué se muestra y qué se suma. Sin Supabase ni React: las importan la página, los
// componentes cliente y las pruebas. La lectura vive en `ventas-historial.ts`.
//
// La venta ya tenía un «historial mínimo» dentro de Cambios/Devoluciones (`ventas-v2.ts`), pensado
// para elegir una línea; esta es la pantalla completa que ese archivo y el ADR-0052 dejaron diferida.

/** Cuántas ventas trae cada página: caben sin un scroll eterno y el cursor sigue siendo barato. */
export const TAMANO_PAGINA = 20;

/** Hasta cuántas ventas se suman para los totales del rango. PostgREST corta en 1000 filas: pasado
 *  ese tope el total sería parcial sin avisar, así que la pantalla lo dice en vez de mostrarlo. */
export const TOPE_TOTALES = 1000;

export type EstadoFiltro = "todas" | "completada" | "anulada";
export type ComprobanteFiltro = "todos" | "con" | "sin";

/** Parámetros de la URL. `sede` y `vendedor` solo los honra un líder (una integrante ve su tienda: lo decide la RLS). */
export type ParamsHistorial = {
  rango?: string;
  desde?: string;
  hasta?: string;
  sede?: string;
  vendedor?: string;
  estado?: string;
  pago?: string;
  comp?: string;
  cursor?: string;
};

export type FiltrosHistorial = {
  periodo: PeriodoMovimientos;
  /** `aaaa-mm-dd` inclusivos, en día de Lima. */
  desde?: string;
  hasta?: string;
  sedeId?: string;
  vendedorId?: string;
  estado: EstadoFiltro;
  pago?: MetodoPago;
  /** «con» / «sin» boleta o factura. Una nota de crédito no cuenta como comprobante de la venta. */
  comprobante: ComprobanteFiltro;
};

// El cursor tiene la misma forma que el de Movimientos (`created_at` + `id`): no hay una fecha de
// negocio distinta de la de la venta.
export type CursorVentas = CursorMovimientos;
export const leerCursorVentas = leerCursorMovimientos;
export const serializarCursorVentas = serializarCursorMovimientos;

const METODOS = Object.keys(NOMBRE_METODO) as MetodoPago[];
const esUuid = (v?: string): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);

/** Traduce la URL a filtros, descartando cualquier valor que no sea válido. El período (7/30/90
 *  días, fechas propias o todo) se resuelve con la misma regla que Movimientos. */
export function filtrosDesdeParams(
  p: ParamsHistorial,
  ctx: { esLider: boolean; sedesIds: string[]; hoy?: string }
): FiltrosHistorial {
  const { periodo, desde, hasta } = filtrosDeMovimientos({ rango: p.rango, desde: p.desde, hasta: p.hasta }, { hoy: ctx.hoy });
  return {
    periodo,
    desde,
    hasta,
    sedeId: ctx.esLider && p.sede && ctx.sedesIds.includes(p.sede) ? p.sede : undefined,
    vendedorId: ctx.esLider && esUuid(p.vendedor) ? p.vendedor : undefined,
    estado: p.estado === "completada" || p.estado === "anulada" ? p.estado : "todas",
    pago: METODOS.find((m) => m === p.pago),
    comprobante: p.comp === "con" || p.comp === "sin" ? p.comp : "todos",
  };
}

/** Lima no tiene horario de verano: siempre UTC−5. */
const inicioDelDiaLimaISO = (dia: string) => new Date(`${dia}T00:00:00-05:00`).toISOString();

/** `desde`/`hasta` son días de Lima INCLUSIVOS; la base recibe un intervalo `[desde, hasta)` en UTC.
 *  Sin esto una venta de las 9 p. m. de Lima (ya «mañana» en UTC) caería en el día equivocado. */
export function limitesUTC(desde?: string, hasta?: string): { desdeISO?: string; hastaISO?: string } {
  return {
    desdeISO: desde ? inicioDelDiaLimaISO(desde) : undefined,
    hastaISO: hasta ? inicioDelDiaLimaISO(restarDias(hasta, -1)) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Lo que devuelve la base (PostgREST) y cómo se lee cada venta.
// ---------------------------------------------------------------------------

type Numero = number | string;

export type ItemCrudo = {
  cantidad: number;
  precio_unitario: Numero;
  descuento_unitario: Numero;
  /** Columna generada: la base la calcula (precio − descuento) × cantidad. */
  subtotal: Numero | null;
  variante?: {
    color_codigo?: string | null;
    talla: { valor: string } | null;
    color: { nombre: string; hex?: string | null } | null;
    producto: { referencia: string; producto_fotos?: { url: string; color_codigo: string | null }[] | null } | null;
  } | null;
};

export type VentaCruda = {
  id: string;
  created_at: string;
  estado: string;
  nota: string | null;
  usuario_id: string | null;
  ubicacion: { id: string; nombre: string } | null;
  cliente: { nombre: string } | null;
  venta_items: ItemCrudo[];
  venta_pagos: { metodo: string; monto: Numero }[];
  comprobantes: { tipo: string; serie: string; numero: number; estado: string; created_at: string }[];
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que se cobró por una línea: el `subtotal` que guarda la base o, si por algo falta, (precio − descuento) × cantidad. */
export function subtotalDeItem(i: Pick<ItemCrudo, "cantidad" | "precio_unitario" | "descuento_unitario" | "subtotal">): number {
  if (i.subtotal !== null && i.subtotal !== undefined) return Number(i.subtotal);
  return redondear2((Number(i.precio_unitario) - Number(i.descuento_unitario)) * i.cantidad);
}

export const totalDeVenta = (items: ItemCrudo[]): number => redondear2(items.reduce((s, i) => s + subtotalDeItem(i), 0));
export const unidadesDeVenta = (items: ItemCrudo[]): number => items.reduce((s, i) => s + i.cantidad, 0);

export type PrendaDeVenta = { referencia: string; detalle: string; cantidad: number; fotoUrl: string | null; colorHex: string | null };

/** Cada línea de la venta con lo que hace falta para dibujarla: nombre, «talla · color», la foto del COLOR
 *  vendido (mismo criterio que el catálogo y Cambios: `producto_fotos.color_codigo`) y el tono de ese color,
 *  que siempre existe aunque la prenda no tenga foto todavía. */
export function piezasDeVenta(items: ItemCrudo[]): PrendaDeVenta[] {
  return items.map((i) => {
    const v = i.variante;
    return {
      referencia: v?.producto?.referencia ?? "Prenda",
      detalle: [v?.talla?.valor, v?.color?.nombre].filter(Boolean).join(" · "),
      cantidad: i.cantidad,
      fotoUrl: v?.color_codigo ? (v.producto?.producto_fotos?.find((f) => f.color_codigo === v.color_codigo)?.url ?? null) : null,
      colorHex: v?.color?.hex ?? null,
    };
  });
}

/** El título de una venta: solo los nombres —«Blusa Emma, Pantalón Carla y 1 más»—. La talla y el color van debajo. */
export function titulosDePrendas(piezas: PrendaDeVenta[], max = 2): string {
  if (piezas.length === 0) return "—";
  const nombres = piezas.map((p) => p.referencia);
  return nombres.length <= max ? nombres.join(", ") : `${nombres.slice(0, max).join(", ")} y ${nombres.length - max} más`;
}

/** Lo que va bajo el título: con una sola línea, su «talla · color» (y ×N si son varias unidades); con más, cuántas prendas fueron. */
export function subtituloDePrendas(piezas: PrendaDeVenta[], unidades: number): string {
  if (piezas.length === 1) return `${piezas[0].detalle}${piezas[0].cantidad > 1 ? ` ×${piezas[0].cantidad}` : ""}`.trim();
  return `${unidades} ${unidades === 1 ? "prenda" : "prendas"}`;
}

/** «Blusa Emma · M · Negro ×2, Pantalón Carla · 30 · Azul y 1 más» — lo justo para reconocer la venta en una fila. */
export function textoPrendas(items: ItemCrudo[], max = 2): string {
  const partes = items.map((i) => {
    const nombre = i.variante?.producto?.referencia ?? "Prenda";
    const detalle = [i.variante?.talla?.valor, i.variante?.color?.nombre].filter(Boolean).join(" · ");
    return `${nombre}${detalle ? ` · ${detalle}` : ""}${i.cantidad > 1 ? ` ×${i.cantidad}` : ""}`;
  });
  return partes.length <= max ? partes.join(", ") : `${partes.slice(0, max).join(", ")} y ${partes.length - max} más`;
}

/** «Efectivo + Yape»: cada método una vez, en el orden en que se cobró. */
export function textoMetodos(pagos: { metodo: string }[]): string {
  return [...new Set(pagos.map((p) => p.metodo))].map((m) => NOMBRE_METODO[m as MetodoPago] ?? m).join(" + ");
}

export type ComprobanteVenta = { tipo: TipoComprobante; numero: string; estado: EstadoComprobante };

const ESTADOS_MUERTOS = ["anulado", "rechazado", "no_emitido"];

/** El comprobante que ampara la venta: solo boleta o factura (una nota de crédito corrige, no ampara). Si hubo
 *  más de uno, el más reciente que siga vivo; si todos murieron, el más reciente — así se ve por qué. */
export function elegirComprobante(cs: VentaCruda["comprobantes"]): ComprobanteVenta | null {
  const propios = cs.filter((c) => c.tipo === "boleta" || c.tipo === "factura").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const c = propios.find((x) => !ESTADOS_MUERTOS.includes(x.estado)) ?? propios[0];
  return c ? { tipo: c.tipo as TipoComprobante, numero: textoNumeroRecibo(c), estado: c.estado as EstadoComprobante } : null;
}

export type FilaHistorial = {
  id: string;
  creadoEn: string;
  /** Día de Lima, `aaaa-mm-dd`. */
  fecha: string;
  /** Hora de Lima, `hh:mm`. */
  hora: string;
  ubicacionId: string;
  ubicacion: string;
  vendedor: string | null;
  clienta: string | null;
  prendas: string;
  piezas: PrendaDeVenta[];
  unidades: number;
  total: number;
  pagos: string;
  comprobante: ComprobanteVenta | null;
  anulada: boolean;
  nota: string | null;
};

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
const FORMATO_HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** El día de Lima de un instante, `aaaa-mm-dd`. */
export const diaDeLima = (iso: string): string => FORMATO_DIA.format(new Date(iso));

export function aFila(v: VentaCruda, nombres: ReadonlyMap<string, string>): FilaHistorial {
  const instante = new Date(v.created_at);
  return {
    id: v.id,
    creadoEn: v.created_at,
    fecha: diaDeLima(v.created_at),
    hora: FORMATO_HORA.format(instante),
    ubicacionId: v.ubicacion?.id ?? "",
    ubicacion: v.ubicacion?.nombre ?? "—",
    vendedor: v.usuario_id ? (nombres.get(v.usuario_id) ?? null) : null,
    clienta: v.cliente?.nombre ?? null,
    prendas: textoPrendas(v.venta_items),
    piezas: piezasDeVenta(v.venta_items),
    unidades: unidadesDeVenta(v.venta_items),
    total: totalDeVenta(v.venta_items),
    pagos: textoMetodos(v.venta_pagos),
    comprobante: elegirComprobante(v.comprobantes),
    anulada: v.estado === "anulada",
    nota: v.nota,
  };
}

export type ResumenHistorial = { ventas: number; anuladas: number; unidades: number; total: number; ticket: number };

/** Los totales del rango. Una venta anulada ya devolvió sus prendas al stock y su dinero: se cuenta
 *  aparte y NUNCA suma al vendido ni al ticket promedio. */
export function resumir(ventas: { anulada: boolean; total: number; unidades: number }[]): ResumenHistorial {
  let completadas = 0;
  let anuladas = 0;
  let unidades = 0;
  let total = 0;
  for (const v of ventas) {
    if (v.anulada) {
      anuladas++;
      continue;
    }
    completadas++;
    unidades += v.unidades;
    total += v.total;
  }
  total = redondear2(total);
  return { ventas: completadas, anuladas, unidades, total, ticket: completadas ? redondear2(total / completadas) : 0 };
}

export type DiaResumen = { fecha: string; ventas: number; total: number };

/** Hasta cuántos días se rellena la serie con ceros; pasado eso queda solo con los días que vendieron. */
const MAX_DIAS_SERIE = 400;

const aMilisegundos = (dia: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

/** Lo vendido por día de Lima, del más viejo al más nuevo: alimenta el trazo del período y el total de
 *  cada día en la lista. Cuentan solo las ventas completadas. Los días sin ventas entran con cero (un
 *  trazo sin ellos mentiría sobre cuánto duró la calma). El rango va de `desde` (o la primera venta) a
 *  `hasta` (o hoy). */
export function serieDiaria(
  ventas: { anulada: boolean; total: number; fecha: string }[],
  rango: { desde?: string; hasta?: string; hoy: string }
): DiaResumen[] {
  const porFecha = new Map<string, DiaResumen>();
  for (const v of ventas) {
    if (v.anulada) continue;
    const dia = porFecha.get(v.fecha) ?? { fecha: v.fecha, ventas: 0, total: 0 };
    dia.ventas++;
    dia.total = redondear2(dia.total + v.total);
    porFecha.set(v.fecha, dia);
  }
  const conVentas = [...porFecha.keys()].sort();
  const inicio = rango.desde ?? conVentas[0];
  if (!inicio) return [];
  const fin = rango.hasta ?? rango.hoy;
  const dias = Math.round((aMilisegundos(fin) - aMilisegundos(inicio)) / 86_400_000) + 1;
  if (dias < 1 || dias > MAX_DIAS_SERIE) return conVentas.map((f) => porFecha.get(f)!);
  return Array.from({ length: dias }, (_, i) => {
    const fecha = restarDias(inicio, -i);
    return porFecha.get(fecha) ?? { fecha, ventas: 0, total: 0 };
  });
}

export type MetodoResumen = { metodo: string; monto: number };

/** Cuánto se cobró por cada forma de pago en las ventas completadas, de mayor a menor. */
export function mezclaDePagos(ventas: { anulada: boolean; pagos: { metodo: string; monto: Numero }[] }[]): MetodoResumen[] {
  const porMetodo = new Map<string, number>();
  for (const v of ventas) {
    if (v.anulada) continue;
    for (const p of v.pagos) porMetodo.set(p.metodo, redondear2((porMetodo.get(p.metodo) ?? 0) + Number(p.monto)));
  }
  return [...porMetodo].filter(([, monto]) => monto > 0).map(([metodo, monto]) => ({ metodo, monto })).sort((a, b) => b.monto - a.monto);
}

export type DiaDeVentas = { fecha: string; filas: FilaHistorial[] };

/** Agrupa por día de Lima. Las filas llegan ordenadas de más nueva a más vieja, así que cada día es un tramo continuo. */
export function agruparPorDia(filas: FilaHistorial[]): DiaDeVentas[] {
  const dias: DiaDeVentas[] = [];
  for (const f of filas) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === f.fecha) ultimo.filas.push(f);
    else dias.push({ fecha: f.fecha, filas: [f] });
  }
  return dias;
}

export type Trazo = {
  /** Trazo suave que une el total de cada día (curva de Bézier con tangentes horizontales: no se pasa de los puntos). */
  linea: string;
  /** La misma curva cerrada contra la base, para el degradado. */
  area: string;
  /** El día que más vendió (con su posición en el dibujo), o null si no hubo ventas. */
  pico: { x: number; y: number; indice: number } | null;
  ultimo: { x: number; y: number } | null;
};

const redondear1 = (n: number) => Math.round(n * 10) / 10;

/** Convierte lo vendido por día en el dibujo del período. El eje Y va de 0 al mejor día; sin ventas la línea corre pegada a la base. */
export function trazoDeVentas(
  dias: DiaResumen[],
  { ancho, alto, margen }: { ancho: number; alto: number; margen: { x: number; arriba: number; abajo: number } }
): Trazo {
  if (dias.length === 0) return { linea: "", area: "", pico: null, ultimo: null };
  const max = Math.max(...dias.map((d) => d.total));
  const base = alto - margen.abajo;
  const util = alto - margen.arriba - margen.abajo;
  const x = (i: number) => (dias.length === 1 ? ancho / 2 : margen.x + (i * (ancho - 2 * margen.x)) / (dias.length - 1));
  const y = (v: number) => (max > 0 ? base - (v / max) * util : base);
  const pts = dias.map((d, i) => ({ x: redondear1(x(i)), y: redondear1(y(d.total)) }));
  let linea = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const medio = redondear1((pts[i - 1].x + pts[i].x) / 2);
    linea += `C${medio} ${pts[i - 1].y} ${medio} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
  }
  const ultimo = pts[pts.length - 1];
  const indice = max > 0 ? dias.findIndex((d) => d.total === max) : -1;
  return {
    linea,
    area: `${linea}L${ultimo.x} ${base}L${pts[0].x} ${base}Z`,
    pico: indice >= 0 ? { ...pts[indice], indice } : null,
    ultimo,
  };
}
