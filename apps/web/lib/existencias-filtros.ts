import { ORDEN_ACCION_HOY, type TipoAccionHoy } from "./existencias-recomendaciones";
import { compararTallas } from "./tallas";

/* ====================================================================
   existencias-filtros · el filtro «Acción» de Existencias (2026-09-25)

   Separación conceptual pedida por Felipe: «Acción» (qué debería hacer la vendedora hoy) y
   «Estado» (en qué condición está el inventario — dañado/cuarentena) son DOS preguntas
   distintas. Antes vivían mezcladas en un solo dropdown/estado de React; ahora el filtro
   «Acción» lee EXCLUSIVAMENTE de `TipoAccionHoy` — nunca una unión con un estado de inventario —
   y «Dañado»/«Cuarentena» vive como su propio eje («Estado», en `InventarioPanel.tsx`).
   ==================================================================== */

/** Las opciones reales del filtro «Acción»: exactamente `TipoAccionHoy`, en el mismo orden que ya
 *  usa la columna y la leyenda de la tabla (`ORDEN_ACCION_HOY`) — nunca "Dañado" mezclado acá. */
export const OPCIONES_FILTRO_ACCION: readonly TipoAccionHoy[] = (Object.keys(ORDEN_ACCION_HOY) as TipoAccionHoy[]).sort(
  (a, b) => ORDEN_ACCION_HOY[a] - ORDEN_ACCION_HOY[b]
);

/** ¿Esta fila coincide con el filtro «Acción»? `filtro === null` = «Acción: todas». */
export function coincideConFiltroAccion(tipoAccionHoy: TipoAccionHoy | null | undefined, filtro: TipoAccionHoy | null): boolean {
  return filtro === null || tipoAccionHoy === filtro;
}

/** ¿Esta fila coincide con el filtro «Estado» (dañado/cuarentena)? Eje INDEPENDIENTE de Acción
 *  hoy: dañado es una condición del inventario, no algo que la vendedora deba decidir hoy. */
export function coincideConFiltroDanado(unidadesDanadas: number | null | undefined, filtroActivo: boolean): boolean {
  return !filtroActivo || (unidadesDanadas ?? 0) > 0;
}

/* ====================================================================
   Los filtros viven en la URL (2026-10-03, misma estructura que Productos, ADR-0308)

   Antes cada combo era un `useState`: al ir a «Bajar al piso» y volver, o al recargar, la asesora rehacía los
   filtros; y no había enlace que mandar a otra sede («esto es lo que falta de Krisstell en M»). Ahora la URL es
   la única fuente de verdad y la pantalla solo la lee. A diferencia de Productos, aquí NO se navega: Existencias ya
   tiene todo el stock de la sede en el navegador, así que cambiar un filtro reescribe la URL con la historia del
   navegador (`history.pushState`), sin volver a pedir la página ni encender el loader.
   ==================================================================== */

/** Las claves de la URL que son filtros de Existencias. Lo demás (`ubicacion`, `variante`, `danados`) no es un filtro:
 *  ni se limpia ni se cuenta. */
export const CLAVES_FILTRO = ["q", "cat", "marca", "talla", "color", "accion", "estado", "orden"] as const;
export type ClaveUrl = (typeof CLAVES_FILTRO)[number];

/** «Dañado / cuarentena» y «Por colgar»: las dos opciones del filtro «Estado». */
export const ESTADOS_FILTRO = ["danado", "por_colgar"] as const;
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];

/** Lo que dice la URL, ya validado. `null` = sin elegir. Categoría, marca, talla y color van por su NOMBRE (lo que la
 *  fila trae): un nombre que esta sede no tiene lo descarta la pantalla, nunca filtra a escondidas. */
export type FiltrosExistencias = {
  q: string;
  categoria: string | null;
  marca: string | null;
  talla: string | null;
  color: string | null;
  accion: TipoAccionHoy | null;
  estado: EstadoFiltro | null;
  orden: string | null;
};

/** Lee la URL (sin «?»). `separa`: Acción y Estado solo existen donde se separa piso y almacén; en el Taller, un
 *  `accion=` que vino en un enlace de una tienda se ignora en vez de dejar la lista vacía sin un control que lo diga. */
export function filtrosDeUrl(consulta: string, { separa }: { separa: boolean }): FiltrosExistencias {
  const p = new URLSearchParams(consulta);
  const texto = (k: ClaveUrl) => p.get(k)?.trim() || null;
  const accion = p.get("accion");
  const estado = p.get("estado");
  return {
    q: p.get("q") ?? "",
    categoria: texto("cat"),
    marca: texto("marca"),
    talla: texto("talla"),
    color: texto("color"),
    accion: separa && (OPCIONES_FILTRO_ACCION as readonly string[]).includes(accion ?? "") ? (accion as TipoAccionHoy) : null,
    estado: separa && (ESTADOS_FILTRO as readonly string[]).includes(estado ?? "") ? (estado as EstadoFiltro) : null,
    orden: texto("orden"),
  };
}

/** Aplica `cambios` a la consulta `actual` (sin «?»). Vacío o `null` borra la clave. */
export function consultaConCambios(actual: string, cambios: Partial<Record<ClaveUrl, string | null>>): string {
  const p = new URLSearchParams(actual);
  for (const [k, v] of Object.entries(cambios)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  return p.toString();
}

/** Quita los filtros y deja lo que no es filtro (la sede que mira un líder, `ubicacion`) más lo que se pida `conservar`.
 *  El orden no es un filtro (no quita prendas, solo las acomoda): «Limpiar filtros» lo deja como estaba. */
export function consultaSinFiltros(actual: string, conservar: readonly ClaveUrl[] = ["orden"]): string {
  const p = new URLSearchParams(actual);
  for (const k of CLAVES_FILTRO) if (!conservar.includes(k)) p.delete(k);
  return p.toString();
}

/** Un valor elegido que esta sede no ofrece (un enlace de otra tienda, una talla que ya se vendió entera) no filtra: un
 *  filtro que no se ve en su combo no puede seguir vaciando la lista. */
export function valorOfrecido(valor: string | null, opciones: readonly string[]): string | null {
  return valor !== null && opciones.includes(valor) ? valor : null;
}

/** Las tallas de la sede en su curva (XS · S · M · L, luego la numeración), la misma que la tarjeta: antes el combo las
 *  ordenaba como texto («10, 2, 4, Estándar, L, M, S, XL, XS»). */
export function tallasEnCurva(filas: readonly { talla: string | null }[]): string[] {
  return [...new Set(filas.map((f) => f.talla).filter((t): t is string => !!t))].sort(compararTallas);
}

/** Lo que dice cada opción de «Estado». */
export const ROTULO_ESTADO_FILTRO: Record<EstadoFiltro, string> = { danado: "Dañado / cuarentena", por_colgar: "Por colgar" };

/** Lo que de verdad filtra la lista, ya resuelto contra lo que la sede ofrece (`valorOfrecido`): lo mismo que dicen las
 *  píldoras, para que una etiqueta nunca nombre un filtro que no está actuando. */
export type FiltrosElegidos = Omit<FiltrosExistencias, "orden">;

/** Un chip por cosa puesta, siempre «Nombre: valor» como la píldora (igual que Productos); la búsqueda, entre comillas.
 *  `quitar` son las claves de la URL que lo apagan. */
export function chipsDeFiltros(f: FiltrosElegidos, textoAccion: (a: TipoAccionHoy) => string): { texto: string; quitar: ClaveUrl[] }[] {
  const chips: { texto: string; quitar: ClaveUrl[] }[] = [];
  if (f.q.trim()) chips.push({ texto: `«${f.q.trim()}»`, quitar: ["q"] });
  if (f.categoria) chips.push({ texto: `Categoría: ${f.categoria}`, quitar: ["cat"] });
  if (f.talla) chips.push({ texto: `Talla: ${f.talla}`, quitar: ["talla"] });
  if (f.color) chips.push({ texto: `Color: ${f.color}`, quitar: ["color"] });
  if (f.accion) chips.push({ texto: `Acción: ${textoAccion(f.accion)}`, quitar: ["accion"] });
  if (f.estado) chips.push({ texto: `Estado: ${ROTULO_ESTADO_FILTRO[f.estado]}`, quitar: ["estado"] });
  if (f.marca) chips.push({ texto: `Marca: ${f.marca}`, quitar: ["marca"] });
  return chips;
}

/** Cuántos filtros quitan prendas: lo dice el botón «Filtros · N». Ni la búsqueda (se ve en su caja) ni el orden (solo acomoda). */
export function contarFiltrosActivos(f: FiltrosElegidos): number {
  return [f.categoria, f.marca, f.talla, f.color, f.accion, f.estado].filter((v) => v !== null).length;
}
