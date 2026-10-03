import { ORDEN_ACCION_HOY, type TipoAccionHoy } from "./existencias-recomendaciones";
import { compararTallas } from "./tallas";
import { porColgar } from "./inventario-reglas";
import { crearIndiceBusquedaEspecial, filtrarConBusquedaEspecial, type IndiceBusquedaEspecial, type OpcionesDeOrden } from "./filtro-busqueda-especial";
import type { ClaveFiltro } from "./existencias-vacio";

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

/* ====================================================================
   El filtro completo de Existencias, en UN solo lugar (2026-10-03): la lista, el estado vacío («¿cuántas se verían sin
   esto?») y los números de cada opción lo usan igual. Antes vivía dentro de `InventarioPanel` y no se podía probar que un
   número de la barra dijera lo mismo que la lista.
   ==================================================================== */

/** Lo que el filtro necesita leer de una fila de Existencias (una talla de un color de un modelo). */
export type FilaFiltrable = {
  productoId: string;
  referencia: string;
  sku: string;
  codigosBarras: string[];
  categoria: string | null;
  marca?: string | null;
  talla: string | null;
  color: string | null;
  accionHoy?: { tipo: TipoAccionHoy } | null;
  danado: number | null;
  pisoDisponible: number | null;
  almacenDisponible: number | null;
};

/** El índice del buscador: nombre, código, códigos de barras, color, talla, marca y categoría, en cualquier orden. */
export function indiceDeExistencias<F extends FilaFiltrable>(filas: readonly F[]): IndiceBusquedaEspecial<F> {
  return crearIndiceBusquedaEspecial(filas, (f) => ({
    nombre: f.referencia,
    sku: f.sku,
    codigosBarras: f.codigosBarras,
    color: f.color,
    talla: f.talla,
    marca: f.marca,
    categoria: f.categoria,
  }));
}

/** Los filtros visuales que NO son texto ni talla/color (esos dos los resuelve el buscador, que puede mandar sobre ellos).
 *  `omitir` = los que se ignoran: el estado vacío los «relaja» de a uno para decir cuál deja la pantalla en blanco. «Acción»
 *  y «Estado» son dos ejes (2026-09-25): qué hacer hoy con la talla y en qué condición está. */
export function pasaFiltros(f: FilaFiltrable, elegidos: FiltrosElegidos, omitir?: ReadonlySet<ClaveFiltro>): boolean {
  if (!omitir?.has("categoria") && elegidos.categoria !== null && f.categoria !== elegidos.categoria) return false;
  if (!omitir?.has("marca") && elegidos.marca !== null && f.marca !== elegidos.marca) return false;
  if (!omitir?.has("accion") && !coincideConFiltroAccion(f.accionHoy?.tipo, elegidos.accion)) return false;
  if (omitir?.has("estado")) return true;
  if (!coincideConFiltroDanado(f.danado, elegidos.estado === "danado")) return false;
  return elegidos.estado !== "por_colgar" || porColgar(f);
}

/** La lista filtrada: el texto (que manda sobre Talla y Color si los dice) más los demás filtros. `omitir` ignora los que se
 *  pidan; `opciones` solo cambia el orden. */
export function filtrarExistencias<F extends FilaFiltrable>(
  indice: IndiceBusquedaEspecial<F>,
  elegidos: FiltrosElegidos,
  omitir?: ReadonlySet<ClaveFiltro>,
  opciones?: OpcionesDeOrden<F>
) {
  return filtrarConBusquedaEspecial(
    indice,
    elegidos.q,
    {
      talla: omitir?.has("talla") ? null : elegidos.talla,
      color: omitir?.has("color") ? null : elegidos.color,
      otros: (f) => pasaFiltros(f, elegidos, omitir),
    },
    opciones
  );
}

/* ====================================================================
   Cuántos productos trae cada opción (2026-10-03, como Productos ADR-0308): la barra esconde las opciones que dejarían la
   lista vacía y dice cuántos hay en cada una. El conteo es DISYUNTIVO: cada filtro cuenta con todos los demás puestos menos
   el suyo («¿cuántas Krisstell hay en cada talla?» mira la marca elegida, no la talla elegida, porque esa es la pregunta).
   La unidad es el producto (modelo): la misma del «N productos» de arriba, así un número nunca contradice a la lista.
   Se cuenta en el navegador sobre lo que ya llegó: TRU tiene ~2.300 tallas y seis pasadas son ~14.000 filas, milisegundos.
   ==================================================================== */

export const CLAVES_CONTEO: readonly ClaveFiltro[] = ["categoria", "marca", "talla", "color", "accion", "estado"];
/** filtro → { opción → cuántos productos }. Una opción que no está tiene 0. */
export type ConteosFiltros = Record<ClaveFiltro, Record<string, number>>;

/** Lo que vale una fila en cada filtro. En «Estado» puede valer dos cosas a la vez (dañada y por colgar). */
function valoresDe(f: FilaFiltrable, clave: ClaveFiltro): (string | null | undefined)[] {
  switch (clave) {
    case "categoria":
      return [f.categoria];
    case "marca":
      return [f.marca];
    case "talla":
      return [f.talla];
    case "color":
      return [f.color];
    case "accion":
      return [f.accionHoy?.tipo];
    case "estado":
      return [(f.danado ?? 0) > 0 ? "danado" : null, porColgar(f) ? "por_colgar" : null];
  }
}

export function conteosDeFiltros<F extends FilaFiltrable>(indice: IndiceBusquedaEspecial<F>, elegidos: FiltrosElegidos): ConteosFiltros {
  const salida = {} as ConteosFiltros;
  for (const clave of CLAVES_CONTEO) {
    const productos = new Map<string, Set<string>>();
    for (const f of filtrarExistencias(indice, elegidos, new Set([clave])).filas) {
      for (const v of valoresDe(f, clave)) {
        if (!v) continue;
        const s = productos.get(v);
        if (s) s.add(f.productoId);
        else productos.set(v, new Set([f.productoId]));
      }
    }
    salida[clave] = Object.fromEntries([...productos].map(([v, s]) => [v, s.size]));
  }
  return salida;
}
