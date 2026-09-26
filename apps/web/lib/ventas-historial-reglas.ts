import type { MetodoPago } from "@cayla-retail/shared";
import type { EstadoComprobante, TipoComprobante } from "./comprobantes-reglas";
import {
  filtrosDesdeParams as filtrosDeMovimientos,
  textoPeriodo as textoPeriodoMovimientos,
  leerCursorMovimientos,
  restarDias,
  serializarCursorMovimientos,
  type CursorMovimientos,
  type PeriodoMovimientos,
} from "./movimientos-reglas";
import { NOMBRE_METODO, textoNumeroRecibo } from "./recibo-reglas";

// Historial de ventas (Ventas ▸ Historial, ADR-0147): reglas puras — lo que decide qué se
// pide, qué se muestra y qué se suma. Sin Supabase ni React: las importan la página, los
// componentes cliente y las pruebas. La lectura vive en `ventas-historial.ts`.
//
// La venta ya tenía un «historial mínimo» dentro de Cambios/Devoluciones (`ventas-v2.ts`), pensado
// para elegir una línea; esta es la pantalla completa que ese archivo y el ADR-0052 dejaron diferida.

/** Cuántas ventas trae cada página: caben sin un scroll eterno y el cursor sigue siendo barato. */
export const TAMANO_PAGINA = 20;

/** Hasta cuántas ventas se suman para los totales del rango. PostgREST corta en 1000 filas SIN error:
 *  pasado ese tope el total sería parcial sin avisar, así que la pantalla lo dice en vez de mostrarlo.
 *  Es 999 y no 1000 porque «hay más» se detecta pidiendo UNA fila de más (`limit(TOPE_TOTALES + 1)`), y
 *  esa fila tiene que caber dentro del corte: con 1000, la 1001 nunca llegaba y un mes de 2.300 ventas
 *  mostraba como completos los totales de las 1000 más recientes (2026-09-23). */
export const TOPE_TOTALES = 999;

export type EstadoFiltro = "todas" | "completada" | "anulada";
/** «por_enviar» = su comprobante espera a SUNAT (pendiente, en reintento o rechazado, como la cola de Comprobantes);
 *  «factura» = se emitió factura. Los dos llegaron con los atajos (2026-09-26). */
export type ComprobanteFiltro = "todos" | "con" | "sin" | "por_enviar" | "factura";
/** El período de Historial: los de Movimientos más «hoy» (el atajo que más usa el mostrador). */
export type PeriodoHistorial = PeriodoMovimientos | "hoy";
/** Los pagos que se filtran: los del mostrador más el «anticipo» de un apartado entregado (ADR-0196). */
export type MetodoFiltro = MetodoPago | "anticipo";

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
  /** «1» incluye los datos de prueba (D-54) en la lista; ausente o cualquier otro valor los deja fuera. */
  prueba?: string;
  /** Lo escrito en el buscador (comprobante, DNI o RUC, clienta, prenda, código o nº de operación). Busca en TODAS las fechas. */
  q?: string;
  /** «1»: solo las ventas de quien mira (atajo «Mis ventas»). Sirve a cualquiera, no solo al líder. */
  mias?: string;
  /** «1»: solo las ventas que tuvieron un cambio o una devolución. */
  posventa?: string;
  /** «1»: solo las ventas con una clienta anotada. */
  clienta?: string;
};

export type FiltrosHistorial = {
  periodo: PeriodoHistorial;
  /** `aaaa-mm-dd` inclusivos, en día de Lima. */
  desde?: string;
  hasta?: string;
  sedeId?: string;
  /** La tienda la eligió el líder en el filtro (y no es la de la cabecera por defecto). El buscador solo se limita a una
   *  tienda si fue elegida así: buscar a una clienta no debe fallar porque compró en otra sede. */
  sedeExplicita: boolean;
  vendedorId?: string;
  estado: EstadoFiltro;
  pago?: MetodoFiltro;
  /** «con» / «sin» boleta o factura. Una nota de crédito no cuenta como comprobante de la venta. */
  comprobante: ComprobanteFiltro;
  /** Ventas marcadas `es_prueba` (D-54, ADR-0159): fuera por defecto, un toggle las trae de vuelta. */
  incluirPrueba: boolean;
  /** El texto del buscador, ya recortado. Con él la lista ignora el período: la clienta vuelve semanas después. */
  busqueda?: string;
  /** El atajo «Mis ventas» está puesto (`vendedorId` es entonces quien mira). */
  mias: boolean;
  posventa: boolean;
  conClienta: boolean;
};

// El cursor tiene la misma forma que el de Movimientos (`created_at` + `id`): no hay una fecha de
// negocio distinta de la de la venta.
export type CursorVentas = CursorMovimientos;
export const leerCursorVentas = leerCursorMovimientos;
export const serializarCursorVentas = serializarCursorMovimientos;

const METODOS: MetodoFiltro[] = [...(Object.keys(NOMBRE_METODO) as MetodoPago[]), "anticipo"];
const COMPROBANTES: ComprobanteFiltro[] = ["con", "sin", "por_enviar", "factura"];

/** El nombre de cada forma de pago en Historial: las del mostrador y el anticipo de un apartado. */
export const NOMBRE_METODO_HISTORIAL: Record<string, string> = { ...NOMBRE_METODO, anticipo: "Anticipo" };

/** Los estados de un comprobante que esperan a SUNAT: la misma cola que «Por reintentar» (`resumenPorEnviar`). */
export const ESTADOS_POR_ENVIAR = ["pendiente", "pendiente_reintento", "rechazado"] as const;
const esUuid = (v?: string): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);

/** Traduce la URL a filtros, descartando cualquier valor que no sea válido. El período (7/30/90
 *  días, fechas propias o todo) se resuelve con la misma regla que Movimientos. */
export function filtrosDesdeParams(
  p: ParamsHistorial,
  ctx: { esLider: boolean; sedesIds: string[]; hoy?: string; personaId?: string; sedePorDefecto?: string }
): FiltrosHistorial {
  const hoy = ctx.hoy ?? hoyLima();
  const periodoResuelto =
    p.rango === "hoy" && !p.desde && !p.hasta
      ? { periodo: "hoy" as const, desde: hoy, hasta: hoy }
      : filtrosDeMovimientos({ rango: p.rango, desde: p.desde, hasta: p.hasta }, { hoy });
  // «Mis ventas» gana sobre el filtro de vendedor: es quien mira, así que no hace falta ser líder.
  const mias = p.mias === "1" && esUuid(ctx.personaId);
  const busqueda = p.q?.trim().slice(0, 60) || undefined;
  // La tienda del líder: la que eligió en el filtro; «todas» a propósito; o, sin nada en la URL, la sede elegida arriba en
  // la cabecera (captura del 2026-09-26: decía «Todas las tiendas» con «Tienda TRU» elegida arriba).
  const sedeExplicita = !!p.sede && p.sede !== "todas" && ctx.sedesIds.includes(p.sede);
  const sedePorDefecto = !p.sede && ctx.sedePorDefecto && ctx.sedesIds.includes(ctx.sedePorDefecto) ? ctx.sedePorDefecto : undefined;
  return {
    periodo: periodoResuelto.periodo,
    desde: periodoResuelto.desde,
    hasta: periodoResuelto.hasta,
    sedeId: !ctx.esLider ? undefined : sedeExplicita ? p.sede : sedePorDefecto,
    sedeExplicita: ctx.esLider && sedeExplicita,
    vendedorId: mias ? ctx.personaId : ctx.esLider && esUuid(p.vendedor) ? p.vendedor : undefined,
    estado: p.estado === "completada" || p.estado === "anulada" ? p.estado : "todas",
    pago: METODOS.find((m) => m === p.pago),
    comprobante: COMPROBANTES.find((c) => c === p.comp) ?? "todos",
    incluirPrueba: p.prueba === "1",
    busqueda,
    mias,
    posventa: p.posventa === "1",
    conClienta: p.clienta === "1",
  };
}

const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

/** El período en palabras. «Hoy» no existe en Movimientos: se dice aquí. */
export function textoPeriodoHistorial(periodo: PeriodoHistorial, desde?: string, hasta?: string): string {
  return periodo === "hoy" ? "Hoy" : textoPeriodoMovimientos(periodo, desde, hasta);
}

/** `fn_totales_historial_ventas` (ADR-0191) solo conoce tienda, vendedor, estado, pago y «con / sin» comprobante. Con
 *  cualquier otro filtro (los de los atajos nuevos) los totales se calculan fila por fila con los MISMOS filtros que la
 *  lista, para que la cifra nunca diga otra cosa que la lista. */
export function totalesEnLaBase(f: FiltrosHistorial): boolean {
  return (f.comprobante === "todos" || f.comprobante === "con" || f.comprobante === "sin") && !f.posventa && !f.conClienta;
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
  /** Ausente en las lecturas de solo importes (totales). */
  id?: string;
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
  /** Los cambios hechos sobre esta línea (`cambios.venta_item_id`). */
  cambios?: { created_at: string }[] | null;
};

export type VentaCruda = {
  id: string;
  created_at: string;
  estado: string;
  nota: string | null;
  es_prueba?: boolean;
  usuario_id: string | null;
  /** Quién atendió (`ventas.asesora_id`); ausente/null en las ventas anteriores a la fila «Atendió». */
  asesora_id?: string | null;
  ubicacion: { id: string; nombre: string } | null;
  cliente_id?: string | null;
  anulado_en?: string | null;
  cliente: { nombre: string } | null;
  venta_items: ItemCrudo[];
  /** `referencia`: el nº de operación de Yape, Plin o transferencia; ausente mientras la columna no esté en la base. */
  venta_pagos: { metodo: string; monto: Numero; referencia?: string | null }[];
  comprobantes: { tipo: string; serie: string; numero: number; estado: string; created_at: string; enviado_at?: string | null }[];
  /** Las devoluciones de la venta (`devoluciones.venta_id`); las rechazadas no movieron nada y no se marcan. */
  devoluciones?: { estado: string; created_at: string }[] | null;
  /** El apartado (ADR-0196, `separaciones.venta_id`) que se entregó con esta venta. */
  separaciones?: { codigo: string; created_at: string }[] | null;
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
  // Dos líneas de la misma prenda, talla y color (se escaneó dos veces) son UNA pieza con cantidad 2: se dibuja un solo
  // mosaico con ×2 y no dos iguales encimados (captura del 2026-09-26).
  const piezas: PrendaDeVenta[] = [];
  for (const i of items) {
    const v = i.variante;
    const pieza = {
      referencia: v?.producto?.referencia ?? "Prenda",
      detalle: [v?.talla?.valor, v?.color?.nombre].filter(Boolean).join(" · "),
      cantidad: i.cantidad,
      fotoUrl: v?.color_codigo ? (v.producto?.producto_fotos?.find((f) => f.color_codigo === v.color_codigo)?.url ?? null) : null,
      colorHex: v?.color?.hex ?? null,
    };
    const igual = piezas.find((p) => p.referencia === pieza.referencia && p.detalle === pieza.detalle);
    if (igual) igual.cantidad += pieza.cantidad;
    else piezas.push(pieza);
  }
  return piezas;
}

/** El título de una venta: solo los nombres, cada uno una vez y con ×N si se llevó más de una —«Test de Produto 2 ×2»,
 *  no «Test de Produto 2, Test de Produto 2»—; más de dos se resumen: «Blusa Emma, Pantalón Carla y 1 más». La talla y el
 *  color van debajo. */
export function titulosDePrendas(piezas: PrendaDeVenta[], max = 2): string {
  if (piezas.length === 0) return "—";
  const unidades = new Map<string, number>();
  for (const p of piezas) unidades.set(p.referencia, (unidades.get(p.referencia) ?? 0) + p.cantidad);
  const nombres = [...unidades].map(([nombre, n]) => (n > 1 ? `${nombre} ×${n}` : nombre));
  return nombres.length <= max ? nombres.join(", ") : `${nombres.slice(0, max).join(", ")} y ${nombres.length - max} más`;
}

/** Lo que va bajo el título: con una sola pieza, su «talla · color» (el ×N ya va en el título); con más, cuántas prendas fueron. */
export function subtituloDePrendas(piezas: PrendaDeVenta[], unidades: number): string {
  if (piezas.length === 1) return piezas[0].detalle;
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
  return [...new Set(pagos.map((p) => p.metodo))].map((m) => NOMBRE_METODO_HISTORIAL[m] ?? m).join(" + ");
}

export type ComprobanteVenta = {
  tipo: TipoComprobante;
  numero: string;
  estado: EstadoComprobante;
  /** Cuándo se emitió y cuándo se envió a SUNAT (para el recorrido de la venta). */
  emitidoEn: string;
  enviadoEn: string | null;
};

const ESTADOS_MUERTOS = ["anulado", "rechazado", "no_emitido"];

/** El documento de la venta: boleta, factura o nota de venta (ADR-0164; una nota de crédito corrige, no ampara). Si hubo
 *  más de uno, el más reciente que siga vivo; si todos murieron, el más reciente — así se ve por qué. */
export function elegirComprobante(cs: VentaCruda["comprobantes"]): ComprobanteVenta | null {
  const propios = cs.filter((c) => c.tipo === "boleta" || c.tipo === "factura" || c.tipo === "nota_venta").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const c = propios.find((x) => !ESTADOS_MUERTOS.includes(x.estado)) ?? propios[0];
  return c
    ? { tipo: c.tipo as TipoComprobante, numero: textoNumeroRecibo(c), estado: c.estado as EstadoComprobante, emitidoEn: c.created_at, enviadoEn: c.enviado_at ?? null }
    : null;
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
  /** Dato ficticio de prueba (D-54, ADR-0159): solo llega a esta fila con el toggle «Ver datos de prueba». */
  esPrueba: boolean;
  /** Cuándo se anuló (para el recorrido); null si sigue vigente o si la base no lo trajo. */
  anuladaEn: string | null;
  /** Las líneas de la venta, para abrir Cambios o Devoluciones directo sobre una prenda. */
  ventaItemIds: string[];
  /** Lo que pasó después de venderla: cambios y devoluciones, del más viejo al más nuevo. */
  posventa: MarcaPosventa[];
  /** El apartado que terminó en esta venta (ADR-0196), o null. */
  apartado: { codigo: string; creadoEn: string } | null;
  /** Se cobró con el anticipo de un apartado (aunque sea un apartado viejo, sin código). */
  conAnticipo: boolean;
  /** Los nº de operación anotados al cobrar (Yape, Plin, transferencia). */
  operaciones: string[];
};

export type MarcaPosventa = { tipo: "cambio" | "devolucion"; fecha: string; pendiente: boolean };

/** Los cambios de cada línea y las devoluciones de la venta, en orden. Una devolución rechazada no movió nada: no se marca. */
export function posventaDeVenta(v: Pick<VentaCruda, "venta_items" | "devoluciones">): MarcaPosventa[] {
  const cambios = v.venta_items.flatMap((i) => (i.cambios ?? []).map((c) => ({ tipo: "cambio" as const, fecha: c.created_at, pendiente: false })));
  const devoluciones = (v.devoluciones ?? [])
    .filter((d) => d.estado !== "rechazada")
    .map((d) => ({ tipo: "devolucion" as const, fecha: d.created_at, pendiente: d.estado === "pendiente" }));
  return [...cambios, ...devoluciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
const FORMATO_HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** El día de Lima de un instante, `aaaa-mm-dd`. */
export const diaDeLima = (iso: string): string => FORMATO_DIA.format(new Date(iso));

/** Quién vendió: quien atendió (`asesora_id`) y, si no se eligió a nadie, la sesión que cobró (`usuario_id`). */
export const quienVendio = (v: { asesora_id?: string | null; usuario_id: string | null }): string | null => v.asesora_id ?? v.usuario_id;

function nombreDeQuienVendio(v: VentaCruda, nombres: ReadonlyMap<string, string>): string | null {
  const id = quienVendio(v);
  return id ? (nombres.get(id) ?? null) : null;
}

export function aFila(v: VentaCruda, nombres: ReadonlyMap<string, string>): FilaHistorial {
  const instante = new Date(v.created_at);
  return {
    id: v.id,
    creadoEn: v.created_at,
    fecha: diaDeLima(v.created_at),
    hora: FORMATO_HORA.format(instante),
    ubicacionId: v.ubicacion?.id ?? "",
    ubicacion: v.ubicacion?.nombre ?? "—",
    vendedor: nombreDeQuienVendio(v, nombres),
    clienta: v.cliente?.nombre ?? null,
    prendas: textoPrendas(v.venta_items),
    piezas: piezasDeVenta(v.venta_items),
    unidades: unidadesDeVenta(v.venta_items),
    total: totalDeVenta(v.venta_items),
    pagos: textoMetodos(v.venta_pagos),
    comprobante: elegirComprobante(v.comprobantes),
    anulada: v.estado === "anulada",
    nota: v.nota,
    esPrueba: v.es_prueba === true,
    anuladaEn: v.anulado_en ?? null,
    ventaItemIds: v.venta_items.map((i) => i.id).filter((id): id is string => !!id),
    posventa: posventaDeVenta(v),
    apartado: v.separaciones?.[0] ? { codigo: v.separaciones[0].codigo, creadoEn: v.separaciones[0].created_at } : null,
    conAnticipo: v.venta_pagos.some((p) => p.metodo === "anticipo"),
    operaciones: [...new Set(v.venta_pagos.map((p) => p.referencia?.trim()).filter((r): r is string => !!r))],
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
  return rellenarSerie(porFecha, rango);
}

/** Los días que vendieron, completados con ceros de `desde` (o el primero que vendió) a `hasta` (o hoy). */
function rellenarSerie(porFecha: ReadonlyMap<string, DiaResumen>, rango: { desde?: string; hasta?: string; hoy: string }): DiaResumen[] {
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

/** Lo que devuelve `fn_totales_historial_ventas` (ADR-0191): las mismas sumas de `resumir`, `serieDiaria` y
 *  `mezclaDePagos`, hechas en la base sobre TODO el rango (sin el tope de 1.000 filas). Los montos llegan como
 *  número o texto según cómo los serialice PostgREST. */
export type TotalesDeLaBase = {
  ventas: number;
  anuladas: number;
  unidades: number;
  total: Numero;
  por_dia: { fecha: string; ventas: number; total: Numero }[];
  por_metodo: { metodo: string; monto: Numero }[];
};

/** Traduce los totales de la base a lo que dibuja la pantalla, con las MISMAS reglas que el cálculo fila por fila:
 *  ticket = total ÷ ventas a céntimos, días sin venta rellenados con cero y formas de pago con monto, de mayor a menor. */
export function totalesDesdeLaBase(
  t: TotalesDeLaBase,
  rango: { desde?: string; hasta?: string; hoy: string }
): { resumen: ResumenHistorial; porDia: DiaResumen[]; porMetodo: MetodoResumen[] } {
  const total = redondear2(Number(t.total));
  const ventas = Number(t.ventas);
  const porFecha = new Map(t.por_dia.map((d) => [d.fecha, { fecha: d.fecha, ventas: Number(d.ventas), total: redondear2(Number(d.total)) }]));
  return {
    resumen: { ventas, anuladas: Number(t.anuladas), unidades: Number(t.unidades), total, ticket: ventas ? redondear2(total / ventas) : 0 },
    porDia: rellenarSerie(porFecha, rango),
    porMetodo: t.por_metodo
      .map((m) => ({ metodo: m.metodo, monto: redondear2(Number(m.monto)) }))
      .filter((m) => m.monto > 0)
      .sort((a, b) => b.monto - a.monto),
  };
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

/** El lunes de la semana de un día `aaaa-mm-dd` (las semanas empiezan en lunes). */
function lunesDe(dia: string): string {
  const desdeLunes = (new Date(aMilisegundos(dia)).getUTCDay() + 6) % 7;
  return restarDias(dia, desdeLunes);
}

/** Junta los días en semanas (de lunes a domingo) para que un rango largo no dibuje cientos de hilos. Sirve también con una serie
 *  sin rellenar: agrupa por fecha, no por posición. */
export function agruparEnSemanas(dias: DiaResumen[]): DiaResumen[] {
  const semanas = new Map<string, DiaResumen>();
  for (const d of dias) {
    const lunes = lunesDe(d.fecha);
    const semana = semanas.get(lunes) ?? { fecha: lunes, ventas: 0, total: 0 };
    semana.ventas += d.ventas;
    semana.total = redondear2(semana.total + d.total);
    semanas.set(lunes, semana);
  }
  return [...semanas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Media móvil centrada: cada punto es el promedio de sus vecinos dentro de la ventana (en las puntas, de los que haya). */
export function mediaMovil(valores: number[], ventana: number): number[] {
  const medio = Math.floor(ventana / 2);
  return valores.map((_, i) => {
    const tramo = valores.slice(Math.max(0, i - medio), Math.min(valores.length, i + medio + 1));
    return tramo.reduce((s, v) => s + v, 0) / tramo.length;
  });
}

/** Cuánto se suaviza el hilo de tendencia según cuántos puntos hay: con pocos, nada (suavizar sería borrar el dato). */
export const ventanaDeSuavizado = (n: number): number => (n >= 21 ? 7 : n >= 10 ? 3 : 1);

export type Pulso = {
  /** La línea de suelo, en el dibujo. */
  base: number;
  /** Un hilo vertical por día: dónde va (x), hasta dónde sube (y) y cuánto mide (alto). */
  barras: { x: number; y: number; alto: number }[];
  anchoBarra: number;
  /** La tendencia (media móvil) como una curva suave que cruza los hilos. */
  hilo: string;
  /** Altura del promedio diario, para la línea punteada; null si no hubo ventas. */
  promedioY: number | null;
  /** El día que más vendió (con su posición), o null si no hubo ventas. */
  pico: { x: number; y: number; indice: number } | null;
};

const redondear1 = (n: number) => Math.round(n * 10) / 10;

/** La geometría del gráfico del período: cada día es un hilo vertical —la urdimbre— y una curva de tendencia lo cruza —la trama—.
 *  El eje va de 0 al mejor día; sin ventas todo queda pegado al suelo. */
export function pulsoDeVentas(
  dias: DiaResumen[],
  { ancho, alto, margen }: { ancho: number; alto: number; margen: { x: number; arriba: number; abajo: number } }
): Pulso {
  const base = alto - margen.abajo;
  if (dias.length === 0) return { base, barras: [], anchoBarra: 0, hilo: "", promedioY: null, pico: null };
  const totales = dias.map((d) => d.total);
  const max = Math.max(...totales);
  const util = alto - margen.arriba - margen.abajo;
  const paso = (ancho - 2 * margen.x) / dias.length;
  const x = (i: number) => redondear1(margen.x + paso * (i + 0.5));
  const y = (v: number) => redondear1(max > 0 ? base - (v / max) * util : base);
  const barras = totales.map((t, i) => ({ x: x(i), y: y(t), alto: redondear1(base - y(t)) }));
  const tendencia = mediaMovil(totales, ventanaDeSuavizado(dias.length)).map((v, i) => ({ x: x(i), y: y(v) }));
  let hilo = `M${tendencia[0].x} ${tendencia[0].y}`;
  for (let i = 1; i < tendencia.length; i++) {
    const medio = redondear1((tendencia[i - 1].x + tendencia[i].x) / 2);
    hilo += `C${medio} ${tendencia[i - 1].y} ${medio} ${tendencia[i].y} ${tendencia[i].x} ${tendencia[i].y}`;
  }
  const indice = max > 0 ? totales.indexOf(max) : -1;
  const promedio = totales.reduce((s, v) => s + v, 0) / totales.length;
  return {
    base,
    barras,
    anchoBarra: redondear1(Math.max(1.5, Math.min(4, paso * 0.5))),
    hilo,
    promedioY: max > 0 ? y(promedio) : null,
    pico: indice >= 0 ? { x: barras[indice].x, y: barras[indice].y, indice } : null,
  };
}
