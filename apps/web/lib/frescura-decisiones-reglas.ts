import { compararInstantes, type EventoPiso } from "./inventario-exposicion";
import { clavePrendaDe } from "./prenda-clave";
import type { FrescuraPrenda, FrescuraSede, Sugerencia, VaraCategoria } from "./frescura-reglas";

// Frescura del piso, paso 4b (ADR-0208, «Actualización 2026-09-29 — Ya decidí»): LO QUE PASA DESPUÉS DE DECIDIR. La base
// guarda solo el HECHO (`retail.frescura_decisiones`: qué, quién, cuándo, por cuántos días, sobre qué traslado; de solo
// agregar). Todo lo demás se calcula aquí, al leer, con la misma lectura del piso que ya tiene la pantalla:
//   · si la decisión SIGUE vigente (`terminaLinea`),
//   · si SIRVIÓ (`medirLinea`), y qué se sugiere después (`sugerenciasConHistoria`),
//   · y «Por decidir», que pasa a ser «quieta y sin decisión vigente» (`aplicarDecisiones`, el ÚNICO lugar que lo decide).
// Un resultado guardado mentiría (una venta anulada después cambia el hecho) y haría falta un proceso que corra solo.
//
// Sin React ni supabase. Importa de `frescura-reglas.ts` SOLO tipos: la dirección de la dependencia es reglas → decisiones
// (reglas llama a `aplicarDecisiones` al armar cada sede), nunca al revés.

// ---------------------------------------------------------------------------
// Constantes del negocio
// ---------------------------------------------------------------------------

/** «La cambié de lugar» es una prueba de 7 días (la escalera de ADR-0208, decisión 11). Se congela en la fila al decidir. */
export const PLAZO_CAMBIE_LUGAR_DIAS = 7;
/** «La trasladé» se mira 14 días en la tienda de origen (y 7 días en la de destino, desde que se recibe). */
export const PLAZO_TRASLADO_DIAS = 14;
/** El plazo de un compromiso («hasta agotar», «la rebajé») es la rotación de su categoría en su sede, con este tope. La base exige 1 a 30. */
export const PLAZO_MAXIMO_DIAS = 30;
/** Sin una comparación sólida ni en la sede ni en CAYLA: 15 días (respuesta P1 de Felipe, 2026-09-28). */
export const PLAZO_SIN_REFERENCIA_DIAS = 15;
/** De un compromiso se dice cómo va desde el día 7 (antes es «en curso» sin veredicto). */
export const DIAS_PARA_VEREDICTO_DE_COMPROMISO = 7;
/** Después de que «cambiarla de lugar» no alcanzó, no se vuelve a sugerir durante estos días. */
export const DIAS_SIN_REPETIR_CAMBIO = 30;
/** «Este mes»: las decisiones que terminaron en estos días entran a la suma por acción. */
export const DIAS_DEL_RESUMEN = 30;
/** Misma regla y mismo número que `RAPIDEZ_MIN_EVIDENCIA` de frescura-reglas (vendidas + esperadas): una prueba los compara. */
export const EVIDENCIA_MINIMA = 1;
/** Cuántas líneas anteriores se llevan a la hoja de una prenda (la más reciente primero). */
export const LINEAS_DE_HISTORIA = 6;

const MS_DIA = 86_400_000;
const MS_LIMA = 5 * 3_600_000; // Lima va 5 horas detrás de UTC todo el año.
const ms = (ts: string) => Date.parse(ts);

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const ACCIONES_DECISION = ["cambie_lugar", "hasta_agotar", "traslade", "rebaje"] as const;
export type AccionDecision = (typeof ACCIONES_DECISION)[number];
export type AccionRenglon = AccionDecision | "anulacion";

/** El traslado enlazado a un «La trasladé», tal como lo lee `fn_frescura_decisiones`. */
export type TrasladoDeDecision = {
  numero: number;
  destinoId: string;
  destino: string;
  estado: string;
  anulado: boolean;
  /** Cuándo ENTRÓ al stock de la tienda destino (null: todavía no llega). */
  recibidoEn: string | null;
  unidades: number;
};

/** Una venta de la prenda desde una rebaja: cuándo, cuántas y el motivo del descuento (null = sin descuento). */
export type VentaDeRebaje = { ts: string; cantidad: number; motivo: string | null };

export type RenglonCrudo = {
  id: string;
  productoId: string;
  colorCodigo: string | null;
  accion: AccionRenglon;
  anteriorId: string | null;
  anteriorAccion: AccionRenglon | null;
  transferenciaId: string | null;
  nota: string | null;
  plazoDias: number | null;
  creadoEn: string;
  persona: string | null;
  traslado: TrasladoDeDecision | null;
  ventas: VentaDeRebaje[] | null;
};

/** Un traslado de los últimos 14 días que sale de la sede: lo que «La trasladé» ofrece elegir. */
export type TrasladoReciente = {
  id: string;
  numero: number;
  destinoId: string;
  destino: string;
  estado: string;
  creadoEn: string;
  prendas: { productoId: string; colorCodigo: string | null; unidades: number }[];
};

export type LecturaDecisiones = { ahora: string; renglones: RenglonCrudo[]; trasladosRecientes: TrasladoReciente[] };

/** Cómo terminó una decisión. `null` = sigue vigente. */
export type FinDecision = "vencio" | "llego_mercaderia" | "termino_temporada" | "traslado_anulado" | "anulada" | "cambiada";

export type Veredicto =
  | "sirvio"
  | "no_alcanzo"
  | "aun_no_se_sabe"
  | "sin_control"
  | "no_estuvo_colgada"
  | "se_mide_en_destino"
  | "aun_no_llega";

export type Resultado = {
  veredicto: Veredicto;
  /** La ventana medida y si sigue corriendo (aún no llega a su fecha) o ya cerró. */
  desde: string;
  hasta: string;
  enCurso: boolean;
  /** Qué acortó la ventana antes de su fecha (una llegada de mercadería, el fin de su temporada, otra decisión, el cuadre
   *  del piso de la tienda…). */
  cortadaPor: "llegada" | "temporada" | "otra_decision" | "traslado_anulado" | "cuadre" | null;
  /** Lo que vendió ella en la ventana (lo apartado cuenta como vendido). */
  suyas: number;
  /** Lo que habría vendido al ritmo de las demás de su categoría, con sus mismos días colgada. */
  esperadas: number;
  /** Lo que vendieron las demás en esos días. */
  ventasDelControl: number;
  /** Cuántas prendas de la categoría sirvieron de comparación. */
  prendasDeControl: number;
  /** «La rebajé»: de lo vendido, cuánto fue con descuento de liquidación, con descuento de campaña o sin descuento. */
  rebaje: { conLiquidacion: number; deCampana: number; sinDescuento: number } | null;
  /** «La trasladé»: dónde se midió (la tienda destino). */
  enSede: string | null;
};

export type LineaDecision = {
  id: string;
  accion: AccionRenglon;
  creadoEn: string;
  persona: string | null;
  nota: string | null;
  plazoDias: number | null;
  traslado: TrasladoDeDecision | null;
  /** 00:00 de Lima del día en que vence (null en una anulación). */
  vence: string | null;
  fin: FinDecision | null;
  finEl: string | null;
  resultado: Resultado | null;
};

export type DecisionDePrenda = {
  /** La última línea de su libreta (puede ser una anulación). */
  actual: LineaDecision;
  /** ¿Cuenta como decidida ahora? (la última línea es una decisión y no terminó) */
  vigente: boolean;
  /** Las líneas anteriores, la más reciente primero. */
  historia: LineaDecision[];
};

/** Los números de una acción en la sede, de las decisiones que terminaron este mes (la nota al pie y «Las N tiendas»). */
export type ResumenDeAccion = { terminadas: number; sirvieron: number; noAlcanzaron: number; aunNoSeSabe: number; suyas: number; esperadas: number };
export type ResumenDecisiones = Record<AccionDecision, ResumenDeAccion>;

/** Cuánto vendió y cuánto estuvo colgada (unidad·segundo LIBRE en el piso) una prenda entre dos instantes. */
export type Exposicion = { unidadSegundos: number; vendidas: number };
/** Lo que `analizarSede` sabe medir de cada prenda: null si no se mide (clásico, dudosa, o no está en la sede). */
export type ExposicionDe = (clave: string, desde: string, hasta: string) => Exposicion | null;

// ---------------------------------------------------------------------------
// Lectura de lo que devuelve la base (dato externo: se valida, no se confía en el tipo)
// ---------------------------------------------------------------------------

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const esFecha = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const esAccion = (v: unknown): v is AccionRenglon => v === "anulacion" || (ACCIONES_DECISION as readonly unknown[]).includes(v);

function leerTraslado(v: unknown): TrasladoDeDecision | null {
  if (!esObjeto(v)) return null;
  const numeroT = numero(v.numero);
  const destinoId = texto(v.destino_id);
  if (numeroT === null || destinoId === null) return null;
  return {
    numero: numeroT,
    destinoId,
    destino: texto(v.destino) ?? "otra tienda",
    estado: texto(v.estado) ?? "",
    anulado: v.anulado === true,
    recibidoEn: esFecha(v.recibido_en) ? v.recibido_en : null,
    unidades: numero(v.unidades) ?? 0,
  };
}

function leerVentas(v: unknown): VentaDeRebaje[] | null {
  if (!Array.isArray(v)) return null;
  const ventas: VentaDeRebaje[] = [];
  for (const fila of v) {
    if (!Array.isArray(fila) || !esFecha(fila[0])) continue;
    const cantidad = numero(fila[1]);
    if (cantidad === null || cantidad <= 0) continue;
    ventas.push({ ts: fila[0], cantidad, motivo: typeof fila[2] === "string" && fila[2] !== "" ? fila[2] : null });
  }
  return ventas;
}

function leerRenglon(v: unknown): RenglonCrudo | null {
  if (!esObjeto(v)) return null;
  const id = texto(v.id);
  const productoId = texto(v.producto_id);
  if (id === null || productoId === null || !esAccion(v.accion) || !esFecha(v.creado_en)) return null;
  return {
    id,
    productoId,
    colorCodigo: texto(v.color_codigo),
    accion: v.accion,
    anteriorId: texto(v.anterior_id),
    anteriorAccion: esAccion(v.anterior_accion) ? v.anterior_accion : null,
    transferenciaId: texto(v.transferencia_id),
    nota: texto(v.nota)?.trim() || null,
    plazoDias: numero(v.plazo_dias),
    creadoEn: v.creado_en,
    persona: texto(v.persona),
    traslado: leerTraslado(v.traslado),
    ventas: leerVentas(v.ventas),
  };
}

function leerTrasladoReciente(v: unknown): TrasladoReciente | null {
  if (!esObjeto(v)) return null;
  const id = texto(v.id);
  const numeroT = numero(v.numero);
  const destinoId = texto(v.destino_id);
  if (id === null || numeroT === null || destinoId === null || !esFecha(v.creado_en)) return null;
  const prendas: TrasladoReciente["prendas"] = [];
  for (const p of Array.isArray(v.prendas) ? v.prendas : []) {
    if (!esObjeto(p)) continue;
    const productoId = texto(p.producto_id);
    if (productoId === null) continue;
    prendas.push({ productoId, colorCodigo: texto(p.color_codigo), unidades: numero(p.unidades) ?? 0 });
  }
  return { id, numero: numeroT, destinoId, destino: texto(v.destino) ?? "otra tienda", estado: texto(v.estado) ?? "", creadoEn: v.creado_en, prendas };
}

/**
 * Lo que devuelve `retail.fn_frescura_decisiones`. Null si no tiene la forma: quien llama la trata como «no se pudo leer».
 * Un renglón con forma rara se descarta (mejor una libreta con una línea menos que un error): pero si se descarta uno, la
 * pantalla podría responderle a una línea equivocada y la base lo dirá con un PT409.
 */
export function leerDecisiones(v: unknown): LecturaDecisiones | null {
  if (!esObjeto(v) || !esFecha(v.ahora) || !Array.isArray(v.decisiones)) return null;
  const renglones = v.decisiones.map(leerRenglon).filter((r): r is RenglonCrudo => r !== null);
  const traslados = (Array.isArray(v.traslados_recientes) ? v.traslados_recientes : []).map(leerTrasladoReciente).filter((t): t is TrasladoReciente => t !== null);
  return { ahora: v.ahora, renglones, trasladosRecientes: traslados };
}

// ---------------------------------------------------------------------------
// Fechas: días de calendario de Lima
// ---------------------------------------------------------------------------

/**
 * El instante (ISO, UTC) en que vence una decisión: las 00:00 de Lima del día `plazoDias` después del día en que se decidió.
 * El día de la decisión es el día 1, así que decidida un martes a las 23:50 con 7 días vence el martes siguiente a las 00:00:
 * la persona lee «el martes 6», no «en 7 días y 10 minutos». Lima no tiene horario de verano.
 */
export function finDePlazo(creadoEn: string, plazoDias: number): string {
  const enLima = new Date(ms(creadoEn) - MS_LIMA);
  const medianoche = Date.UTC(enLima.getUTCFullYear(), enLima.getUTCMonth(), enLima.getUTCDate());
  return new Date(medianoche + plazoDias * MS_DIA + MS_LIMA).toISOString();
}

// ---------------------------------------------------------------------------
// El plazo de una decisión nueva
// ---------------------------------------------------------------------------

/** La rotación de una categoría, como la muestra la pantalla: el corte P50 (segundos) y qué tanto creerle. */
export type Rotacion = Pick<VaraCategoria, "cortes" | "nivel"> | undefined | null;

const dias = (segundos: number) => Math.max(1, Math.round(segundos / 86_400));

/**
 * Cuántos días vale un compromiso («la dejo hasta agotar», «la rebajé»): los días en que se vende la mitad de las de su
 * categoría en su sede, con tope de 30 (Felipe, 2026-09-28: «si en jeans es 15 días, le doy 15 días más»). Solo con una
 * comparación SÓLIDA (20 ventas o más); si la sede no la tiene, la de CAYLA (la ve solo el líder); si tampoco, 15 días.
 * Se calcula al decidir y se congela en la fila: si se recalculara cada día, «el martes 6 te digo» se movería solo.
 */
export function plazoDeCompromiso(sede: Rotacion, cayla: Rotacion): number {
  return origenDelPlazo(sede, cayla).dias;
}

/** El plazo de un compromiso y de dónde sale (para que la pantalla diga si es un cálculo o el valor de partida). */
export function origenDelPlazo(sede: Rotacion, cayla: Rotacion): { dias: number; origen: "sede" | "cayla" | "sin_referencia" } {
  if (sede && sede.nivel === "solido" && sede.cortes.p50 !== null) return { dias: Math.min(PLAZO_MAXIMO_DIAS, dias(sede.cortes.p50)), origen: "sede" };
  if (cayla && cayla.nivel === "solido" && cayla.cortes.p50 !== null) return { dias: Math.min(PLAZO_MAXIMO_DIAS, dias(cayla.cortes.p50)), origen: "cayla" };
  return { dias: PLAZO_SIN_REFERENCIA_DIAS, origen: "sin_referencia" };
}

/** El plazo que se manda al anotar cada acción. */
export function plazoDeAccion(accion: AccionDecision, sede: Rotacion, cayla: Rotacion): number {
  if (accion === "cambie_lugar") return PLAZO_CAMBIE_LUGAR_DIAS;
  if (accion === "traslade") return PLAZO_TRASLADO_DIAS;
  return plazoDeCompromiso(sede, cayla);
}

// ---------------------------------------------------------------------------
// Las libretas
// ---------------------------------------------------------------------------

export const claveDeRenglon = (r: Pick<RenglonCrudo, "productoId" | "colorCodigo">): string => clavePrendaDe(r.productoId, r.colorCodigo, null);

/** Una libreta en orden: la más vieja primero. La última línea es la que la pantalla responde (`anteriorId` de lo que se anote). */
export type Libreta = { clave: string; lineas: RenglonCrudo[] };

/**
 * Junta los renglones por prenda y los ordena por la CADENA (cada uno responde al anterior), no por el reloj: dos renglones
 * del mismo segundo no se confunden. Si la lectura no trae el principio de una libreta (una línea vieja quedó afuera de la
 * ventana), empieza donde haya el primer renglón cuyo anterior no está en la lectura.
 */
export function armarLibretas(renglones: readonly RenglonCrudo[]): Map<string, Libreta> {
  const porPrenda = new Map<string, RenglonCrudo[]>();
  for (const r of renglones) {
    const k = claveDeRenglon(r);
    const lista = porPrenda.get(k);
    if (lista) lista.push(r);
    else porPrenda.set(k, [r]);
  }
  const libretas = new Map<string, Libreta>();
  for (const [clave, lista] of porPrenda) {
    const ids = new Set(lista.map((r) => r.id));
    const respuesta = new Map(lista.filter((r) => r.anteriorId !== null && ids.has(r.anteriorId)).map((r) => [r.anteriorId as string, r]));
    // Los renglones que no responden a nadie de esta lectura son puntos de partida; con datos sanos hay uno solo.
    const partidas = lista.filter((r) => r.anteriorId === null || !ids.has(r.anteriorId)).sort((a, b) => compararInstantes(a.creadoEn, b.creadoEn));
    const lineas: RenglonCrudo[] = [];
    const vistos = new Set<string>();
    for (const inicio of partidas) {
      for (let r: RenglonCrudo | undefined = inicio; r && !vistos.has(r.id); r = respuesta.get(r.id)) {
        lineas.push(r);
        vistos.add(r.id);
      }
    }
    libretas.set(clave, { clave, lineas });
  }
  return libretas;
}

// ---------------------------------------------------------------------------
// Vigencia: ¿sigue valiendo?
// ---------------------------------------------------------------------------

/** Lo mínimo que se necesita de una prenda para saber si una decisión sobre ella terminó. */
export type PrendaParaVigencia = Pick<FrescuraPrenda, "ultimaLlegada" | "finEstacion">;

/**
 * Si la línea terminó y por qué. `siguiente`: la línea que la responde, si hay. Terminó cuando:
 *   · otra línea la responde: una anulación («quitaste lo anotado») o una decisión nueva («la cambiaste»);
 *   · llegó su plazo (00:00 de Lima);
 *   · llegó mercadería de ese modelo+color a la sede (lote, producción, carga o traslado recibido; una bajada del almacén no
 *     es una llegada): la decisión era sobre lo que había, no sobre lo nuevo;
 *   · terminó su temporada después de decidir (ADR-0246: al terminar su estación, Frescura avisa);
 *   · el traslado enlazado se anuló.
 * NO termina porque pase de Vigente a Envejecida o a Crítica: es el reloj que avanza, y quien decidió ya lo sabía.
 * Si varias cosas pasaron, manda la que pasó primero.
 */
export function terminaLinea(linea: RenglonCrudo, siguiente: RenglonCrudo | null, prenda: PrendaParaVigencia, ahora: string): { fin: FinDecision; el: string } | null {
  if (linea.accion === "anulacion") return { fin: "anulada", el: linea.creadoEn };
  if (siguiente) return { fin: siguiente.accion === "anulacion" ? "anulada" : "cambiada", el: siguiente.creadoEn };
  const candidatos: { fin: FinDecision; el: string }[] = [];
  const vence = linea.plazoDias !== null ? finDePlazo(linea.creadoEn, linea.plazoDias) : null;
  if (vence !== null && ms(vence) <= ms(ahora)) candidatos.push({ fin: "vencio", el: vence });
  if (prenda.ultimaLlegada !== null && ms(prenda.ultimaLlegada) > ms(linea.creadoEn) && ms(prenda.ultimaLlegada) <= ms(ahora))
    candidatos.push({ fin: "llego_mercaderia", el: prenda.ultimaLlegada });
  if (prenda.finEstacion !== null && ms(prenda.finEstacion) > ms(linea.creadoEn) && ms(prenda.finEstacion) <= ms(ahora))
    candidatos.push({ fin: "termino_temporada", el: prenda.finEstacion });
  if (linea.accion === "traslade" && linea.traslado?.anulado) candidatos.push({ fin: "traslado_anulado", el: ahora });
  if (candidatos.length === 0) return null;
  return candidatos.sort((a, b) => compararInstantes(a.el, b.el))[0];
}

// ---------------------------------------------------------------------------
// Medir: ¿sirvió?
// ---------------------------------------------------------------------------

/**
 * Cuánto estuvo colgada (unidad·segundo LIBRE en el piso) y cuánto vendió una prenda entre `desde` y `hasta` (el segundo
 * borde queda afuera). `eventos` son los del piso de UNA talla, ya limpios de bajadas tardías y con lo apartado adentro (lo
 * que `analizarSede` ya prepara para la vara): el nivel es la suma de sus deltas, y una venta es una salida marcada `esVenta`
 * (lo apartado para una clienta cuenta como venta desde que se aparta). No mira la EDAD de cada unidad a propósito: hoy casi
 * todo el piso de una tienda es carga inicial (edad desconocida) y medir por edad la dejaría siempre en «aún no se sabe».
 */
export function exposicionDeEventos(eventos: readonly EventoPiso[], desde: string, hasta: string): Exposicion {
  const d0 = ms(desde);
  const d1 = ms(hasta);
  if (!(d1 > d0)) return { unidadSegundos: 0, vendidas: 0 };
  const ordenados = [...eventos].sort((a, b) => compararInstantes(a.ts, b.ts));
  let nivel = 0;
  let t = d0;
  let unidadSegundos = 0;
  let vendidas = 0;
  for (const e of ordenados) {
    const te = ms(e.ts);
    if (te < d0) {
      nivel += e.delta;
      continue;
    }
    if (te >= d1) break;
    unidadSegundos += (Math.max(0, nivel) * (te - t)) / 1000;
    t = te;
    nivel += e.delta;
    if (e.esVenta && e.delta < 0) vendidas -= e.delta;
  }
  unidadSegundos += (Math.max(0, nivel) * (d1 - t)) / 1000;
  return { unidadSegundos, vendidas };
}

/** Un intervalo en que una prenda tuvo una intervención física (la movieron, la mandaron a otra tienda, la rebajaron). */
type Intervalo = { desde: number; hasta: number };
const INTERVENCIONES: readonly AccionRenglon[] = ["cambie_lugar", "traslade", "rebaje"];

/**
 * Las prendas con una intervención física, por clave, y el intervalo en que la tuvieron. Sirve para sacarlas del control:
 * si el líder cambia de lugar 5 blusas el mismo día, cada una no puede ser el control de las otras (todas se movieron).
 * «La dejo hasta agotar» no mueve nada, y una decisión que se quitó después no se cuenta. Cuenta hasta que la línea terminó
 * (la siguiente, su plazo, o ahora).
 */
export function intervenciones(libretas: ReadonlyMap<string, Libreta>, ahora: string): Map<string, Intervalo[]> {
  const mapa = new Map<string, Intervalo[]>();
  for (const [clave, { lineas }] of libretas) {
    lineas.forEach((l, i) => {
      if (!INTERVENCIONES.includes(l.accion)) return;
      const sig = lineas[i + 1] ?? null;
      if (sig?.accion === "anulacion") return;
      const nominal = l.plazoDias !== null ? ms(finDePlazo(l.creadoEn, l.plazoDias)) : ms(ahora);
      const hasta = Math.min(nominal, sig ? ms(sig.creadoEn) : Infinity, ms(ahora));
      const lista = mapa.get(clave) ?? [];
      lista.push({ desde: ms(l.creadoEn), hasta });
      mapa.set(clave, lista);
    });
  }
  return mapa;
}

/** La ventana en que se mide una línea: de cuándo a cuándo, y qué la acortó. Null si no hay nada que medir todavía. */
export type Ventana = { desde: string; hasta: string; nominal: string; enCurso: boolean; cortadaPor: Resultado["cortadaPor"] };

/**
 * `cuadres`: los instantes en que se cuadró el piso de la tienda donde se mide (ADR-0328; `instantesDeCuadre`). Antes del
 * cuadre, el piso de la tienda estaba subcontado y después no: una ventana que lo cruza compara dos niveles distintos y
 * saldría «no alcanzó» por el registro, no por la venta. Se corta ahí, como en una llegada (la decisión no termina: solo su
 * medida).
 */
export function ventanaDeLinea(
  linea: RenglonCrudo,
  siguiente: RenglonCrudo | null,
  prenda: PrendaParaVigencia,
  ahora: string,
  cuadres: readonly string[] = [],
): Ventana | null {
  if (linea.accion === "anulacion") return null;
  // «La trasladé» se mide en la tienda de destino, desde que el traslado entró a su stock; los demás, desde que se decidió.
  const desde = linea.accion === "traslade" ? linea.traslado?.recibidoEn ?? null : linea.creadoEn;
  if (desde === null) return null;
  const plazo = linea.accion === "traslade" ? PLAZO_CAMBIE_LUGAR_DIAS : (linea.plazoDias ?? PLAZO_SIN_REFERENCIA_DIAS);
  const nominal = finDePlazo(desde, plazo);
  const cortes: { el: string; por: NonNullable<Resultado["cortadaPor"]> }[] = [];
  if (siguiente) cortes.push({ el: siguiente.creadoEn, por: "otra_decision" });
  // La llegada y el fin de temporada son de la tienda de ORIGEN: en el destino de un traslado no aplican.
  if (linea.accion !== "traslade") {
    if (prenda.ultimaLlegada !== null && ms(prenda.ultimaLlegada) > ms(desde)) cortes.push({ el: prenda.ultimaLlegada, por: "llegada" });
    if (prenda.finEstacion !== null && ms(prenda.finEstacion) > ms(desde)) cortes.push({ el: prenda.finEstacion, por: "temporada" });
    for (const c of cuadres) if (ms(c) > ms(desde)) cortes.push({ el: c, por: "cuadre" });
  } else if (linea.traslado?.anulado) cortes.push({ el: ahora, por: "traslado_anulado" });
  let hasta = nominal;
  let cortadaPor: Resultado["cortadaPor"] = null;
  for (const c of cortes) {
    if (ms(c.el) < ms(hasta)) {
      hasta = c.el;
      cortadaPor = c.por;
    }
  }
  const enCurso = ms(ahora) < ms(hasta);
  if (enCurso) hasta = ahora;
  return { desde, hasta, nominal, enCurso, cortadaPor: enCurso ? null : cortadaPor };
}

/** Lo que se necesita de la sede donde se mide para comparar contra las demás de la categoría. */
export type ContextoDeMedicion = {
  prendas: readonly Pick<FrescuraPrenda, "clave" | "categoriaId" | "esClasico" | "primeraExhibicion" | "estado">[];
  exposicion: ExposicionDe;
  intervenciones: ReadonlyMap<string, Intervalo[]>;
  /** Los instantes del cuadre del piso de esa tienda (ver `ventanaDeLinea`). Sin la clave, ninguno. */
  cuadres?: readonly string[];
};

const solapa = (a: Intervalo, b: Intervalo) => a.desde < b.hasta && b.desde < a.hasta;

/**
 * El veredicto de una ventana. Se compara lo que vendió la prenda por unidad·día colgada contra lo que vendieron POR UNIDAD·DÍA
 * las demás de su categoría en la misma sede y los mismos días (el control C), y nunca contra su propia semana anterior
 * (engaña en campañas y feriados). Del control se sacan: la prenda misma, los clásicos y las que no cuadran, las que se
 * colgaron por primera vez dentro de la ventana (la novedad vende por nueva) y las que tienen su PROPIA intervención en esos
 * días.
 *   esperadas = ud(P) × V(C) / ud(C)      — solo se muestra; el veredicto no divide
 *   sirvió    ⇔ V(P) × ud(C) ≥ V(C) × ud(P)
 * La multiplicación cruzada elimina el caso especial «la categoría no vendió nada y ella sí».
 */
export function medirVentana(
  prenda: { clave: string; categoriaId: string },
  v: Pick<Ventana, "desde" | "hasta">,
  c: ContextoDeMedicion,
): Pick<Resultado, "veredicto" | "suyas" | "esperadas" | "ventasDelControl" | "prendasDeControl"> {
  const suya = c.exposicion(prenda.clave, v.desde, v.hasta);
  if (suya === null) return { veredicto: "no_estuvo_colgada", suyas: 0, esperadas: 0, ventasDelControl: 0, prendasDeControl: 0 };
  const ventana: Intervalo = { desde: ms(v.desde), hasta: ms(v.hasta) };
  let udControl = 0;
  let vControl = 0;
  let n = 0;
  for (const q of c.prendas) {
    if (q.clave === prenda.clave || q.categoriaId !== prenda.categoriaId || q.esClasico || q.estado.tipo === "dudosa") continue;
    if (q.primeraExhibicion !== null && ms(q.primeraExhibicion) > ventana.desde) continue;
    if ((c.intervenciones.get(q.clave) ?? []).some((w) => solapa(w, ventana))) continue;
    const e = c.exposicion(q.clave, v.desde, v.hasta);
    if (e === null || e.unidadSegundos <= 0) continue;
    udControl += e.unidadSegundos;
    vControl += e.vendidas;
    n += 1;
  }
  const esperadas = udControl > 0 ? (suya.unidadSegundos * vControl) / udControl : 0;
  const base = { suyas: suya.vendidas, esperadas: Math.round(esperadas * 100) / 100, ventasDelControl: vControl, prendasDeControl: n };
  if (suya.unidadSegundos <= 0) return { ...base, veredicto: "no_estuvo_colgada" };
  if (udControl <= 0) return { ...base, veredicto: "sin_control" };
  if (suya.vendidas + esperadas < EVIDENCIA_MINIMA) return { ...base, veredicto: "aun_no_se_sabe" };
  return { ...base, veredicto: suya.vendidas * udControl >= vControl * suya.unidadSegundos ? "sirvio" : "no_alcanzo" };
}

/** «La rebajé»: lo vendido desde ese día separado por motivo. Una campaña no es una liquidación: contarla como rebaja engañaría. */
const MOTIVOS_DE_CAMPANA = new Set(["campana", "cumpleanos_clienta_top", "prenda_con_desperfecto"]);
export function desgloseDeRebaje(ventas: readonly VentaDeRebaje[], desde: string, hasta: string): NonNullable<Resultado["rebaje"]> {
  const d = { conLiquidacion: 0, deCampana: 0, sinDescuento: 0 };
  for (const v of ventas) {
    if (ms(v.ts) < ms(desde) || ms(v.ts) >= ms(hasta)) continue;
    if (v.motivo === null) d.sinDescuento += v.cantidad;
    else if (MOTIVOS_DE_CAMPANA.has(v.motivo)) d.deCampana += v.cantidad;
    else d.conLiquidacion += v.cantidad;
  }
  return d;
}

/**
 * El resultado de UNA línea. `enSede`: el nombre de la tienda donde se mide (solo importa en «La trasladé»).
 * «La trasladé» en la tienda de origen dice `se_mide_en_destino` hasta que quien lee pueda ver el destino
 * (`completarTraslados`, solo el líder que lee las tres tiendas).
 */
export function medirLinea(
  linea: RenglonCrudo,
  siguiente: RenglonCrudo | null,
  prenda: { clave: string; categoriaId: string } & PrendaParaVigencia,
  ahora: string,
  c: ContextoDeMedicion,
): Resultado | null {
  if (linea.accion === "anulacion") return null;
  const vacio = { esperadas: 0, suyas: 0, ventasDelControl: 0, prendasDeControl: 0, rebaje: null, enSede: null, cortadaPor: null } as const;
  if (linea.accion === "traslade") {
    if (linea.traslado?.recibidoEn == null) return { ...vacio, veredicto: "aun_no_llega", desde: linea.creadoEn, hasta: ahora, enCurso: true };
    return { ...vacio, veredicto: "se_mide_en_destino", desde: linea.traslado.recibidoEn, hasta: ahora, enCurso: false, enSede: linea.traslado.destino };
  }
  const v = ventanaDeLinea(linea, siguiente, prenda, ahora, c.cuadres);
  if (v === null) return null;
  const m = medirVentana(prenda, v, c);
  return {
    ...m,
    desde: v.desde,
    hasta: v.hasta,
    enCurso: v.enCurso,
    cortadaPor: v.cortadaPor,
    rebaje: linea.accion === "rebaje" ? desgloseDeRebaje(linea.ventas ?? [], v.desde, v.hasta) : null,
    enSede: null,
  };
}

/**
 * «La trasladé», medida en la tienda DESTINO con SU lectura (solo la tiene el líder): desde que el traslado entró a su
 * stock, 7 días, contra las demás de la categoría allá. Es el mismo veredicto que cualquier otra línea.
 */
export function medirTrasladoEnDestino(linea: RenglonCrudo, siguiente: RenglonCrudo | null, prenda: { clave: string; categoriaId: string }, ahora: string, destino: { nombre: string } & ContextoDeMedicion): Resultado | null {
  const t = linea.traslado;
  if (linea.accion !== "traslade" || t === null || t.recibidoEn === null) return null;
  const nominal = finDePlazo(t.recibidoEn, PLAZO_CAMBIE_LUGAR_DIAS);
  let hasta = nominal;
  let cortadaPor: Resultado["cortadaPor"] = null;
  if (siguiente && ms(siguiente.creadoEn) > ms(t.recibidoEn) && ms(siguiente.creadoEn) < ms(hasta)) {
    hasta = siguiente.creadoEn;
    cortadaPor = "otra_decision";
  }
  // El cuadre del piso de la tienda DESTINO (es donde se mide) corta igual que en `ventanaDeLinea`.
  for (const c of destino.cuadres ?? []) {
    if (ms(c) > ms(t.recibidoEn) && ms(c) < ms(hasta)) {
      hasta = c;
      cortadaPor = "cuadre";
    }
  }
  const enCurso = ms(ahora) < ms(hasta);
  if (enCurso) hasta = ahora;
  const m = medirVentana(prenda, { desde: t.recibidoEn, hasta }, destino);
  return { ...m, desde: t.recibidoEn, hasta, enCurso, cortadaPor: enCurso ? null : cortadaPor, rebaje: null, enSede: destino.nombre };
}

// ---------------------------------------------------------------------------
// Qué se sugiere después
// ---------------------------------------------------------------------------

/**
 * La escalera de ADR-0208 (decisión 11) sigue después del resultado, sin quedarse dando vueltas. Envuelve a `sugerenciasDe`
 * (las de siempre, `base`) sin tocarla:
 *   · «La cambié de lugar» SIRVIÓ → «¿la dejas ahí hasta agotar?» en vez de volver a moverla.
 *   · NO alcanzó → «cambiarla de lugar» no se vuelve a sugerir en 30 días. Sigue trasladar si se puede; si no, el escalón
 *     siguiente de la escalera dicho como texto, sin botón (Felipe, P2: «que decide el líder»): una rebaja chica.
 *   · Aún no se sabe (o no había con qué comparar) → las de siempre; la pantalla dice que la prueba no dijo nada.
 * Una prenda quieta nunca queda sin una pista.
 */
export function sugerenciasConHistoria(
  base: readonly Sugerencia[],
  quieta: boolean,
  ultima: { accion: AccionRenglon; resultado: Resultado | null; finEl: string | null } | null,
  ahora: string,
): Sugerencia[] {
  if (!quieta || ultima === null || ultima.accion !== "cambie_lugar" || ultima.resultado === null || ultima.resultado.enCurso) return [...base];
  const v = ultima.resultado.veredicto;
  if (v === "sirvio") return ["dejar_hasta_agotar", ...base.filter((s) => s !== "cambiar_lugar")];
  if (v === "no_alcanzo" && ultima.finEl !== null && ms(ahora) < ms(ultima.finEl) + DIAS_SIN_REPETIR_CAMBIO * MS_DIA) {
    const sin = base.filter((s) => s !== "cambiar_lugar");
    return sin.some((s) => s === "trasladar") ? sin : [...sin, "rebaja_chica"];
  }
  return [...base];
}

// ---------------------------------------------------------------------------
// Aplicar todo a una sede
// ---------------------------------------------------------------------------

/** Las cifras de decisiones que se agregan a una sede. Serializable: viaja al navegador. */
export type DecisionesDeSede =
  | { estado: "ok"; trasladosRecientes: TrasladoReciente[]; resumen: ResumenDecisiones }
  | { estado: "sin_lectura"; aviso: string };

const resumenVacio = (): ResumenDecisiones =>
  Object.fromEntries(ACCIONES_DECISION.map((a) => [a, { terminadas: 0, sirvieron: 0, noAlcanzaron: 0, aunNoSeSabe: 0, suyas: 0, esperadas: 0 }])) as ResumenDecisiones;

const VEREDICTOS_CON_CIFRA: readonly Veredicto[] = ["sirvio", "no_alcanzo", "aun_no_se_sabe"];

/** Suma un resultado terminado al resumen de su acción. */
export function sumarAlResumen(resumen: ResumenDecisiones, accion: AccionRenglon, r: Resultado): void {
  if (accion === "anulacion" || r.enCurso || !VEREDICTOS_CON_CIFRA.includes(r.veredicto)) return;
  const s = resumen[accion];
  s.terminadas += 1;
  s.suyas += r.suyas;
  s.esperadas += r.esperadas;
  if (r.veredicto === "sirvio") s.sirvieron += 1;
  else if (r.veredicto === "no_alcanzo") s.noAlcanzaron += 1;
  else s.aunNoSeSabe += 1;
}

const SIN_LECTURA = "No se pudo leer lo ya decidido: «Por decidir» puede incluir prendas que ya decidiste. Vuelve a intentar en un momento.";

/**
 * Pone las decisiones en cada prenda de la sede (muta `sede`, antes de que viaje al navegador):
 *   · `prenda.decision`: la libreta con lo que terminó y cómo le fue;
 *   · `prenda.porDecidir` = quieta y SIN decisión vigente — el ÚNICO lugar que decide «Por decidir»: la cifra, el filete, el
 *     filtro y «Las N tiendas» leen este campo (lo vigila una prueba); ninguno vuelve a mirar `estado.quieta`;
 *   · `estado.sugerencias`, con la historia;
 *   · las cifras de la sede (`porDecidir`, `decididas`) y la suma por acción del mes.
 * Con `lectura = null` (la lectura falló): `porDecidir = quieta` —más prendas de las debidas, nunca menos— y la sede lo dice.
 * `exposicion`: lo que `analizarSede` sabe medir; `ahora`: el de la lectura, para que todo use el mismo reloj; `cuadres`: los
 * instantes del cuadre del piso de la sede (`instantesDeCuadre`), donde se corta la medida de cada decisión que los cruza.
 */
export function aplicarDecisiones(
  sede: FrescuraSede,
  lectura: LecturaDecisiones | null,
  exposicion: ExposicionDe,
  ahora: string,
  cuadres: readonly string[] = [],
): DecisionesDeSede {
  if (lectura === null) {
    for (const p of sede.prendas) {
      p.porDecidir = p.estado.quieta;
      p.decision = null;
    }
    sede.cifras.porDecidir = sede.prendas.filter((p) => p.porDecidir).length;
    sede.cifras.decididas = 0;
    return { estado: "sin_lectura", aviso: SIN_LECTURA };
  }
  const libretas = armarLibretas(lectura.renglones);
  const contexto: ContextoDeMedicion = { prendas: sede.prendas, exposicion, intervenciones: intervenciones(libretas, ahora), cuadres };
  const resumen = resumenVacio();
  const desdeResumen = ms(ahora) - DIAS_DEL_RESUMEN * MS_DIA;
  let decididas = 0;
  let porDecidir = 0;
  for (const p of sede.prendas) {
    const lib = libretas.get(p.clave);
    if (!lib || lib.lineas.length === 0) {
      p.decision = null;
      p.porDecidir = p.estado.quieta;
      if (p.porDecidir) porDecidir += 1;
      continue;
    }
    const lineas = lib.lineas.map((l, i): LineaDecision => {
      const sig = lib.lineas[i + 1] ?? null;
      const termino = terminaLinea(l, sig, p, ahora);
      const resultado = medirLinea(l, sig, p, ahora, contexto);
      if (resultado && termino && ms(termino.el) >= desdeResumen) sumarAlResumen(resumen, l.accion, resultado);
      return {
        id: l.id,
        accion: l.accion,
        creadoEn: l.creadoEn,
        persona: l.persona,
        nota: l.nota,
        plazoDias: l.plazoDias,
        traslado: l.traslado,
        vence: l.accion === "anulacion" || l.plazoDias === null ? null : finDePlazo(l.creadoEn, l.plazoDias),
        fin: termino?.fin ?? null,
        finEl: termino?.el ?? null,
        resultado,
      };
    });
    const actual = lineas[lineas.length - 1];
    // `terminaLinea` ya devuelve «anulada» para una anulación: una condición aparte diría dos veces lo mismo.
    const vigente = actual.fin === null;
    p.decision = { actual, vigente, historia: lineas.slice(0, -1).reverse().slice(0, LINEAS_DE_HISTORIA) };
    p.porDecidir = p.estado.quieta && !vigente;
    p.estado = { ...p.estado, sugerencias: sugerenciasConHistoria(p.estado.sugerencias, p.estado.quieta, vigente ? null : { accion: actual.accion, resultado: actual.resultado, finEl: actual.finEl }, ahora) };
    if (p.porDecidir) porDecidir += 1;
    if (vigente) decididas += 1;
  }
  sede.cifras.porDecidir = porDecidir;
  sede.cifras.decididas = decididas;
  return { estado: "ok", trasladosRecientes: lectura.trasladosRecientes, resumen };
}

/**
 * «La trasladé», medida en la tienda destino (solo el líder, que lee las tres tiendas): cada línea que dice
 * `se_mide_en_destino` toma su veredicto de la lectura de ESA tienda. Corre DESPUÉS de armar todas las sedes. Muta las
 * decisiones de la sede de origen y suma al resumen del origen.
 */
export function completarTraslados(
  sedes: readonly {
    id: string;
    nombre: string;
    sede: FrescuraSede;
    decisiones: DecisionesDeSede;
    lectura: LecturaDecisiones | null;
    exposicion: ExposicionDe;
    /** Los instantes del cuadre del piso de esa tienda: cortan la medida de «La trasladé» en el destino. */
    cuadres?: readonly string[];
  }[],
  ahora: string,
): void {
  const porId = new Map(sedes.map((s) => [s.id, s]));
  const libretasDe = new Map(sedes.map((s) => [s.id, s.lectura ? armarLibretas(s.lectura.renglones) : null]));
  for (const origen of sedes) {
    const libretas = libretasDe.get(origen.id);
    const dec = origen.decisiones;
    if (!libretas || dec.estado !== "ok") continue;
    for (const p of origen.sede.prendas) {
      const lib = libretas.get(p.clave);
      if (!lib || !p.decision) continue;
      const lineasVista = [p.decision.actual, ...p.decision.historia];
      lib.lineas.forEach((l, i) => {
        if (l.accion !== "traslade" || l.traslado === null) return;
        const dest = porId.get(l.traslado.destinoId);
        const vista = lineasVista.find((x) => x.id === l.id);
        if (!dest || !vista || vista.resultado?.veredicto !== "se_mide_en_destino") return;
        const contexto: ContextoDeMedicion = {
          prendas: dest.sede.prendas,
          exposicion: dest.exposicion,
          intervenciones: intervenciones(dest.lectura ? armarLibretas(dest.lectura.renglones) : new Map(), ahora),
          cuadres: dest.cuadres,
        };
        const r = medirTrasladoEnDestino(l, lib.lineas[i + 1] ?? null, { clave: p.clave, categoriaId: p.categoriaId }, ahora, { nombre: dest.nombre, ...contexto });
        if (r === null) return;
        vista.resultado = r;
        if (vista.finEl !== null && ms(vista.finEl) >= ms(ahora) - DIAS_DEL_RESUMEN * MS_DIA) sumarAlResumen(dec.resumen, "traslade", r);
      });
    }
  }
}
