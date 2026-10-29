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
};

export type ResumenIngresos = {
  desde: string;
  hasta: string;
  modelos: ModeloIngresado[];
  totales: { modelos: number; unidades: number; deStockInicial: number; deRecepcion: number };
};

type Crudo = Record<string, unknown>;

const esObjeto = (v: unknown): v is Crudo => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const entero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

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
    });
  }
  const t = data.totales;
  return {
    desde,
    hasta,
    modelos,
    totales: { modelos: entero(t.modelos), unidades: entero(t.unidades), deStockInicial: entero(t.de_stock_inicial), deRecepcion: entero(t.de_recepcion) },
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
