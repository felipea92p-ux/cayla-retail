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
  /** «1» incluye los datos de prueba (D-54) en la lista; ausente o cualquier otro valor los deja fuera. */
  prueba?: string;
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
  /** Ventas marcadas `es_prueba` (D-54, ADR-0159): fuera por defecto, un toggle las trae de vuelta. */
  incluirPrueba: boolean;
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
    incluirPrueba: p.prueba === "1",
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
  es_prueba?: boolean;
  usuario_id: string | null;
  /** Quién atendió (`ventas.asesora_id`); ausente/null en las ventas anteriores a la fila «Atendió». */
  asesora_id?: string | null;
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

/** El documento de la venta: boleta, factura o nota de venta (ADR-0164; una nota de crédito corrige, no ampara). Si hubo
 *  más de uno, el más reciente que siga vivo; si todos murieron, el más reciente — así se ve por qué. */
export function elegirComprobante(cs: VentaCruda["comprobantes"]): ComprobanteVenta | null {
  const propios = cs.filter((c) => c.tipo === "boleta" || c.tipo === "factura" || c.tipo === "nota_venta").sort((a, b) => b.created_at.localeCompare(a.created_at));
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
  /** Dato ficticio de prueba (D-54, ADR-0159): solo llega a esta fila con el toggle «Ver datos de prueba». */
  esPrueba: boolean;
};

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
