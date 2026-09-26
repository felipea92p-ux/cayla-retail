import { rangoDelMes } from "./comprobantes-lista-reglas";
import { sumarDias } from "./fechas-lima";

// Filtros de la pestaña «Recibidas recientemente» de Recibir mercadería (maqueta 06, ADR-0111):
// el buscador y dos pastillas en línea, «Proveedor: Todos» y «Fechas». Toda la lógica que no es
// dibujo vive acá —qué período significa «este mes», cómo se rotula cada pastilla, cómo se
// limpia lo que llega por la URL— para probarla sin navegador. Sin I/O.
//
// Las fechas son de Lima: quien llama pasa `hoy` (aaaa-mm-dd) ya resuelto con `hoyLima()`, nunca
// el reloj del servidor —en UTC, de 7 pm a medianoche de Lima ya es «mañana»—. Pasar el texto en
// vez de un `Date` deja también que la página (servidor) y la pastilla (navegador) rotulen lo
// mismo: los dos parten del mismo `hoy`.
//
// Ojo con qué mide «Fechas»: el día en que LLEGÓ la guía (`lotes.fecha_recepcion`, en Lima), no el
// de emisión del comprobante — es lo que filtra `listar_recepciones_compras`.

export type RangoFechas = { desde: string; hasta: string };

// ---------------------------------------------------------------------------
// Períodos de un toque
// ---------------------------------------------------------------------------

export type PeriodoRecibidas = "este-mes" | "mes-pasado" | "30-dias" | "90-dias";

export const PERIODOS_RECIBIDAS: readonly { clave: PeriodoRecibidas; etiqueta: string }[] = [
  { clave: "este-mes", etiqueta: "Este mes" },
  { clave: "mes-pasado", etiqueta: "Mes pasado" },
  { clave: "30-dias", etiqueta: "Últimos 30 días" },
  { clave: "90-dias", etiqueta: "Últimos 90 días" },
];

/** `aaaa-mm` del mes anterior al de `hoy` (enero cae en diciembre del año anterior). */
function mesAnterior(hoy: string): string {
  const a = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7));
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Las fechas (aaaa-mm-dd) que cubre cada período, contadas desde `hoy` (Lima).
 *
 * «Este mes» y «Mes pasado» van del día 1 al último del mes: así el período sigue siendo «este
 * mes» toda la semana aunque el enlace se guarde o se comparta. «Últimos N días» cuenta desde
 * `hoy - N` hasta `hoy`, la misma ventana que la cifra «Unidades recibidas» de la cabecera
 * (`resumen_recepciones`: `fn_hoy_lima() - 90`), para que lo que se filtra y lo que se totaliza
 * digan lo mismo.
 */
export function rangoDePeriodo(clave: PeriodoRecibidas, hoy: string): RangoFechas {
  const delMes = (mes: string): RangoFechas => rangoDelMes(mes) ?? { desde: hoy, hasta: hoy };
  switch (clave) {
    case "este-mes":
      return delMes(hoy.slice(0, 7));
    case "mes-pasado":
      return delMes(mesAnterior(hoy));
    case "30-dias":
      return { desde: sumarDias(hoy, -30), hasta: hoy };
    case "90-dias":
      return { desde: sumarDias(hoy, -90), hasta: hoy };
  }
}

/** Qué período coincide con el rango de la URL; `null` si es un rango a mano o falta un extremo. */
export function periodoDeRango(desde: string | undefined, hasta: string | undefined, hoy: string): PeriodoRecibidas | null {
  if (!desde || !hasta) return null;
  const hallado = PERIODOS_RECIBIDAS.find((p) => {
    const r = rangoDePeriodo(p.clave, hoy);
    return r.desde === desde && r.hasta === hasta;
  });
  return hallado?.clave ?? null;
}

/**
 * Tras editar un extremo a mano, deja el rango coherente: si «desde» quedó después de «hasta»
 * (o al revés), el otro extremo acompaña al que se acaba de tocar — el rango nunca se invierte
 * ni queda en un vacío que devuelve cero filas sin explicación.
 */
export function ajustarRango(desde: string, hasta: string, editado: "desde" | "hasta"): RangoFechas {
  if (desde && hasta && desde > hasta) return editado === "desde" ? { desde, hasta: desde } : { desde: hasta, hasta };
  return { desde, hasta };
}

// ---------------------------------------------------------------------------
// Rótulos de las pastillas
// ---------------------------------------------------------------------------

/** `dd/mm` si la fecha es de este año, `dd/mm/aaaa` si no (un rango de diciembre visto en enero). */
function fechaDeLaPastilla(iso: string, hoy: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a === hoy.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

/**
 * Texto de la pastilla «Fechas»: sin filtro es solo «Fechas» (como la maqueta); con un período
 * de un toque, su nombre; con un rango a mano, las fechas («01/09 – 15/09», «Desde 01/09»…).
 */
export function textoFechas(desde: string | undefined, hasta: string | undefined, hoy: string): string {
  if (!desde && !hasta) return "Fechas";
  const clave = periodoDeRango(desde, hasta, hoy);
  if (clave) return PERIODOS_RECIBIDAS.find((p) => p.clave === clave)?.etiqueta ?? "Fechas";
  if (desde && hasta) return `${fechaDeLaPastilla(desde, hoy)} – ${fechaDeLaPastilla(hasta, hoy)}`;
  return desde ? `Desde ${fechaDeLaPastilla(desde, hoy)}` : `Hasta ${fechaDeLaPastilla(hasta as string, hoy)}`;
}

/**
 * Texto de la pastilla «Proveedor»: «Proveedor: Todos» sin filtro, «Proveedor: <nombre>» con él.
 * Un id que ya no está en la lista de activos (proveedor archivado, enlace viejo) sigue
 * filtrando en el servidor; la pastilla lo dice como «Otro» en vez de mentir con «Todos».
 */
export function textoProveedor(proveedorId: string | undefined, proveedores: readonly { id: string; nombre: string }[]): string {
  if (!proveedorId) return "Proveedor: Todos";
  return `Proveedor: ${proveedores.find((p) => p.id === proveedorId)?.nombre ?? "Otro"}`;
}

// ---------------------------------------------------------------------------
// Lo que llega por la URL
// ---------------------------------------------------------------------------

export type FiltrosRecibidas = { busqueda?: string; proveedorId?: string; desde?: string; hasta?: string };

/** Cómo llegó lo recibido: todas, solo las completas o solo las que llegaron con faltante. Se filtra en el navegador (la lista trae ≤ 30 filas). */
export type ResultadoRecibidas = "todas" | "completas" | "faltante";

/** Lo que dice `?res=` en la URL; cualquier otra cosa es «todas». */
export function resultadoDesdeParam(v: string | undefined): ResultadoRecibidas {
  return v === "completas" || v === "faltante" ? v : "todas";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La fecha si es un día real `aaaa-mm-dd` (no 31/02, no texto suelto); si no, `undefined`. */
export function fechaIsoReal(v: string | undefined | null): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return undefined;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return t.toISOString().slice(0, 10) === v ? (v as string) : undefined;
}

/**
 * Los filtros de `?q=&prov=&desde=&hasta=` ya limpios. Una URL escrita a mano o un enlace viejo
 * no debe llegar a la base con un uuid roto o una fecha imposible (la función SQL fallaría con un
 * error en vez de una lista vacía); lo que no vale se ignora. Un rango invertido se ordena.
 */
export function filtrosRecibidasDesdeParams(p: { q?: string; prov?: string; desde?: string; hasta?: string }): FiltrosRecibidas {
  const desde = fechaIsoReal(p.desde);
  const hasta = fechaIsoReal(p.hasta);
  const invertido = desde && hasta && desde > hasta;
  return {
    busqueda: p.q?.trim() || undefined,
    proveedorId: p.prov && UUID.test(p.prov) ? p.prov : undefined,
    desde: invertido ? hasta : desde,
    hasta: invertido ? desde : hasta,
  };
}

/** ¿Hay algún filtro aplicado? Decide el texto de «sin resultados» y si se ofrece «Limpiar». */
export function hayFiltrosRecibidas(f: FiltrosRecibidas): boolean {
  return Boolean(f.busqueda || f.proveedorId || f.desde || f.hasta);
}

/**
 * La URL con `cambios` aplicados sobre la actual (`actual` = el `search` sin `?`). Un valor vacío
 * borra el parámetro; el resto —sobre todo `vista=recibidas`— se conserva; y siempre se descarta
 * `cursor`: la página 3 de otro filtro no significa nada.
 */
export function hrefConCambios(pathname: string, actual: string, cambios: Record<string, string>): string {
  const p = new URLSearchParams(actual);
  for (const [k, v] of Object.entries(cambios)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  p.delete("cursor");
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
