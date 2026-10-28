import { compararTallas } from "./tallas";
import { diasEntreFechas } from "./fechas-lima";
import { soles } from "./orden-ficha-reglas";
import { FASES, type FaseClave, type Posicion, type Quien } from "./orden-fases-reglas";
import { cantidadAPedir, veredictoTela } from "./orden-tela-reglas";

// La página de UNA orden de producción (ADR-0400, actividad 3; «D · Página propia», elegida por Felipe el 2026-10-14): las reglas puras. Sin React ni Supabase, para que
// las importen la página (servidor) y sus piezas (cliente), y para probar cada frase que la persona lee sin abrir el navegador.
//
// LA BASE MANDA: `fn_orden_produccion` (migración 20261014155000) devuelve la orden, sus líneas, sus fases con el detalle por talla y color, la tela, los costos, la línea de
// tiempo y los permisos EN UNA lectura. Aquí solo se LEE esa respuesta (`leerOrdenPagina`, tolerante: lo que no entiende lo descarta, y una respuesta sin orden es `null`) y se
// ESCRIBE en palabras de tienda. Nada de aquí agrega una regla de negocio: cuánto falta, qué fase sigue y qué avisos salen se calculan solo con lo que la base ya dijo.
//
// CONTRATO
//   PROMETE: que `cantidadesQueFaltan` y `faltaTerminar` dicen lo mismo que el candado de `registrar_avance` (en Corte, el plan de cada talla y color menos lo ya terminado; en
//            las demás fases, lo que entró de la anterior menos lo ya terminado), así que «Terminé todas» nunca se pasa de lo que la base acepta; que una fase `hecha`, una orden
//            cerrada o una cuenta sin permiso de operar no ofrecen ninguna acción; y que `rojoDeLaOrden` solo marca lo que se puede decir con un dato (fecha pasada, tela que
//            no alcanza, días sin que nadie anote nada), cada causa con su porqué en una frase.
//   ASUME:   las fechas llegan como `aaaa-mm-dd` y los instantes como timestamp con zona (la base); «hoy» es el de Lima (`hoyLima()`), como `fn_hoy_lima()`.
//   NO HACE: no escribe en la base, no decide quién puede operar (eso viene en `permisos`) y no calcula dinero: los montos son los de la base, aquí solo se acomodan.

export const RPC_ORDEN_PRODUCCION = "fn_orden_produccion";
export const RPC_TELA_PENDIENTE = "fn_tela_pendiente_de_la_orden";
export const RPC_REGISTRAR_AVANCE = "registrar_avance";
export const RPC_DESHACER_AVANCE = "deshacer_avance";
export const RPC_CAMBIAR_QUIEN_FASE = "cambiar_quien_fase";
/** «Pendiente de registrar» (ADR-0551 pendiente de registrar): dejar una fase que no empezó como un servicio sin proveedor, y registrar quién fue después (aunque la fase ya haya empezado). */
export const RPC_DEJAR_FASE_PENDIENTE = "dejar_fase_pendiente_de_registrar";
export const RPC_REGISTRAR_PROVEEDOR_DE_FASE = "registrar_proveedor_de_fase";
export const RPC_MARCAR_FASE = "marcar_fase_hecha";
export const RPC_DESHACER_MARCA = "deshacer_marca_fase";
export const RPC_REGISTRAR_SALIDA = "registrar_salida";
export const RPC_REGISTRAR_VUELTA = "registrar_vuelta";
export const RPC_ANULAR_SALIDA = "anular_salida";
export const RPC_ANULAR_VUELTA = "anular_vuelta";
export const RPC_CERRAR_PRODUCCION = "cerrar_produccion";
export const RPC_ANULAR_PRODUCCION = "anular_produccion";
export const RPC_REVERTIR_PRODUCCION = "revertir_produccion";
export const RPC_GUARDAR_INSUMOS_ORDEN = "guardar_insumos_orden";

/** Días sin que nadie anote nada para que la orden pida atención (ADR-0400, «Pantallas» punto 1). */
export const DIAS_SIN_MOVERSE = 4;

// ---------- Lo que la página lee ----------

export type EstadoOrden = "en_proceso" | "terminada" | "anulada";
export type EstadoFase = "pendiente" | "en_curso" | "hecha";
export type TipoEvento = "apertura" | "avance" | "deshacer" | "salida" | "vuelta" | "anulacion" | "marca" | "desmarca";

export type ProductoPagina = {
  id: string;
  referencia: string;
  codigo: string | null;
  categoria: { nombre: string | null; prefijo: string | null; familia: string | null } | null;
  tejidoNombre: string | null;
  precio: number | null;
};

export type LineaPagina = {
  varianteId: string;
  codigo: string | null;
  talla: string | null;
  colorCodigo: string | null;
  colorNombre: string | null;
  colorHex: string | null;
  cantidadPlan: number;
  cantidadBuenas: number | null;
};

export type FaseVariante = { varianteId: string; plan: number | null; entrada: number; hechas: number; salieron: number; volvieronBuenas: number; segundas: number; faltantes: number; afuera: number };

export type FasePagina = {
  id: string;
  clave: FaseClave;
  nombre: string;
  secuencia: number;
  posicion: Posicion | null;
  quien: Quien;
  proveedorId: string | null;
  proveedorNombre: string | null;
  tarifaPrenda: number | null;
  fijoOrden: number;
  cantidadMinima: number | null;
  fechaPrometida: string | null;
  nota: string | null;
  entrada: number;
  hechas: number;
  afuera: number;
  salieron: number;
  segundas: number;
  faltantes: number;
  estado: EstadoFase;
  actual: boolean;
  empezada: boolean;
  desde: string | null;
  diasEnFase: number | null;
  devengado: number | null;
  /** Una fase que se MARCA «hecha» con un toque en vez de contar prendas (Ploteo): sus cantidades vienen en 0 y no entra a la cadena de la que depende cada fase (`fn_fase_es_hito`). */
  hito: boolean;
  /** Solo en una fase hito: tiene una marca viva (la fase está `hecha`). */
  marcada: boolean;
  porVariante: FaseVariante[];
};

/** El consumo por talla que devuelve `fn_orden_produccion` ({"S": 1.15, "M": 1.2}) como mapa de números; null si no hay, no es un objeto o ninguna cifra se lee. */
function porTallaLeida(crudo: unknown): Record<string, number> | null {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return null;
  const pares = Object.entries(crudo as Record<string, unknown>).flatMap(([talla, v]) => (v !== null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0 ? [[talla, Number(v)] as const] : []));
  return pares.length > 0 ? Object.fromEntries(pares) : null;
}

export type InsumoPagina = {
  id: string;
  insumoId: string;
  nombre: string;
  tipo: "tela" | "avio";
  unidad: string;
  colorCodigo: string | null;
  colorNombre: string | null;
  consumoPorPrenda: number;
  /** Una cifra por talla (talla → metros o unidades), si la orden la declaró así; ausente o nulo = una sola cifra para todas las tallas (ADR-0513). */
  consumoPorTalla?: Record<string, number> | null;
  cantidadPlan: number;
  usado: number;
  saldo: number;
  /** Lo que las OTRAS órdenes abiertas del Taller ya reservan de este insumo (su plan menos lo descontado): no está libre para esta orden (`fn_tela_pendiente_de_la_orden`). */
  comprometidoOtras: number;
  /** Lo que viene en camino a este insumo: lo que FALTA RECIBIR de las órdenes de insumos generadas con destino el Taller, sin los pedidos atrasados (`fn_tela_en_camino`, regla de Felipe del 2026-10-16). Cuenta para «alcanza». */
  enCamino: number;
  /** Lo que falta recibir de pedidos cuya fecha de entrega ya pasó: NO cuenta (nadie sabe si llegará) y se muestra aparte. */
  atrasado: number;
  /** Los pedidos de este insumo con lo que falta recibir de cada uno, los que cuentan primero y los atrasados al fondo. */
  pedidos: PedidoDeInsumo[];
};

/** `cantidad` es lo que FALTA RECIBIR de ese pedido (no lo pedido en total); `atrasado`: su fecha estimada de entrega ya pasó. */
export type PedidoDeInsumo = { numeroTexto: string; proveedor: string; cantidad: number; unidad: string; fechaEntrega: string | null; atrasado: boolean };

/** Las órdenes de insumos de una tela como las manda la base (`fn_tela_pendiente_de_la_orden`, `fn_tela_del_taller`). Lo que no se entiende se descarta. */
export function leerPedidosDeInsumo(crudo: unknown): PedidoDeInsumo[] {
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((x): PedidoDeInsumo[] => {
    if (!esObjeto(x)) return [];
    const numeroTexto = texto(x.numero_texto);
    const cantidad = numero(x.cantidad);
    if (!numeroTexto || cantidad === null) return [];
    return [{ numeroTexto, proveedor: texto(x.proveedor) ?? "un proveedor", cantidad, unidad: texto(x.unidad) ?? "unidad", fechaEntrega: texto(x.fecha_entrega), atrasado: x.atrasado === true }];
  });
}

/**
 * «OI-000003 · 50 m a Textiles Andinos · llega el vie 23 oct»: un pedido en una línea, con la cantidad que FALTA RECIBIR. Uno atrasado lo dice y avisa que no se cuenta:
 * «OI-000002 · 35 m a Textiles Andinos · debía llegar el sáb 10 oct (atrasado, no lo cuento)».
 */
export function textoDePedido(p: PedidoDeInsumo): string {
  const base = `${p.numeroTexto} · ${cantidadConUnidad(p.cantidad, p.unidad)} a ${p.proveedor}`;
  if (p.atrasado) return `${base}${p.fechaEntrega ? ` · debía llegar el ${diaCorto(p.fechaEntrega)}` : ""} (atrasado, no lo cuento)`;
  return `${base}${p.fechaEntrega ? ` · llega el ${diaCorto(p.fechaEntrega)}` : ""}`;
}

export type CostosPagina = {
  telaEstimado: number;
  aviosEstimado: number;
  telaReal: number;
  aviosReal: number;
  serviciosEstimado: number;
  serviciosDevengado: number;
  totalEstimado: number;
  totalRealHastaHoy: number;
};

export type EventoTiempo = {
  id: string;
  cuando: string;
  quienNombre: string | null;
  tipo: TipoEvento;
  faseClave: FaseClave | null;
  faseNombre: string | null;
  cantidad: number;
  detalle: string | null;
  /** Solo en un avance que todavía se puede deshacer (la misma regla que `deshacer_avance`). */
  avanceId: string | null;
  varianteId: string | null;
  nota: string | null;
  /** Solo en una salida o una vuelta (ADR-0400, actividad 4b): ya la anuló otra anotación. */
  anulada: boolean;
  /** Solo en una salida o una vuelta: se puede anular ahora (la misma regla que `anular_salida` / `anular_vuelta`). */
  anulable: boolean;
  /** Solo en una anulación: qué anuló, y por qué. */
  anula: "salida" | "vuelta" | null;
  motivo: string | null;
};

export type OrdenPagina = {
  orden: {
    id: string;
    numero: number;
    numeroTexto: string;
    estado: EstadoOrden;
    esMuestra: boolean;
    fechaEntrega: string | null;
    nota: string | null;
    creadoEn: string;
    creadoPorNombre: string | null;
    inventariadoEn: string | null;
    cantidadPlan: number;
    cantidadBuenas: number | null;
    ubicacionId: string;
    ubicacionNombre: string;
    producto: ProductoPagina;
  };
  lineas: LineaPagina[];
  fases: FasePagina[];
  insumos: InsumoPagina[];
  /** `null`: quien mira no ve los costos del Taller (o la base no los mandó). */
  costos: CostosPagina | null;
  lineaDeTiempo: EventoTiempo[];
  permisos: { puedeOperar: boolean; veCostos: boolean };
};

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);
function numero(x: unknown): number | null {
  const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
const entero = (x: unknown, defecto = 0): number => Math.round(numero(x) ?? defecto);
const claves = new Set<string>(FASES.map((f) => f.clave));
const TIPOS_EVENTO: ReadonlySet<string> = new Set(["apertura", "avance", "deshacer", "salida", "vuelta", "anulacion", "marca", "desmarca"]);

function leerFase(crudo: unknown): FasePagina | null {
  if (!esObjeto(crudo)) return null;
  const id = texto(crudo.id);
  const clave = texto(crudo.clave);
  if (!id || !clave || !claves.has(clave)) return null;
  const estado = crudo.estado === "hecha" || crudo.estado === "en_curso" ? crudo.estado : "pendiente";
  const porVariante = Array.isArray(crudo.por_variante)
    ? crudo.por_variante.flatMap((v): FaseVariante[] => {
        if (!esObjeto(v)) return [];
        const varianteId = texto(v.variante_id);
        if (!varianteId) return [];
        return [{ varianteId, plan: numero(v.plan), entrada: entero(v.entrada), hechas: entero(v.hechas), salieron: entero(v.salieron), volvieronBuenas: entero(v.volvieron_buenas), segundas: entero(v.segundas), faltantes: entero(v.faltantes), afuera: entero(v.afuera) }];
      })
    : [];
  return {
    id,
    clave: clave as FaseClave,
    nombre: texto(crudo.nombre) ?? FASES.find((f) => f.clave === clave)?.nombre ?? clave,
    secuencia: entero(crudo.secuencia),
    posicion: crudo.posicion === "pieza" || crudo.posicion === "prenda" ? crudo.posicion : null,
    quien: crudo.quien === "servicio" ? "servicio" : "taller",
    proveedorId: texto(crudo.proveedor_id),
    proveedorNombre: texto(crudo.proveedor_nombre),
    tarifaPrenda: numero(crudo.tarifa_prenda),
    fijoOrden: numero(crudo.fijo_orden) ?? 0,
    cantidadMinima: numero(crudo.cantidad_minima),
    fechaPrometida: texto(crudo.fecha_prometida),
    nota: texto(crudo.nota),
    entrada: entero(crudo.entrada),
    hechas: entero(crudo.hechas),
    afuera: entero(crudo.afuera),
    salieron: entero(crudo.salieron),
    segundas: entero(crudo.segundas),
    faltantes: entero(crudo.faltantes),
    estado,
    actual: crudo.actual === true,
    empezada: crudo.empezada === true,
    desde: texto(crudo.desde),
    diasEnFase: numero(crudo.dias_en_fase),
    devengado: numero(crudo.devengado),
    hito: crudo.hito === true,
    marcada: crudo.marcada === true,
    porVariante,
  };
}

function leerEvento(crudo: unknown): EventoTiempo | null {
  if (!esObjeto(crudo)) return null;
  const tipo = texto(crudo.tipo);
  const cuando = texto(crudo.cuando);
  if (!tipo || !TIPOS_EVENTO.has(tipo) || !cuando) return null;
  const faseClave = texto(crudo.fase_clave);
  return {
    id: texto(crudo.id) ?? `${tipo}-${cuando}`,
    cuando,
    quienNombre: texto(crudo.quien_nombre),
    tipo: tipo as TipoEvento,
    faseClave: faseClave && claves.has(faseClave) ? (faseClave as FaseClave) : null,
    faseNombre: texto(crudo.fase_nombre),
    cantidad: entero(crudo.cantidad),
    detalle: texto(crudo.detalle),
    avanceId: texto(crudo.avance_id),
    varianteId: texto(crudo.variante_id),
    nota: texto(crudo.nota),
    anulada: crudo.anulada === true,
    anulable: crudo.anulable === true,
    anula: crudo.anula === "salida" || crudo.anula === "vuelta" ? crudo.anula : null,
    motivo: texto(crudo.motivo),
  };
}

/**
 * La respuesta de `fn_orden_produccion` leída. `null` si no hay orden (la base responde NULL cuando no existe o no se puede leer) o si lo recibido no se parece a una
 * orden: la página dice «no encontramos esa orden» o «no se pudo leer», nunca dibuja a medias. Lo suelto (una fase con una clave desconocida, un evento roto) se descarta.
 */
export function leerOrdenPagina(crudo: unknown): OrdenPagina | null {
  if (!esObjeto(crudo) || !esObjeto(crudo.orden)) return null;
  const o = crudo.orden;
  const id = texto(o.id);
  const numeroOrden = numero(o.numero);
  const p = esObjeto(o.producto) ? o.producto : null;
  const productoId = p ? texto(p.id) : null;
  if (!id || numeroOrden === null || !p || !productoId) return null;
  const estado: EstadoOrden = o.estado === "terminada" || o.estado === "anulada" ? o.estado : "en_proceso";
  const cat = esObjeto(p.categoria) ? p.categoria : null;
  const permisos = esObjeto(crudo.permisos) ? crudo.permisos : {};
  const costos = esObjeto(crudo.costos) ? crudo.costos : null;
  const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  // Lo que otras órdenes reservan de cada tela y lo pedido (`tela_pendiente`, ADR-0400 actividad 7): opcional. Sin ello, «alcanza» se mide contra todo el estante, como antes.
  const pendientes = new Map<string, { comprometidoOtras: number; enCamino: number; atrasado: number; pedidos: PedidoDeInsumo[] }>();
  for (const t of lista(crudo.tela_pendiente)) {
    if (!esObjeto(t)) continue;
    const insumoId = texto(t.insumo_id);
    if (!insumoId) continue;
    pendientes.set(insumoId, {
      comprometidoOtras: Math.max(numero(t.comprometido_otras) ?? 0, 0),
      enCamino: Math.max(numero(t.en_camino) ?? 0, 0),
      atrasado: Math.max(numero(t.atrasado) ?? 0, 0),
      pedidos: leerPedidosDeInsumo(t.pedidos),
    });
  }
  return {
    orden: {
      id,
      numero: Math.round(numeroOrden),
      numeroTexto: texto(o.numero_texto) ?? `OP-${String(Math.round(numeroOrden)).padStart(6, "0")}`,
      estado,
      esMuestra: o.es_muestra === true,
      fechaEntrega: texto(o.fecha_entrega),
      nota: texto(o.nota),
      creadoEn: texto(o.created_at) ?? "",
      creadoPorNombre: texto(o.creado_por_nombre),
      inventariadoEn: texto(o.inventariado_at),
      cantidadPlan: entero(o.cantidad_plan),
      cantidadBuenas: numero(o.cantidad_buenas),
      ubicacionId: texto(o.ubicacion_id) ?? "",
      ubicacionNombre: texto(o.ubicacion_nombre) ?? "Taller",
      producto: {
        id: productoId,
        referencia: texto(p.referencia) ?? "Sin nombre",
        codigo: texto(p.codigo),
        categoria: cat ? { nombre: texto(cat.nombre), prefijo: texto(cat.prefijo), familia: texto(cat.familia) } : null,
        tejidoNombre: texto(p.tejido_nombre),
        precio: numero(p.precio),
      },
    },
    lineas: lista(crudo.lineas).flatMap((l): LineaPagina[] => {
      if (!esObjeto(l)) return [];
      const varianteId = texto(l.variante_id);
      if (!varianteId) return [];
      return [{ varianteId, codigo: texto(l.codigo) ?? texto(l.sku), talla: texto(l.talla), colorCodigo: texto(l.color_codigo), colorNombre: texto(l.color_nombre), colorHex: texto(l.color_hex), cantidadPlan: entero(l.cantidad_plan), cantidadBuenas: numero(l.cantidad_buenas) }];
    }),
    fases: lista(crudo.fases)
      .map(leerFase)
      .filter((f): f is FasePagina => f !== null)
      .sort((a, b) => a.secuencia - b.secuencia),
    insumos: lista(crudo.insumos).flatMap((i): InsumoPagina[] => {
      if (!esObjeto(i)) return [];
      const idInsumo = texto(i.id);
      const insumoId = texto(i.insumo_id);
      if (!idInsumo || !insumoId) return [];
      const pendiente = pendientes.get(insumoId);
      return [{ id: idInsumo, insumoId, nombre: texto(i.nombre) ?? "Insumo", tipo: i.tipo === "avio" ? "avio" : "tela", unidad: texto(i.unidad) ?? "unidad", colorCodigo: texto(i.color_codigo), colorNombre: texto(i.color_nombre), consumoPorPrenda: numero(i.consumo_por_prenda) ?? 0, consumoPorTalla: porTallaLeida(i.consumo_por_talla), cantidadPlan: numero(i.cantidad_plan) ?? 0, usado: numero(i.usado) ?? 0, saldo: numero(i.saldo) ?? 0, comprometidoOtras: pendiente?.comprometidoOtras ?? 0, enCamino: pendiente?.enCamino ?? 0, atrasado: pendiente?.atrasado ?? 0, pedidos: pendiente?.pedidos ?? [] }];
    }),
    costos: costos
      ? {
          telaEstimado: numero(costos.tela_estimado) ?? 0,
          aviosEstimado: numero(costos.avios_estimado) ?? 0,
          telaReal: numero(costos.tela_real) ?? 0,
          aviosReal: numero(costos.avios_real) ?? 0,
          serviciosEstimado: numero(costos.servicios_estimado) ?? 0,
          serviciosDevengado: numero(costos.servicios_devengado) ?? 0,
          totalEstimado: numero(costos.total_estimado) ?? 0,
          totalRealHastaHoy: numero(costos.total_real_hasta_hoy) ?? 0,
        }
      : null,
    lineaDeTiempo: lista(crudo.linea_de_tiempo)
      .map(leerEvento)
      .filter((e): e is EventoTiempo => e !== null),
    permisos: { puedeOperar: permisos.puede_operar === true, veCostos: permisos.ve_costos === true && costos !== null },
  };
}

/** El número de la URL: «OP-000067», «op-67» o «67» → 67. Cualquier otra cosa → `null` (la página dice que no la encontró, sin consultar nada). */
export function numeroDeOrdenEnUrl(segmento: string): number | null {
  let limpio: string;
  try {
    limpio = decodeURIComponent(segmento).trim();
  } catch {
    return null; // un `%` suelto en la URL: no es una orden
  }
  const m = /^(?:OP-?)?0*(\d{1,9})$/i.exec(limpio);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

// ---------- Fechas y cantidades, en palabras de tienda ----------

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function partesDeFecha(iso: string): { dia: number; mes: number; semana: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return { dia: f.getUTCDate(), mes: f.getUTCMonth(), semana: f.getUTCDay() };
}

/** «vie 23 oct» de una fecha `aaaa-mm-dd`. */
export function diaCorto(iso: string): string {
  const p = partesDeFecha(iso);
  return p ? `${DIAS_CORTOS[p.semana]} ${p.dia} ${MESES_CORTOS[p.mes]}` : iso;
}

/** El día de calendario de Lima (`aaaa-mm-dd`) de un instante; Lima va cinco horas detrás de UTC todo el año. */
export function fechaLimaDe(instante: string): string {
  const t = Date.parse(instante);
  return Number.isNaN(t) ? instante.slice(0, 10) : new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** «10:12» de un instante, en hora de Lima. */
export function horaLima(instante: string): string {
  const t = Date.parse(instante);
  if (Number.isNaN(t)) return "";
  const d = new Date(t - 5 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const cuantas = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const dias = (n: number) => cuantas(n, "día", "días");

/** «negro y caqui», «28, 30 y 32». */
function conY(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Cantidad con su unidad corta: «72 m», «96 und». */
export function cantidadConUnidad(n: number, unidad: string): string {
  const corta: Record<string, string> = { metro: "m", unidad: "und", kilo: "kg", cono: "conos", par: "pares", docena: "doc" };
  const redondeado = Math.round(n * 100) / 100;
  return `${redondeado.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ${corta[unidad] ?? unidad}`;
}

const monto = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- La ficha ----------

/** «Pantalón Lía · 48 prendas · entrega vie 23 oct»: la frase de la cabecera. */
export function fraseDeLaOrden(o: OrdenPagina["orden"]): string {
  const cuantasPrendas = cuantas(o.estado === "terminada" && o.cantidadBuenas !== null ? o.cantidadBuenas : o.cantidadPlan, "prenda", "prendas");
  const entrega = o.fechaEntrega ? `entrega ${diaCorto(o.fechaEntrega)}` : "sin fecha de entrega";
  return `${o.esMuestra ? "Muestra de " : ""}${o.producto.referencia} · ${cuantasPrendas} · ${entrega}`;
}

/** «negro y caqui · tallas 28, 30 y 32», o `null` si la orden no tiene líneas. */
export function textoColoresYTallas(lineas: readonly LineaPagina[]): string | null {
  const colores = [...new Set(lineas.flatMap((l) => (l.colorNombre ? [l.colorNombre.toLocaleLowerCase("es")] : [])))];
  const tallas = [...new Set(lineas.flatMap((l) => (l.talla ? [l.talla] : [])))].sort(compararTallas);
  const partes = [colores.length > 0 ? conY(colores) : null, tallas.length > 0 ? `${tallas.length === 1 ? "talla" : "tallas"} ${conY(tallas)}` : null].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** «Abierta el martes 13 por Felipe». */
export function textoApertura(o: OrdenPagina["orden"]): string {
  const dia = fechaLimaDe(o.creadoEn);
  const p = partesDeFecha(dia);
  const cuando = p ? `el ${DIAS_LARGOS[p.semana]} ${p.dia}` : "";
  return `Abierta ${cuando}${o.creadoPorNombre ? ` por ${o.creadoPorNombre}` : ""}`.replace(/\s+/g, " ").trim();
}

/** El precio de venta de la ficha: «se vende a S/ 129.00», o `null` si el modelo todavía no tiene precio. */
export function textoSeVende(precio: number | null): string | null {
  return precio !== null && precio > 0 ? `se vende a ${soles(precio)}` : null;
}

export type EstadoDeLaOrden = { texto: string; tono: "pizarra" | "verde" | "neutro" | "ambar" };

/** Dónde está la orden, en un chip: «En costura · afuera», «Lista para pasar al stock», «Pasó al stock», «Anulada». */
export function estadoDeLaOrden(o: OrdenPagina["orden"], fases: readonly FasePagina[]): EstadoDeLaOrden {
  if (o.estado === "anulada") return { texto: "Anulada", tono: "neutro" };
  if (o.estado === "terminada") return { texto: "Pasó al stock", tono: "verde" };
  if (todasLasQueCuentanHechas(fases)) return { texto: "Lista para pasar al stock", tono: "verde" };
  const actual = fases.find((f) => f.actual) ?? null;
  if (!actual) return { texto: "En proceso", tono: "pizarra" };
  return { texto: `En ${actual.nombre.toLocaleLowerCase("es")}${actual.quien === "servicio" ? " · afuera" : ""}`, tono: "pizarra" };
}

// ---------- Las cifras de la cabecera ----------

export type CifrasDeLaOrden = {
  prendas: { valor: number; etiqueta: string; aparte: string | null };
  entrega: { valor: number | null; etiqueta: string; nota: string | null; atrasada: boolean };
  costo: { valor: number; nota: string; etiqueta: string } | null;
};

/** Prendas · Entrega · Costo hasta hoy (solo si ve los costos). `hoy` es `aaaa-mm-dd` de Lima. */
export function cifrasDeLaOrden(p: OrdenPagina, hoy: string): CifrasDeLaOrden {
  const o = p.orden;
  const colores = new Map<string, number>();
  for (const l of p.lineas) if (l.colorNombre) colores.set(l.colorNombre.toLocaleLowerCase("es"), (colores.get(l.colorNombre.toLocaleLowerCase("es")) ?? 0) + l.cantidadPlan);
  const aparte = colores.size > 1 ? [...colores].map(([c, n]) => `${n} ${c}`).join(" · ") : null;
  let entrega: CifrasDeLaOrden["entrega"];
  if (!o.fechaEntrega) entrega = { valor: null, etiqueta: "Entrega · sin fecha", nota: null, atrasada: false };
  else {
    const faltan = diasEntreFechas(hoy, o.fechaEntrega);
    const abierta = o.estado === "en_proceso";
    if (!abierta) entrega = { valor: null, etiqueta: `Entrega · ${diaCorto(o.fechaEntrega)}`, nota: null, atrasada: false };
    else if (faltan < 0) entrega = { valor: -faltan, etiqueta: `Atrasada · era el ${diaCorto(o.fechaEntrega)}`, nota: faltan === -1 ? "día" : "días", atrasada: true };
    else if (faltan === 0) entrega = { valor: 0, etiqueta: `Entrega hoy · ${diaCorto(o.fechaEntrega)}`, nota: "hoy", atrasada: false };
    else entrega = { valor: faltan, etiqueta: `Para el ${diaCorto(o.fechaEntrega)}`, nota: faltan === 1 ? "día" : "días", atrasada: false };
  }
  return {
    prendas: { valor: o.estado === "terminada" && o.cantidadBuenas !== null ? o.cantidadBuenas : o.cantidadPlan, etiqueta: o.estado === "terminada" ? "Prendas buenas" : "Prendas", aparte },
    entrega,
    costo: p.permisos.veCostos && p.costos ? { valor: p.costos.totalRealHastaHoy, nota: `de ${soles(p.costos.totalEstimado)}`, etiqueta: "Costo hasta hoy" } : null,
  };
}

// ---------- Las fases ----------

/**
 * ¿Terminaron todas las fases que cuentan prendas? Una fase que se MARCA (Ploteo) no bloquea el paso al stock aunque nadie la marcó: la base solo mira lo terminado en la
 * ÚLTIMA fase (`cerrar_produccion`), y un modelo que se repite no vuelve a plotear. Es la misma regla de «Lista para pasar al stock» en la página y en la lista.
 */
export function todasLasQueCuentanHechas(fases: readonly FasePagina[]): boolean {
  const cuentan = fases.filter((f) => !f.hito);
  return cuentan.length > 0 && cuentan.every((f) => f.estado === "hecha");
}

/** La fase de antes que SÍ cuenta prendas (la que le da lo que entra), saltando las que se marcan: `null` en la primera. Es `fn_produccion_fase_anterior`. */
export function previaQueCuenta(fases: readonly FasePagina[], indice: number): FasePagina | null {
  for (let i = indice - 1; i >= 0; i--) if (!fases[i].hito) return fases[i];
  return null;
}

/** Sale afuera pero todavía no se sabe con quién ni a cuánto (ADR-0551 pendiente de registrar): un servicio sin proveedor. No cobra nada hasta que se registre quién. */
export function esPendienteDeRegistrar(f: Pick<FasePagina, "quien" | "proveedorId">): boolean {
  return f.quien === "servicio" && f.proveedorId === null;
}

/** Quién la hace, en una palabra: «Taller», el nombre del servicio o «Pendiente de registrar». */
export function quienDeFase(f: FasePagina): string {
  if (f.quien !== "servicio") return "Taller";
  return f.proveedorNombre ?? (esPendienteDeRegistrar(f) ? "Pendiente de registrar" : "Un servicio");
}

/** Las fases que salieron afuera sin registrar quién, en el orden de la ruta: su costo NO entra al de las prendas hasta que se registre. */
export function fasesSinRegistrar(fases: readonly FasePagina[]): FasePagina[] {
  return fases.filter(esPendienteDeRegistrar);
}

/** La primera fase que CUENTA prendas (Corte; una fase que se marca, como Ploteo, no cuenta): su tope es el plan más un 10 %, y para «lo que falta» se cuenta contra el plan. */
export function esPrimeraFase(f: FasePagina, fases: readonly FasePagina[]): boolean {
  if (f.hito) return false;
  return fases.every((otra) => otra.hito || otra.secuencia >= f.secuencia);
}

/**
 * Lo que falta terminar en una fase del Taller, por talla y color (solo las que faltan algo): en la primera fase, el plan menos lo ya cortado; en las demás, lo que entró de la
 * fase anterior menos lo ya terminado. Es el valor de fábrica de «Terminé»: un clic y están todas. Nunca pasa de lo que `registrar_avance` acepta.
 */
export function cantidadesQueFaltan(f: FasePagina, fases: readonly FasePagina[]): Record<string, number> {
  const primera = esPrimeraFase(f, fases);
  const salida: Record<string, number> = {};
  for (const v of f.porVariante) {
    const tope = primera ? (v.plan ?? v.entrada) : v.entrada;
    const falta = Math.max(tope - v.hechas, 0);
    if (falta > 0) salida[v.varianteId] = falta;
  }
  return salida;
}

/** Cuánto es lo que falta terminar en una fase del Taller (la suma de `cantidadesQueFaltan`). */
export function faltaTerminar(f: FasePagina, fases: readonly FasePagina[]): number {
  return Object.values(cantidadesQueFaltan(f, fases)).reduce((a, b) => a + b, 0);
}

/** Lo que todavía se puede mandar a un servicio: lo que entró a esa fase menos lo que ya salió. */
export function porMandar(f: FasePagina): number {
  return Math.max(f.entrada - f.salieron, 0);
}

export type AccionFase = "terminar" | "salida" | "vuelta" | "marcar" | "desmarcar";

/**
 * Las acciones que ofrece una fase: «Terminé N» en el Taller; «Salida» si queda algo por mandar y «Vuelta» si hay prendas afuera, en un servicio; en una fase que se marca
 * (Ploteo), «marcar» como hecha o, ya marcada, «desmarcar». Ninguna si no se puede operar.
 */
export function accionesDeFase(f: FasePagina, p: Pick<OrdenPagina, "orden" | "permisos" | "fases">): AccionFase[] {
  if (!p.permisos.puedeOperar || p.orden.estado !== "en_proceso") return [];
  if (f.hito) return f.marcada ? ["desmarcar"] : ["marcar"];
  if (f.estado === "hecha") return [];
  if (f.quien === "taller") return faltaTerminar(f, p.fases) > 0 ? ["terminar"] : [];
  const acciones: AccionFase[] = [];
  if (porMandar(f) > 0) acciones.push("salida");
  if (f.afuera > 0) acciones.push("vuelta");
  return acciones;
}

export type Siguiente = { fase: FasePagina | null; accion: AccionFase | "pasar_al_stock" | "nada" };

/** Qué sigue en la orden: la fase actual y lo que le toca (terminar, mandar, recibir), o pasar al stock cuando las tres terminaron. */
export function queSigue(fases: readonly FasePagina[], estado: EstadoOrden): Siguiente {
  if (estado !== "en_proceso" || fases.length === 0) return { fase: null, accion: "nada" };
  if (todasLasQueCuentanHechas(fases)) return { fase: fases[fases.length - 1], accion: "pasar_al_stock" };
  const actual = fases.find((f) => f.actual) ?? null;
  if (!actual) return { fase: null, accion: "nada" };
  if (actual.hito) return { fase: actual, accion: "marcar" };
  if (actual.quien === "taller") return { fase: actual, accion: faltaTerminar(actual, fases) > 0 ? "terminar" : "nada" };
  if (actual.afuera > 0) return { fase: actual, accion: "vuelta" };
  return { fase: actual, accion: porMandar(actual) > 0 ? "salida" : "nada" };
}

/** Lo que sigue, dicho como una frase: «Sigue: terminar el corte (faltan 30)». `null` si no hay nada que decir. */
export function textoQueSigue(s: Siguiente, fases: readonly FasePagina[]): string | null {
  if (s.accion === "pasar_al_stock") return "Sigue: pasar las prendas al stock del Taller.";
  if (!s.fase) return null;
  const fase = s.fase.nombre.toLocaleLowerCase("es");
  switch (s.accion) {
    case "marcar":
      return `Sigue: marcar ${fase} como hecho.`;
    case "terminar":
      return `Sigue: terminar ${fase} (faltan ${faltaTerminar(s.fase, fases)}).`;
    case "salida":
      return `Sigue: mandar ${fase} a ${quienDeFase(s.fase)} (${cuantas(porMandar(s.fase), "prenda lista", "prendas listas")}).`;
    case "vuelta":
      return `Sigue: recibir ${fase} de ${quienDeFase(s.fase)} (${s.fase.afuera} afuera).`;
    default:
      return null;
  }
}

/** ¿Se puede cambiar quién hace esta fase? Solo mientras no empezó y la orden sigue en proceso (la base lo exige: `fase_empezada`, `orden_cerrada`). */
export function puedeCambiarQuien(f: FasePagina, p: Pick<OrdenPagina, "orden" | "permisos">): boolean {
  return p.permisos.puedeOperar && p.orden.estado === "en_proceso" && !f.empezada && f.estado !== "hecha";
}

/** ¿Se puede registrar quién hizo esta fase? Una fase pendiente, en cualquier momento (aunque ya empezó) mientras la orden siga en proceso (la base: `fase_no_pendiente`, `orden_cerrada`). */
export function puedeRegistrarQuien(f: FasePagina, p: Pick<OrdenPagina, "orden" | "permisos">): boolean {
  return p.permisos.puedeOperar && p.orden.estado === "en_proceso" && esPendienteDeRegistrar(f);
}

/** El aviso de la cantidad mínima del servicio: «Confecciones del Norte cobra desde 150 prendas; esta orden lleva 48». No bloquea (ADR-0400, decisión 5). */
export function avisoMinimoDeFase(f: FasePagina, totalPrendas: number): string | null {
  if (f.quien !== "servicio" || f.estado === "hecha" || f.cantidadMinima === null || f.cantidadMinima <= 0 || totalPrendas >= f.cantidadMinima) return null;
  return `${quienDeFase(f)} cobra desde ${f.cantidadMinima} prendas; esta orden lleva ${totalPrendas}.`;
}

export type TextoDeFase = { cifra: string; de: string; detalle: string };

/**
 * Lo que dice una pieza de la ruta: la cifra («120»), su «de 200 terminadas» y el renglón de abajo («48 afuera con Confecciones del Norte · prometido mié 21», «Empieza cuando
 * termine Corte», «Hecha el jue 15»). `previa` es la fase de antes (para decir de quién espera) y `terminoEl` el instante en que se anotó lo último de esta fase.
 */
export function textoDeFase(f: FasePagina, ctx: { previa: FasePagina | null; terminoEl: string | null; totalPlan: number }): TextoDeFase {
  const total = Math.max(ctx.totalPlan, f.entrada, f.hechas);
  const previa = ctx.previa ? ctx.previa.nombre : "la fase anterior";
  const extras = [f.segundas > 0 ? cuantas(f.segundas, "segunda", "segundas") : null, f.faltantes > 0 ? cuantas(f.faltantes, "faltante", "faltantes") : null].filter((x): x is string => x !== null);
  const conExtras = (base: string) => [base, ...extras].join(" · ");
  const servicio = f.quien === "servicio";
  if (f.hito) return textoDeHito(f, ctx.terminoEl);
  const de = servicio ? `de ${total} de vuelta` : f.estado === "pendiente" && f.hechas === 0 ? `de ${total}` : `de ${total} terminadas`;

  if (f.estado === "hecha") {
    const cuando = f.estado === "hecha" && ctx.terminoEl ? `Hecha el ${diaCorto(fechaLimaDe(ctx.terminoEl))}` : "Hecha";
    return { cifra: String(f.hechas), de: `de ${total}`, detalle: conExtras(cuando) };
  }
  if (!servicio) {
    // La primera fase no espera a nadie: desde el primer día lo que falta es todo el plan.
    if (f.estado === "en_curso" || !ctx.previa) {
      const faltan = Math.max(f.entrada - f.hechas, 0);
      const tiempo = f.diasEnFase !== null && f.diasEnFase >= 1 ? ` · ${dias(f.diasEnFase)} en esta fase` : "";
      return { cifra: String(f.hechas), de, detalle: `${faltan > 0 ? `Faltan ${faltan}` : `Esperando lo que falta de ${previa}`}${tiempo}` };
    }
    return { cifra: String(f.hechas), de, detalle: f.entrada > 0 ? `Ya pueden entrar ${f.entrada} de ${previa}` : `Empieza cuando termine ${previa}` };
  }
  // Un servicio: lo que salió, lo que sigue afuera y lo que prometió.
  const quien = quienDeFase(f);
  const prometido = f.fechaPrometida ? ` · prometido ${diaCorto(f.fechaPrometida)}` : "";
  if (f.afuera > 0) {
    const faltanMandar = porMandar(f);
    return { cifra: String(f.hechas), de, detalle: conExtras(`${f.afuera} afuera con ${quien}${prometido}${faltanMandar > 0 ? ` · ${faltanMandar} por mandar` : ""}`) };
  }
  if (f.salieron > 0) return { cifra: String(f.hechas), de, detalle: conExtras(porMandar(f) > 0 ? `Faltan ${porMandar(f)} por mandar a ${quien}` : `Todo volvió de ${quien}`) };
  return { cifra: String(f.hechas), de, detalle: f.entrada > 0 ? `${cuantas(f.entrada, "prenda lista", "prendas listas")} para mandar a ${quien}` : `Empieza cuando termine ${previa}` };
}

/** Lo que dice la pieza de una fase que se marca (Ploteo): «Hecho · Marcado el jue 15», o «Por hacer» y de quién espera la marcada. No cuenta prendas. */
function textoDeHito(f: FasePagina, terminoEl: string | null): TextoDeFase {
  const quien = quienDeFase(f);
  const cobra = f.quien === "servicio" && f.fijoOrden > 0 ? ` · S/\u00a0${f.fijoOrden.toFixed(2)} por orden` : "";
  if (f.marcada) return { cifra: "Hecho", de: "", detalle: `${terminoEl ? `Marcado el ${diaCorto(fechaLimaDe(terminoEl))}` : "Marcado"}${f.quien === "servicio" ? ` · con ${quien}` : ""}${cobra}` };
  const prometido = f.quien === "servicio" && f.fechaPrometida ? ` · prometido ${diaCorto(f.fechaPrometida)}` : "";
  return { cifra: "Por hacer", de: "", detalle: f.quien === "servicio" ? `Con ${quien}${prometido}${cobra}` : "Se marca con un toque cuando la marcada esté lista" };
}

/** El instante en que se anotó lo último de una fase (avance, Salida o Vuelta), para decir «Hecha el jue 15». `null` si nunca se anotó nada. */
export function cuandoTerminoLaFase(clave: FaseClave, linea: readonly EventoTiempo[]): string | null {
  let ultimo: string | null = null;
  for (const e of linea) {
    if (e.faseClave !== clave || (e.tipo !== "avance" && e.tipo !== "vuelta" && e.tipo !== "marca")) continue;
    if (ultimo === null || Date.parse(e.cuando) > Date.parse(ultimo)) ultimo = e.cuando;
  }
  return ultimo;
}

// ---------- La tela ----------

export type FilaDeTela = {
  id: string;
  /** Una tela o un avío (botones, cierres, hilo): la sección los muestra juntos, la tela primero, y dice cuál es cuál. */
  tipo: "tela" | "avio";
  nombre: string;
  detalle: string;
  plan: string;
  usado: string;
  saldo: string;
  alcanza: boolean;
  faltan: string | null;
  /** Cuánto falta, como número y en su unidad (para llevar a pedirlo). `null` si alcanza. */
  faltanNumero: number | null;
  /** «Otras órdenes ya reservan 20 m», o `null` si ninguna reserva nada. */
  reservadoPorOtras: string | null;
  /** «35 m»: lo que viene en camino y cuenta para «alcanza» (lo que falta recibir de los pedidos, sin los atrasados), o `null` si nada viene. */
  enCamino: string | null;
  /** «35 m»: lo que falta recibir de pedidos ATRASADOS (no cuenta), o `null`. */
  atrasado: string | null;
  /** Alcanza, pero solo gracias a lo que viene en camino (el estante solo no alcanza). */
  conLoQueViene: boolean;
  /** Es una tela y el corte ya terminó: lo que sobra de su plan ya no se va a usar, no falta nada por usar. */
  yaCortada: boolean;
  /** Los pedidos de esta tela con lo que falta recibir de cada uno: «OI-000003 · 50 m a Textiles Andinos · llega el vie 23 oct». */
  pedidos: string[];
};

/** El corte ya terminó (la fase que gasta la tela): desde ahí lo que sobra de la tela prevista no se va a usar. Los avíos (botones, hilo) se siguen usando en las fases de después. */
export function corteTerminado(p: Pick<OrdenPagina, "fases">): boolean {
  return p.fases.some((f) => f.clave === "corte" && f.estado === "hecha");
}

/**
 * La tela y los avíos de la orden, UNA fila por insumo: lo que pide el plan (la suma de sus colores), lo ya usado y si lo que queda en el estante alcanza para lo que falta usar. Es el
 * mismo veredicto de la hoja de Nueva orden (`veredictoTela`), contado sobre lo que aún falta usar: lo ya descontado del estante no se cuenta dos veces. Una misma tela en dos colores
 * sale de UN estante: se suman los dos planes contra un solo saldo, y como el libro de insumos no sabe de colores, lo usado es el mismo número en las dos filas de la base (no se suma).
 */
export function filasDeTela(insumos: readonly InsumoPagina[], corteHecho = false): FilaDeTela[] {
  const porInsumo = new Map<string, InsumoPagina[]>();
  for (const i of insumos) porInsumo.set(i.insumoId, [...(porInsumo.get(i.insumoId) ?? []), i]);
  return [...porInsumo.values()].map((filas) => {
    const base = filas[0];
    const plan = filas.reduce((s, f) => s + f.cantidadPlan, 0);
    const usado = Math.max(...filas.map((f) => f.usado));
    const comprometida = Math.max(...filas.map((f) => f.comprometidoOtras));
    const enCamino = Math.max(...filas.map((f) => f.enCamino));
    const atrasado = Math.max(...filas.map((f) => f.atrasado));
    // Con el corte terminado, la tela que sobra de su plan ya no se va a usar: no falta nada por usar (los avíos sí siguen).
    const yaCortada = corteHecho && base.tipo === "tela";
    const v = veredictoTela(yaCortada ? 0 : Math.max(plan - usado, 0), base.saldo, comprometida, enCamino);
    const color = (f: InsumoPagina) => f.colorNombre?.toLocaleLowerCase("es") ?? null;
    const unColor = filas.length === 1 && color(base) !== null;
    const detalle =
      filas.length > 1
        ? filas.map((f) => `${color(f) ?? "toda la orden"} ${cantidadConUnidad(f.cantidadPlan, f.unidad)}`).join(" · ")
        : base.consumoPorTalla && Object.keys(base.consumoPorTalla).length > 0
          ? `${Object.entries(base.consumoPorTalla).sort(([a], [b]) => compararTallas(a, b)).map(([talla, v]) => `${talla} ${cantidadConUnidad(v, base.unidad)}`).join(" · ")} por prenda`
          : base.consumoPorPrenda > 0
            ? `${cantidadConUnidad(base.consumoPorPrenda, base.unidad)} por prenda`
            : "";
    return {
      id: base.insumoId,
      tipo: base.tipo,
      nombre: unColor && !base.nombre.toLocaleLowerCase("es").includes(color(base) as string) ? `${base.nombre} · ${color(base)}` : base.nombre,
      detalle,
      plan: cantidadConUnidad(plan, base.unidad),
      usado: cantidadConUnidad(usado, base.unidad),
      saldo: cantidadConUnidad(base.saldo, base.unidad),
      alcanza: v.alcanza,
      faltan: v.alcanza ? null : cantidadConUnidad(cantidadAPedir(v.faltan, base.unidad), base.unidad),
      faltanNumero: v.alcanza ? null : cantidadAPedir(v.faltan, base.unidad),
      reservadoPorOtras: comprometida > 0 ? `Otras órdenes ya reservan ${cantidadConUnidad(comprometida, base.unidad)}` : null,
      enCamino: enCamino > 0 ? cantidadConUnidad(enCamino, base.unidad) : null,
      atrasado: atrasado > 0 ? cantidadConUnidad(atrasado, base.unidad) : null,
      conLoQueViene: v.conLoQueViene,
      yaCortada,
      pedidos: base.pedidos.map(textoDePedido),
    };
  }).sort((a, b) => Number(a.tipo === "avio") - Number(b.tipo === "avio"));
}

// ---------- El costo ----------

export type FilaDeCosto = { clave: string; concepto: string; detalle: string | null; estimado: string; real: string; realPendiente: boolean };
export type TablaDeCosto = { filas: FilaDeCosto[]; total: { estimado: string; real: string }; porPrenda: { estimado: string; real: string; realPendiente: boolean } };

/**
 * Estimado contra real por concepto (tela, avíos y cada servicio de afuera), el total y el costo por prenda. Donde todavía no hay real lo dice con su momento («al volver», «al
 * cerrar»), no con un cero. `null` si quien mira no ve los costos. Los montos son los de la base: aquí solo se acomodan.
 */
export function textoCosto(p: OrdenPagina): TablaDeCosto | null {
  if (!p.permisos.veCostos || !p.costos) return null;
  const c = p.costos;
  const filas: FilaDeCosto[] = [];
  const plan = Math.max(p.orden.cantidadPlan, 0);
  const telas = p.insumos.filter((i) => i.tipo === "tela");
  const avios = p.insumos.filter((i) => i.tipo === "avio");

  const pedido = (lista: readonly InsumoPagina[]) => {
    const porUnidad = new Map<string, number>();
    for (const i of lista) porUnidad.set(i.unidad, (porUnidad.get(i.unidad) ?? 0) + i.cantidadPlan);
    return [...porUnidad].map(([u, n]) => cantidadConUnidad(n, u)).join(" + ");
  };
  const nombres = (lista: readonly InsumoPagina[]) => [...new Map(lista.map((i) => [i.nombre.toLocaleLowerCase("es"), i.nombre] as const)).values()].join(", ");
  const usadoDe = (lista: readonly InsumoPagina[]) => lista.some((i) => i.usado !== 0);
  const estimadoDe = (lista: readonly InsumoPagina[], valor: number) => (lista.length > 0 && valor === 0 ? "sin lote recibido" : monto(valor));

  if (telas.length > 0 || c.telaEstimado > 0 || c.telaReal > 0) {
    filas.push({ clave: "tela", concepto: "Tela", detalle: telas.length > 0 ? `${pedido(telas)} de ${nombres(telas)}` : null, estimado: estimadoDe(telas, c.telaEstimado), real: usadoDe(telas) || c.telaReal !== 0 ? monto(c.telaReal) : "aún no", realPendiente: !usadoDe(telas) && c.telaReal === 0 });
  }
  if (avios.length > 0 || c.aviosEstimado > 0 || c.aviosReal > 0) {
    filas.push({ clave: "avios", concepto: "Avíos", detalle: avios.length > 0 ? nombres(avios) : null, estimado: estimadoDe(avios, c.aviosEstimado), real: usadoDe(avios) || c.aviosReal !== 0 ? monto(c.aviosReal) : "aún no", realPendiente: !usadoDe(avios) && c.aviosReal === 0 });
  }
  for (const f of p.fases) {
    if (f.quien !== "servicio") continue;
    const tarifa = f.tarifaPrenda ?? 0;
    const hayVuelta = f.devengado !== null && f.devengado > 0;
    filas.push({
      clave: `servicio-${f.id}`,
      concepto: `${f.nombre} afuera`,
      detalle: `${plan} × ${soles(tarifa)} · ${quienDeFase(f)}${f.fijoOrden > 0 ? ` + ${soles(f.fijoOrden)} fijo` : ""}`,
      estimado: monto(tarifa * plan + f.fijoOrden),
      real: hayVuelta ? monto(f.devengado ?? 0) : "al volver",
      realPendiente: !hayVuelta,
    });
  }
  const cerrada = p.orden.estado === "terminada" && (p.orden.cantidadBuenas ?? 0) > 0;
  return {
    filas,
    total: { estimado: monto(c.totalEstimado), real: monto(c.totalRealHastaHoy) },
    porPrenda: {
      estimado: plan > 0 ? monto(c.totalEstimado / plan) : "—",
      real: cerrada ? monto(c.totalRealHastaHoy / (p.orden.cantidadBuenas ?? 1)) : "al cerrar",
      realPendiente: !cerrada,
    },
  };
}

// ---------- Cuando la orden pide atención ----------

export type CausaRoja = { clave: "entrega_pasada" | "tela_no_llega" | "sin_moverse"; titulo: string; porque: string };

/** El último día (de Lima) en que alguien anotó algo en la orden: abrirla, terminar, deshacer, mandar o recibir. */
function ultimoMovimiento(linea: readonly EventoTiempo[]): string | null {
  let ultimo: string | null = null;
  for (const e of linea) if (ultimo === null || Date.parse(e.cuando) > Date.parse(ultimo)) ultimo = e.cuando;
  return ultimo ? fechaLimaDe(ultimo) : null;
}

/**
 * Las tres causas por las que una orden en proceso pide atención (ADR-0400, «Pantallas» punto 1), cada una con su porqué en una frase para el «¿Por qué?»:
 *  · la entrega ya pasó, · la tela o los avíos que quedan en el estante no alcanzan para lo que falta usar, · hace {DIAS_SIN_MOVERSE} días o más que nadie anota nada
 *  (un servicio con prendas afuera y una fecha prometida que aún no llega no cuenta: está tardando lo que prometió). Vacío = la orden va bien. Una orden cerrada o anulada no pide nada.
 */
export function rojoDeLaOrden(p: OrdenPagina, hoy: string): CausaRoja[] {
  if (p.orden.estado !== "en_proceso") return [];
  const causas: CausaRoja[] = [];
  const entrega = p.orden.fechaEntrega;
  if (entrega && entrega < hoy) {
    const atraso = diasEntreFechas(entrega, hoy);
    causas.push({ clave: "entrega_pasada", titulo: "Entrega pasada", porque: `Era para el ${diaCorto(entrega)} y ya pasó ${atraso === 1 ? "1 día" : `hace ${dias(atraso)}`}.` });
  }
  const faltan = filasDeTela(p.insumos, corteTerminado(p)).filter((f) => !f.alcanza);
  if (faltan.length > 0) {
    const lista = faltan.map((f) => `${f.nombre.toLocaleLowerCase("es")} (faltan ${f.faltan})`);
    const atrasada = faltan.some((f) => f.atrasado !== null);
    causas.push({
      clave: "tela_no_llega",
      titulo: "La tela no alcanza",
      porque: `Lo que queda en el estante, y lo que viene en camino, no cubre lo que falta usar: ${lista.join(", ")}.${atrasada ? " Hay un pedido atrasado que no se cuenta." : ""}`,
    });
  }
  const ultimo = ultimoMovimiento(p.lineaDeTiempo);
  if (ultimo) {
    const parado = diasEntreFechas(ultimo, hoy);
    const esperaServicio = p.fases.some((f) => f.actual && f.quien === "servicio" && f.afuera > 0 && f.fechaPrometida !== null && f.fechaPrometida >= hoy);
    if (parado >= DIAS_SIN_MOVERSE && !esperaServicio) {
      causas.push({ clave: "sin_moverse", titulo: `${parado} días sin moverse`, porque: `Hace ${dias(parado)} que nadie anota nada en esta orden: lo último fue el ${diaCorto(ultimo)}.` });
    }
  }
  return causas;
}

// ---------- La línea de tiempo ----------

export type EntradaDeTiempo = {
  /** Los ids de los eventos que la forman (un «Terminé» de varias tallas son varios avances). */
  ids: string[];
  cuando: string;
  hora: string;
  quien: string | null;
  tipo: TipoEvento;
  titulo: string;
  detalle: string | null;
  cuanto: string | null;
  /** Los avances que «Deshacer» deshace: solo si TODOS los de esta entrada se pueden deshacer. `null`: no hay Deshacer. */
  avanceIds: string[] | null;
  /** La salida o la vuelta que «Anular» anula (su id y cuál es): solo si la base dice que todavía se puede. `null`: no hay Anular. */
  anulable: { id: string; que: "salida" | "vuelta" } | null;
  /** Una salida o una vuelta que ya se anuló: se ve apagada, con su chip. */
  anulada: boolean;
};

export type DiaDeTiempo = { dia: string; etiqueta: string; hoy: boolean; entradas: EntradaDeTiempo[] };

/** Dos avances de una misma anotación se escriben con microsegundos de diferencia: hasta este margen son «lo que se anotó de una vez». */
const MARGEN_MS = 1500;

function etiquetaDelDia(dia: string, hoy: string): string {
  const p = partesDeFecha(dia);
  const largo = p ? `${DIAS_LARGOS[p.semana]} ${p.dia} de ${MESES_LARGOS[p.mes]}` : dia;
  const atras = diasEntreFechas(dia, hoy);
  if (atras === 0) return `Hoy · ${largo}`;
  if (atras === 1) return `Ayer · ${largo}`;
  return largo.charAt(0).toLocaleUpperCase("es") + largo.slice(1);
}

/** «Negro 30 · Caqui 20» (por color) o, con un solo color, «S 12 · M 8» (por talla): lo que se anotó de una vez, compacto. */
function resumenPorColor(eventos: readonly EventoTiempo[], lineas: readonly LineaPagina[]): string | null {
  const porId = new Map(lineas.map((l) => [l.varianteId, l] as const));
  const porColor = new Map<string, number>();
  const porTalla = new Map<string, number>();
  for (const e of eventos) {
    const l = e.varianteId ? porId.get(e.varianteId) : undefined;
    if (!l) return null;
    porColor.set(l.colorNombre ?? "Sin color", (porColor.get(l.colorNombre ?? "Sin color") ?? 0) + e.cantidad);
    porTalla.set(l.talla ?? "Única", (porTalla.get(l.talla ?? "Única") ?? 0) + e.cantidad);
  }
  const mapa = porColor.size > 1 ? porColor : porTalla.size > 1 ? porTalla : null;
  if (!mapa) return null;
  // En el orden en que la orden los lista (por color, y por talla de menor a mayor), no en el de las anotaciones.
  const orden = porColor.size > 1 ? lineas.map((l) => l.colorNombre ?? "Sin color") : [...new Set(lineas.map((l) => l.talla ?? "Única"))].sort(compararTallas);
  return [...mapa]
    .sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]))
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");
}

/**
 * La línea de tiempo agrupada por día (del más reciente al más viejo) y con lo que se anotó de una vez junto: un «Terminé» de varias tallas es UNA entrada, con su resumen por color
 * y un solo «Deshacer» si todos sus avances todavía se pueden deshacer. Salida, Vuelta y apertura van como los dice la base.
 */
export function lineaDeTiempoAgrupada(p: OrdenPagina, hoy: string): DiaDeTiempo[] {
  const ordenados = [...p.lineaDeTiempo].sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando));
  const grupos: EventoTiempo[][] = [];
  for (const e of ordenados) {
    const previo = grupos[grupos.length - 1];
    const ref = previo?.[0];
    const mismo = ref && (e.tipo === "avance" || e.tipo === "deshacer") && ref.tipo === e.tipo && ref.faseClave === e.faseClave && ref.quienNombre === e.quienNombre && Math.abs(Date.parse(ref.cuando) - Date.parse(e.cuando)) <= MARGEN_MS;
    if (mismo) previo.push(e);
    else grupos.push([e]);
  }
  const dias_: DiaDeTiempo[] = [];
  for (const g of grupos) {
    const e = g[0];
    const total = g.reduce((s, x) => s + x.cantidad, 0);
    const nombreFase = e.faseNombre ?? "";
    let titulo: string;
    let detalle: string | null = e.detalle;
    let cuanto: string | null = null;
    if (e.tipo === "apertura") titulo = "Abrió la orden";
    else if (e.tipo === "avance" || e.tipo === "deshacer") {
      titulo = `${e.tipo === "avance" ? "Terminó" : "Deshizo"} ${nombreFase}`;
      cuanto = cuantas(total, "prenda", "prendas");
      const resumen = g.length > 1 ? resumenPorColor(g, p.lineas) : null;
      const nota = g.map((x) => x.nota).find((n): n is string => n !== null) ?? null;
      detalle = g.length > 1 ? [resumen, nota].filter(Boolean).join(" · ") || null : (e.detalle ?? null);
    } else if (e.tipo === "marca") {
      titulo = `Marcó ${nombreFase} como hecho`;
      detalle = e.nota;
    } else if (e.tipo === "desmarca") titulo = `Deshizo la marca de ${nombreFase}`;
    else if (e.tipo === "salida") titulo = `Salida de ${nombreFase}`;
    else if (e.tipo === "anulacion") {
      titulo = `Anuló la ${e.anula ?? "anotación"} de ${nombreFase}`;
      cuanto = e.anula === "vuelta" ? cuantas(e.cantidad, "prenda buena", "prendas buenas") : cuantas(e.cantidad, "prenda", "prendas");
      detalle = e.motivo ? `Por qué: ${e.motivo}` : null;
    } else titulo = `Vuelta de ${nombreFase}`;
    const todosDeshacibles = e.tipo === "avance" && g.every((x) => x.avanceId !== null);
    const entrada: EntradaDeTiempo = {
      ids: g.map((x) => x.id),
      cuando: e.cuando,
      hora: horaLima(e.cuando),
      quien: e.quienNombre,
      tipo: e.tipo,
      titulo,
      detalle,
      cuanto,
      avanceIds: todosDeshacibles ? g.map((x) => x.avanceId as string) : null,
      anulable: (e.tipo === "salida" || e.tipo === "vuelta") && e.anulable && !e.anulada ? { id: e.id, que: e.tipo } : null,
      anulada: (e.tipo === "salida" || e.tipo === "vuelta") && e.anulada,
    };
    const dia = fechaLimaDe(e.cuando);
    const ultimo = dias_[dias_.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.entradas.push(entrada);
    else dias_.push({ dia, etiqueta: etiquetaDelDia(dia, hoy), hoy: dia === hoy, entradas: [entrada] });
  }
  return dias_;
}

/**
 * Los avances que se anotaron después de `antes` en una fase y que todavía se pueden deshacer: los ids que «Deshacer» del aviso tiene que deshacer. `registrar_avance` no devuelve los
 * ids de lo que escribió, así que se leen de la línea de tiempo recién traída y se restan los que ya estaban.
 */
export function avancesNuevos(antes: readonly EventoTiempo[], despues: readonly EventoTiempo[], fase: FaseClave): string[] {
  const conocidos = new Set(antes.map((e) => e.id));
  return despues.flatMap((e) => (e.tipo === "avance" && e.faseClave === fase && e.avanceId !== null && !conocidos.has(e.id) ? [e.avanceId] : []));
}

/** El texto del aviso de éxito: «Terminaste 120 prendas de Corte». */
export function textoTermine(total: number, faseNombre: string): string {
  return `Terminaste ${cuantas(total, "prenda", "prendas")} de ${faseNombre}`;
}

// ---------- Salida y Vuelta de un servicio (ADR-0400, decisión 4; actividad 4) ----------
// Lo que sale a un servicio se anota como «Salida» y lo que vuelve como «Vuelta», por talla y color. Nada de esto decide algo nuevo: los topes y los motivos son los de
// `registrar_salida` y `registrar_vuelta` (20261014155000), con sus mismos hints; `lib/orden-pagina-reglas.test.ts` lee la migración y exige que coincidan.

/** Lo que todavía se puede mandar a un servicio, por talla y color (solo las que tienen algo): lo que entró a la fase menos lo que ya salió. Es el valor de fábrica de «Salida». */
export function cantidadesQuePuedenSalir(f: FasePagina): Record<string, number> {
  const salida: Record<string, number> = {};
  for (const v of f.porVariante) {
    const n = Math.max(v.entrada - v.salieron, 0);
    if (n > 0) salida[v.varianteId] = n;
  }
  return salida;
}

/** Lo que está afuera con el servicio, por talla y color (solo las que tienen algo): lo que salió menos lo que ya volvió, buenas, segundas o faltantes. Es el valor de fábrica de «Vuelta». */
export function cantidadesAfuera(f: FasePagina): Record<string, number> {
  const afuera: Record<string, number> = {};
  for (const v of f.porVariante) if (v.afuera > 0) afuera[v.varianteId] = v.afuera;
  return afuera;
}

/** La misma lectura de una celda que `lineasDeModeloExistente`: entero, de cero en adelante; lo vacío o ilegible es cero. */
const celdaEntera = (texto: string | undefined): number => Math.max(Math.floor(Number(texto) || 0), 0);

export type ProblemaDeSalida = { hint: "salida_sin_lineas" | "salida_excede"; texto: string };

/** Lo que la base rechazaría de una Salida: ninguna talla y color con algo, o más de lo que puede salir. Una frase por talla y color que se pasa. */
export function problemasDeSalida(f: FasePagina, cantidades: Readonly<Record<string, string>>, nombreDe: (varianteId: string) => string): ProblemaDeSalida[] {
  const tope = cantidadesQuePuedenSalir(f);
  const escritas = f.porVariante.map((v) => ({ id: v.varianteId, n: celdaEntera(cantidades[v.varianteId]) })).filter((l) => l.n > 0);
  if (escritas.length === 0) return [{ hint: "salida_sin_lineas", texto: "Escribe cuántas mandas en al menos una talla y color." }];
  const problemas: ProblemaDeSalida[] = [];
  for (const l of escritas) {
    const puede = tope[l.id] ?? 0;
    if (l.n > puede) problemas.push({ hint: "salida_excede", texto: puede > 0 ? `De ${nombreDe(l.id)} solo puedes mandar ${puede}: escribiste ${l.n}.` : `De ${nombreDe(l.id)} no hay nada listo para mandar.` });
  }
  return problemas;
}

/** Las líneas de `registrar_salida`: las tallas y colores con algo mayor que cero, en el orden de la fase. */
export function lineasDeSalida(f: FasePagina, cantidades: Readonly<Record<string, string>>): { variante_id: string; cantidad: number }[] {
  return f.porVariante.map((v) => ({ variante_id: v.varianteId, cantidad: celdaEntera(cantidades[v.varianteId]) })).filter((l) => l.cantidad > 0);
}

/** Lo que se anota de una Vuelta, por talla y color: las que volvieron buenas, las segundas y las que faltaron (cada tabla, sus celdas como texto). */
export type CantidadesDeVuelta = { buenas: Readonly<Record<string, string>>; segundas: Readonly<Record<string, string>>; faltantes: Readonly<Record<string, string>> };

export type LineaDeVuelta = { variante_id: string; buenas: number; segundas: number; faltantes: number; motivo: string | null };

/** Las líneas de `registrar_vuelta`: solo las tallas y colores con algo; el «qué pasó» viaja en las que traen segundas o faltantes (la base lo pide por línea). */
export function lineasDeVuelta(f: FasePagina, c: CantidadesDeVuelta, motivo: string): LineaDeVuelta[] {
  const que = motivo.trim();
  return f.porVariante
    .map((v) => ({ variante_id: v.varianteId, buenas: celdaEntera(c.buenas[v.varianteId]), segundas: celdaEntera(c.segundas[v.varianteId]), faltantes: celdaEntera(c.faltantes[v.varianteId]) }))
    .filter((l) => l.buenas + l.segundas + l.faltantes > 0)
    .map((l) => ({ ...l, motivo: l.segundas + l.faltantes > 0 && que !== "" ? que : null }));
}

export type ProblemaDeVuelta = { hint: "vuelta_sin_lineas" | "vuelta_excede" | "vuelta_sin_motivo"; texto: string };

/** Lo que la base rechazaría de una Vuelta: nada escrito, más de lo que está afuera (por talla y color) o segundas y faltantes sin decir qué pasó. */
export function problemasDeVuelta(f: FasePagina, c: CantidadesDeVuelta, motivo: string, nombreDe: (varianteId: string) => string): ProblemaDeVuelta[] {
  const afuera = cantidadesAfuera(f);
  const lineas = lineasDeVuelta(f, c, motivo);
  if (lineas.length === 0) return [{ hint: "vuelta_sin_lineas", texto: "Escribe cuántas volvieron en al menos una talla y color." }];
  const problemas: ProblemaDeVuelta[] = [];
  for (const l of lineas) {
    const hay = afuera[l.variante_id] ?? 0;
    const suma = l.buenas + l.segundas + l.faltantes;
    if (suma > hay) problemas.push({ hint: "vuelta_excede", texto: hay > 0 ? `De ${nombreDe(l.variante_id)} hay ${hay} afuera: anotaste ${suma}.` : `De ${nombreDe(l.variante_id)} no hay nada afuera.` });
  }
  if (lineas.some((l) => l.segundas + l.faltantes > 0) && motivo.trim() === "") problemas.push({ hint: "vuelta_sin_motivo", texto: "Cuéntanos qué pasó con lo que no volvió bueno." });
  return problemas;
}

/** Cuántas quedan afuera después de lo que se está anotando (nunca negativo). */
export function quedanAfuera(f: FasePagina, c: CantidadesDeVuelta): number {
  const anotadas = f.porVariante.reduce((s, v) => s + celdaEntera(c.buenas[v.varianteId]) + celdaEntera(c.segundas[v.varianteId]) + celdaEntera(c.faltantes[v.varianteId]), 0);
  return Math.max(Object.values(cantidadesAfuera(f)).reduce((a, b) => a + b, 0) - anotadas, 0);
}

/**
 * Las buenas de una celda al anotar segundas o faltantes en ella. «Volvieron buenas» nace con TODO lo que está afuera: al decir que 3 faltaron, esas 3 dejan de ser buenas. Solo se
 * ajusta una celda que estaba «cuadrada» (buenas + segundas + faltantes = lo que hay afuera); si la persona ya había dejado prendas sin volver, su número no se toca.
 */
export function buenasAlAnotarExcepcion(o: { afuera: number; buenas: string; segundas: string; faltantes: string }, nuevo: { segundas?: string; faltantes?: string }): string {
  const cuadrada = celdaEntera(o.buenas) + celdaEntera(o.segundas) + celdaEntera(o.faltantes) === o.afuera;
  if (!cuadrada) return o.buenas;
  const segundas = celdaEntera(nuevo.segundas ?? o.segundas);
  const faltantes = celdaEntera(nuevo.faltantes ?? o.faltantes);
  return String(Math.max(o.afuera - segundas - faltantes, 0));
}

/** El texto del aviso de una Salida: «Mandaste 48 prendas a Confecciones del Norte». */
export function textoMandaste(total: number, servicio: string): string {
  return `Mandaste ${cuantas(total, "prenda", "prendas")} a ${servicio}`;
}

/** El texto del aviso de una Vuelta: «Volvieron 40 prendas buenas de Confecciones del Norte». Sin buenas, dice lo que sí se anotó. */
export function textoVolvieron(o: { buenas: number; segundas: number; faltantes: number }, servicio: string): string {
  if (o.buenas > 0) return `Volvieron ${cuantas(o.buenas, "prenda buena", "prendas buenas")} de ${servicio}`;
  return `Anotaste lo que pasó con las prendas de ${servicio}`;
}

/** El renglón de abajo del aviso de una Vuelta: lo que no volvió bueno y, solo a quien ve costos, lo que se le debe al servicio por esa fase hasta ahora. */
export function detalleDeVuelta(o: { segundas: number; faltantes: number; devengado: number | null; numeroTexto: string }): string {
  const partes = [o.numeroTexto];
  if (o.segundas > 0) partes.push(cuantas(o.segundas, "segunda", "segundas"));
  if (o.faltantes > 0) partes.push(`${cuantas(o.faltantes, "faltó", "faltaron")}: queda anotado por qué`);
  if (o.devengado !== null && o.devengado > 0) partes.push(`se le deben ${soles(o.devengado)} hasta ahora`);
  return partes.join(" · ");
}

/** Lo que se le debe al servicio por la fase tras anotar, leído de la respuesta de `registrar_vuelta` (las fases con su estado). `null` si no viene o no es un número. */
export function devengadoDeLaRespuesta(respuesta: unknown, faseId: string): number | null {
  if (!Array.isArray(respuesta)) return null;
  const fase = respuesta.find((f): f is { id: string; devengado?: unknown } => typeof f === "object" && f !== null && (f as { id?: unknown }).id === faseId);
  const n = Number(fase?.devengado);
  return fase && fase.devengado !== null && fase.devengado !== undefined && Number.isFinite(n) ? n : null;
}

// ---------- Anular una salida o una vuelta (ADR-0400, actividad 4b; Felipe, 2026-10-15) ----------

/** El tope del «por qué» de una anulación (la base no lo limita; la hoja lo corta como el «qué pasó» de la Vuelta). */
export const MAX_MOTIVO_ANULACION = 200;

/** Lo que `anular_salida` / `anular_vuelta` rechazarían del motivo (hint `anular_sin_motivo`); `null` si lo aceptarían. */
export function problemaDeAnulacion(motivo: string): string | null {
  return motivo.trim() === "" ? "Cuéntanos por qué se anula." : null;
}

/** El nombre de la RPC que anula, según lo que se anula. */
export function rpcDeAnulacion(que: "salida" | "vuelta"): string {
  return que === "salida" ? RPC_ANULAR_SALIDA : RPC_ANULAR_VUELTA;
}

/** La frase de la hoja: lo que pasa con las prendas al anular, sin jerga. */
export function textoQuePasaAlAnular(que: "salida" | "vuelta"): string {
  return que === "salida"
    ? "Las prendas dejan de contarse como enviadas y esa salida se puede anotar de nuevo. Lo anotado no se borra: queda en la línea de tiempo."
    : "Las prendas buenas dejan de contarse como hechas y vuelven a estar afuera con el servicio. Lo anotado no se borra: queda en la línea de tiempo.";
}

/** El texto del aviso de éxito: «Anulaste la salida». */
export function textoAnulaste(que: "salida" | "vuelta"): string {
  return `Anulaste la ${que}`;
}

// ---------- Pasar la orden al stock, anularla y revertirla (ADR-0400, actividad 6; OK de Felipe, 2026-10-15) ----------
// Nada de esto decide algo nuevo: los candados y las frases son los de `cerrar_produccion` y `anular_produccion` (20261014160000), con sus mismos hints; `lib/orden-pagina-reglas.test.ts`
// lee la migración y exige que coincidan. Solo las BUENAS entran al stock: las segundas y las faltantes quedan anotadas en la Vuelta y su costo lo reparten las buenas.

export type PrendasAfuera = { fase: FasePagina; servicio: string; n: number };

/** La primera fase de la ruta con prendas todavía en un servicio, o `null` si no hay ninguna afuera. Con prendas afuera no se pasa al stock ni se anula (`cierre_con_prendas_afuera`, `anular_con_prendas_afuera`). */
export function prendasAfuera(fases: readonly FasePagina[]): PrendasAfuera | null {
  const f = [...fases].sort((a, b) => a.secuencia - b.secuencia).find((x) => x.afuera > 0);
  return f ? { fase: f, servicio: f.proveedorNombre ?? "un servicio", n: f.afuera } : null;
}

/** La frase de la base cuando hay prendas afuera: «Hay 20 prendas de Costura afuera con X: anota primero su vuelta (o los faltantes, con su motivo)». */
export function textoPrendasAfuera(a: PrendasAfuera): string {
  return `Hay ${cuantas(a.n, "prenda", "prendas")} de ${a.fase.nombre} afuera con ${a.servicio}: anota primero su vuelta (o los faltantes, con su motivo).`;
}

/** Lo terminado en la última fase, por talla y color (solo las que tienen algo): es lo máximo que puede entrar al stock y el valor de fábrica de «Pasar al stock». */
export function cantidadesTerminadas(fases: readonly FasePagina[]): Record<string, number> {
  const ultima = [...fases].sort((a, b) => a.secuencia - b.secuencia).at(-1);
  const salida: Record<string, number> = {};
  for (const v of ultima?.porVariante ?? []) if (v.hechas > 0) salida[v.varianteId] = v.hechas;
  return salida;
}

export function totalDeCierre(cantidades: Readonly<Record<string, string>>): number {
  return Object.values(cantidades).reduce((s, t) => s + celdaEntera(t), 0);
}

export type ProblemaDeCierre = { hint: "cierre_con_prendas_afuera" | "cierre_buenas_exceden" | "cierre_sin_buenas"; texto: string };

/**
 * Lo que la base rechazaría al pasar la orden al stock: prendas todavía afuera, más buenas de una talla y color que las terminadas en la última fase, o ninguna buena. Una frase por cada
 * talla y color que se pasa. `fases` vacío (una orden de antes de las fases) no tiene candado: no se usa esta hoja para esas órdenes.
 */
export function problemasDeCierre(fases: readonly FasePagina[], lineas: readonly LineaPagina[], cantidades: Readonly<Record<string, string>>, nombreDe: (varianteId: string) => string): ProblemaDeCierre[] {
  const afuera = prendasAfuera(fases);
  if (afuera) return [{ hint: "cierre_con_prendas_afuera", texto: textoPrendasAfuera(afuera) }];
  const tope = cantidadesTerminadas(fases);
  const ultima = [...fases].sort((a, b) => a.secuencia - b.secuencia).at(-1);
  const problemas: ProblemaDeCierre[] = [];
  for (const l of lineas) {
    const n = celdaEntera(cantidades[l.varianteId]);
    const puede = tope[l.varianteId] ?? 0;
    if (n > puede) problemas.push({ hint: "cierre_buenas_exceden", texto: `No puedes pasar al stock ${n} de ${nombreDe(l.varianteId)}: en ${ultima?.nombre ?? "la última fase"} se terminaron ${puede}.` });
  }
  if (problemas.length === 0 && totalDeCierre(cantidades) === 0) return [{ hint: "cierre_sin_buenas", texto: "No salió ninguna prenda buena: si el lote se perdió, anula la orden en vez de pasarla al stock." }];
  return problemas;
}

/** Las líneas de `cerrar_produccion`: una por talla y color de la orden, las que no se escribieron en cero (así toda línea queda contestada). */
export function lineasDeCierre(lineas: readonly LineaPagina[], cantidades: Readonly<Record<string, string>>): { variante_id: string; cantidad: number }[] {
  return lineas.map((l) => ({ variante_id: l.varianteId, cantidad: celdaEntera(cantidades[l.varianteId]) }));
}

export type ResumenDeCierre = { buenas: number; segundas: number; faltantes: number; costoTotal: number | null; costoPorPrenda: number | null };

/**
 * Lo que se lee en la hoja antes de confirmar: cuántas buenas entran, cuántas segundas y faltantes quedan anotadas sin entrar, y —solo para quien ve los costos del Taller— el costo real
 * hasta hoy repartido entre las buenas (la base lo calcula igual: tela y avíos del libro de insumos y lo devengado por los servicios, entre las buenas).
 */
export function resumenDeCierre(p: Pick<OrdenPagina, "fases" | "costos" | "permisos">, buenas: number): ResumenDeCierre {
  const segundas = p.fases.reduce((s, f) => s + f.segundas, 0);
  const faltantes = p.fases.reduce((s, f) => s + f.faltantes, 0);
  const costoTotal = p.permisos.veCostos && p.costos ? p.costos.totalRealHastaHoy : null;
  return { buenas, segundas, faltantes, costoTotal, costoPorPrenda: costoTotal !== null && buenas > 0 ? Math.round((costoTotal / buenas) * 100) / 100 : null };
}

/** El aviso de éxito: «48 prendas de Pantalón Lía entraron al stock del Taller» (una muestra solo se da por terminada). */
export function textoPasasteAlStock(total: number, referencia: string, esMuestra: boolean): string {
  return esMuestra ? `Muestra ${referencia} terminada` : `${cuantas(total, "prenda", "prendas")} de ${referencia} ${total === 1 ? "entró" : "entraron"} al stock del Taller`;
}

/** La tela y los avíos que vuelven al estante si se anula la orden: lo que ya se usó, una vez por insumo (el libro no sabe de colores: el usado es el mismo en cada fila de un insumo). */
export function insumosPorDevolver(insumos: readonly InsumoPagina[]): { nombre: string; texto: string }[] {
  const porInsumo = new Map<string, InsumoPagina>();
  for (const i of insumos) if (i.usado > (porInsumo.get(i.insumoId)?.usado ?? 0)) porInsumo.set(i.insumoId, i);
  return [...porInsumo.values()].filter((i) => i.usado > 0).map((i) => ({ nombre: i.nombre, texto: cantidadConUnidad(i.usado, i.unidad) }));
}

/** El aviso de éxito de anular: «Orden de Pantalón Lía anulada». */
export function textoAnulasteLaOrden(referencia: string): string {
  return `Orden de ${referencia} anulada`;
}

/** Lo que dice la hoja de revertir: qué pasa con el stock según lo que se cerró (una muestra no tocó el stock). */
export function textoQuePasaAlRevertir(o: { inventariadoEn: string | null; cantidadBuenas: number | null }): string {
  return o.inventariadoEn
    ? `Las ${o.cantidadBuenas ?? 0} prendas salen del stock del Taller (queda un movimiento de reversión: la entrada original no se borra) y la orden vuelve a estar en proceso, para corregir las buenas o los costos.`
    : "La muestra vuelve a estar en proceso. No había stock que devolver.";
}
