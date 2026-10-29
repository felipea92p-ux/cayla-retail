// Relativo, no `@/`: vitest no resuelve el alias y este archivo tiene pruebas.
import { restarDias } from "./movimientos-reglas";

// Ingresos (pestaña de Movimientos): «qué prendas entraron» a la sede entre dos fechas, UNA línea por modelo. La suma la
// hace la base (`retail.fn_ingresos_por_modelo`); acá vive lo que la web decide: el rango que se pide, cómo se dice, la
// URL de la pestaña y cómo se lee la respuesta sin fiarse de ella.
//
// Cuenta lo que ENTRÓ (stock inicial y mercadería recibida), no lo que quedó: un ajuste posterior no lo resta. Lo dice la
// nota de la pantalla, no esta lógica.

export type ModeloIngresado = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  categoria: string | null;
  unidades: number;
  deStockInicial: number;
  deRecepcion: number;
  primerDia: string;
  ultimoDia: string;
  /** Ningún ingreso antes del rango, en ninguna sede: un modelo que llega por primera vez. Si no, es un «Reingreso». */
  esNuevo: boolean;
  /** Lo que se cobra en ESTA sede por lo que entró: un solo precio (min = max) o un rango por tallas. */
  precioMin: number | null;
  precioMax: number | null;
  /** Lo que costó. `null` si la cuenta no ve el dinero (ver `ResumenIngresos.veCosto`) o si no hay costo cargado (en 0). */
  costoMin: number | null;
  costoMax: number | null;
};

export type ResumenIngresos = {
  desde: string;
  hasta: string;
  /** La cuenta ve el costo (permiso de dinero de compras, ADR-0183). Sin él la columna ni se dibuja: nunca un 0. */
  veCosto: boolean;
  modelos: ModeloIngresado[];
  totales: { modelos: number; unidades: number; deStockInicial: number; deRecepcion: number; nuevos: number };
};

type Crudo = Record<string, unknown>;

const esObjeto = (v: unknown): v is Crudo => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const entero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
/** Un monto o `null`: lo que falta NO se vuelve 0 (un 0 parece un dato). */
const montoONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Lo que devuelve `fn_ingresos_por_modelo`, ya validado. `null` si no tiene la forma (la pantalla dice «no se pudo leer»,
 *  nunca dibuja un 0 que parezca un dato). Un modelo sin id o sin nombre se descarta: no se puede mostrar ni abrir. */
export function leerResumenIngresos(data: unknown): ResumenIngresos | null {
  if (!esObjeto(data) || !Array.isArray(data.modelos) || !esObjeto(data.totales)) return null;
  const desde = texto(data.desde);
  const hasta = texto(data.hasta);
  if (!desde || !hasta) return null;
  const modelos: ModeloIngresado[] = [];
  for (const m of data.modelos) {
    if (!esObjeto(m)) continue;
    const productoId = texto(m.producto_id);
    const referencia = texto(m.referencia);
    if (!productoId || !referencia) continue;
    modelos.push({
      productoId,
      referencia,
      codigo: texto(m.codigo),
      categoria: texto(m.categoria),
      unidades: entero(m.unidades),
      deStockInicial: entero(m.de_stock_inicial),
      deRecepcion: entero(m.de_recepcion),
      primerDia: texto(m.primer_dia) ?? desde,
      ultimoDia: texto(m.ultimo_dia) ?? hasta,
      esNuevo: m.es_nuevo === true,
      precioMin: montoONulo(m.precio_min),
      precioMax: montoONulo(m.precio_max),
      costoMin: montoONulo(m.costo_min),
      costoMax: montoONulo(m.costo_max),
    });
  }
  const t = data.totales;
  return {
    desde,
    hasta,
    veCosto: data.ve_costo === true,
    modelos,
    totales: {
      modelos: entero(t.modelos),
      unidades: entero(t.unidades),
      deStockInicial: entero(t.de_stock_inicial),
      deRecepcion: entero(t.de_recepcion),
      nuevos: entero(t.nuevos),
    },
  };
}

// ── El rango ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type PeriodoIngresos = "7" | "30" | "90" | "fechas";

export const PERIODOS_INGRESOS: readonly { valor: Exclude<PeriodoIngresos, "fechas">; etiqueta: string }[] = [
  { valor: "7", etiqueta: "7 días" },
  { valor: "30", etiqueta: "30 días" },
  { valor: "90", etiqueta: "90 días" },
];

/** La base rechaza más de un año (400 días): la web nunca lo pide. */
export const MAXIMO_DIAS_INGRESOS = 400;

export type ParamsIngresos = { vista?: string; p?: string; desde?: string; hasta?: string };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** `aaaa-mm-dd` y un día que existe (31/02 no). */
export function esFechaIso(v: string | undefined | null): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** «10 de marzo»; con el año si no es el de hoy («10 de marzo de 2030»). */
export function diaLargo(iso: string, hoy: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const base = `${d} de ${MESES[m - 1]}`;
  return String(a) === hoy.slice(0, 4) ? base : `${base} de ${a}`;
}

export type RangoIngresos = { periodo: PeriodoIngresos; desde: string; hasta: string; texto: string };

/** El rango de días de Lima (inclusivo) que pide la URL. Por defecto, los últimos 7 días: la pregunta nace cuando llega un
 *  fardo, y lo que se quiere ver es «desde que llegó hasta hoy». Con `desde` (y, si falta, `hasta` = hoy) es un rango a
 *  medida. Nunca pasa de hoy ni de 400 días: lo que la URL pida de más se recorta, no se rechaza. */
export function rangoIngresos(params: Pick<ParamsIngresos, "p" | "desde" | "hasta">, hoy: string): RangoIngresos {
  if (esFechaIso(params.desde)) {
    let hasta = esFechaIso(params.hasta) ? params.hasta : hoy;
    if (hasta > hoy) hasta = hoy;
    let desde = params.desde > hasta ? hasta : params.desde;
    const tope = restarDias(hasta, MAXIMO_DIAS_INGRESOS);
    if (desde < tope) desde = tope;
    const texto = desde === hasta ? `el ${diaLargo(desde, hoy)}` : `del ${diaLargo(desde, hoy)} al ${diaLargo(hasta, hoy)}`;
    return { periodo: "fechas", desde, hasta, texto };
  }
  const dias = params.p === "30" ? 30 : params.p === "90" ? 90 : 7;
  return { periodo: String(dias) as PeriodoIngresos, desde: restarDias(hoy, dias - 1), hasta: hoy, texto: `los últimos ${dias} días` };
}

// ── La URL de la pestaña ──────────────────────────────────────────────────────────────────────────────────────────────

/** La pestaña con un período (`7` es el de fábrica y no va en la URL) o un rango a medida. */
export function hrefIngresos(o: { periodo?: Exclude<PeriodoIngresos, "fechas">; desde?: string; hasta?: string } = {}): string {
  const q = new URLSearchParams({ vista: "ingresos" });
  if (esFechaIso(o.desde)) {
    q.set("desde", o.desde);
    if (esFechaIso(o.hasta)) q.set("hasta", o.hasta);
  } else if (o.periodo && o.periodo !== "7") {
    q.set("p", o.periodo);
  }
  return `/inventario/movimientos?${q.toString()}`;
}

/** El rango dicho como complemento de «nada entró …»: «en los últimos 7 días», pero «del 3 al 20 de octubre» y «el 28 de
 *  octubre» ya traen su palabra (con «en» se leería «en del 3»). */
export function conPreposicion(textoRango: string): string {
  return textoRango.startsWith("los ") ? `en ${textoRango}` : textoRango;
}

export function prendasTexto(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "prenda" : "prendas"}`;
}

export function modelosTexto(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "modelo" : "modelos"}`;
}

// ── Precio, costo y «Nuevo» ────────────────────────────────────────────────────────────────────────────────────────────

/** «S/ 59» o «S/ 59,90»: sin decimales si el monto es redondo. El espacio es de no-cortar: un monto no se parte en dos líneas. */
export function solesTexto(n: number): string {
  return `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** «S/ 59» si es uno solo, «S/ 59 – 69» si varía por talla, o `null` si no hay monto. */
export function rangoSolesTexto(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return null;
  if (min === max) return solesTexto(min);
  return `${solesTexto(min)} – ${solesTexto(max).replace("S/\u00a0", "")}`;
}

/** El precio de un modelo en pantalla: su monto o un guion. */
export function precioDelModelo(m: Pick<ModeloIngresado, "precioMin" | "precioMax">): string {
  return rangoSolesTexto(m.precioMin, m.precioMax) ?? "—";
}

/** El costo de un modelo en pantalla: su monto, o «Sin costo» si nadie lo cargó (el 0 de fábrica no es un costo). Solo se llama
 *  cuando la cuenta ve el costo: sin permiso la columna no existe. */
export function costoDelModelo(m: Pick<ModeloIngresado, "costoMin" | "costoMax">): string {
  return rangoSolesTexto(m.costoMin, m.costoMax) ?? "Sin costo";
}

export type FiltroNovedad = "todos" | "nuevo" | "reingreso";

export function filtrarPorNovedad<T extends Pick<ModeloIngresado, "esNuevo">>(modelos: readonly T[], filtro: FiltroNovedad): T[] {
  if (filtro === "nuevo") return modelos.filter((m) => m.esNuevo);
  if (filtro === "reingreso") return modelos.filter((m) => !m.esNuevo);
  return [...modelos];
}

/** Cuántos hay de cada clase; el filtro solo se ofrece si hay de las dos (con una sola, no filtra nada). */
export function cuentaNovedad(modelos: readonly Pick<ModeloIngresado, "esNuevo">[]): { nuevos: number; reingresos: number; hayDeLasDos: boolean } {
  const nuevos = modelos.filter((m) => m.esNuevo).length;
  const reingresos = modelos.length - nuevos;
  return { nuevos, reingresos, hayDeLasDos: nuevos > 0 && reingresos > 0 };
}
