import type { CoberturaPiso, RitmoReciente } from "./existencias-ritmo";
import type { PisoDeTalla } from "./piso-plan";
import { compararTallas } from "./tallas";
import { crearIndiceBusquedaEspecial, filtrarConBusquedaEspecial, type IndiceBusquedaEspecial, type OpcionesDeOrden } from "./filtro-busqueda-especial";
import { listaDeUrl } from "./productos-filtros";
import { textoDeFamilia } from "./colores-familias";
import { hoyDeTalla, TEXTO_HOY, TIPOS_HOY, type TipoHoy } from "./existencias-hoy";
import type { ClaveFiltro } from "./existencias-vacio";
import { claveDeTarjeta } from "./existencias-tarjetas";

/* ====================================================================
   existencias-filtros · la barra de filtros de Existencias

   Dos preguntas distintas sobre una talla, dos filtros (separadas el 2026-09-25, renombradas el 2026-10-03):
     · «Hoy»: qué pide la talla (Por colgar · Sin stock atrás · Mantener, `lib/existencias-hoy.ts`). Cada talla
       cae en UNO solo, y la tarjeta y la tabla dicen la misma palabra. Antes eran «Acción» («Reponer a piso» / «Mantener») y
       «Por colgar» escondido en «Estado»: elegir «Mantener» + «Por colgar» siempre daba vacío.
     · «Condición»: en qué condición está el inventario (Dañadas · Apartadas). No excluye a «Hoy»: una talla puede pedir
       colgar y tener una apartada a la vez.
   ==================================================================== */

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
export const CLAVES_FILTRO = ["q", "cat", "marca", "talla", "color", "familia", "hoy", "condicion", "orden"] as const;
export type ClaveUrl = (typeof CLAVES_FILTRO)[number];

/** Las opciones de «Condición»: las dos del inventario (dañadas, apartadas) y, desde 2026-10-05, las dos del ritmo de lo que está en el
 *  piso (se acaban, sin ventas). Como las otras, una talla puede tener varias a la vez y no excluyen a «Hoy». */
export const CONDICIONES = ["danadas", "apartadas", "se_acaban", "sin_ventas"] as const;
export type Condicion = (typeof CONDICIONES)[number];
export const ROTULO_CONDICION: Record<Condicion, string> = {
  danadas: "Dañadas / cuarentena",
  apartadas: "Apartadas",
  se_acaban: "Se acaban",
  sin_ventas: "Sin ventas esta semana",
};

/** «Se acaban»: lo que hay colgado dura una semana o menos al Ritmo reciente (`coberturaPiso`, solo cuando el ritmo es una tasa
 *  MEDIDA: con pocas jornadas no se dice una tasa, y por tanto tampoco «se acaba»). */
export const DIAS_SE_ACABA = 7;

/** Lo que dice la URL, ya validado. `null` o lista vacía = sin elegir. Categoría, marca, talla y color van por su NOMBRE (lo
 *  que la fila trae; el nombre de un color es único en la base): un nombre que esta sede no tiene lo descarta la pantalla,
 *  nunca filtra a escondidas. Talla y Color aceptan varias opciones a la vez (`talla=M,L`), como en Productos; el color
 *  también por familia entera (`familia=azul`). */
export type FiltrosExistencias = {
  q: string;
  categoria: string | null;
  marca: string | null;
  tallas: string[];
  colores: string[];
  familias: string[];
  hoy: TipoHoy | null;
  condicion: Condicion | null;
  orden: string | null;
};

/** Lee la URL (sin «?»). `separa`: Hoy y Condición solo existen donde se separa piso y almacén; en el Taller, un
 *  `hoy=` que vino en un enlace de una tienda se ignora en vez de dejar la lista vacía sin un control que lo diga. */
export function filtrosDeUrl(consulta: string, { separa }: { separa: boolean }): FiltrosExistencias {
  const p = new URLSearchParams(consulta);
  const texto = (k: ClaveUrl) => p.get(k)?.trim() || null;
  const hoy = p.get("hoy");
  const condicion = p.get("condicion");
  return {
    q: p.get("q") ?? "",
    categoria: texto("cat"),
    marca: texto("marca"),
    tallas: listaDeUrl(p.get("talla")),
    colores: listaDeUrl(p.get("color")),
    familias: listaDeUrl(p.get("familia")),
    hoy: separa && (TIPOS_HOY as readonly string[]).includes(hoy ?? "") ? (hoy as TipoHoy) : null,
    condicion: separa && (CONDICIONES as readonly string[]).includes(condicion ?? "") ? (condicion as Condicion) : null,
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

/** Lo mismo para una lista (Talla, Color, familia): se quedan solo las que la sede ofrece. */
export function valoresOfrecidos(valores: readonly string[], opciones: readonly string[]): string[] {
  return valores.filter((v) => opciones.includes(v));
}

/** Las tallas de la sede en su curva (XS · S · M · L, luego la numeración), la misma que la tarjeta: antes el combo las
 *  ordenaba como texto («10, 2, 4, Estándar, L, M, S, XL, XS»). */
export function tallasEnCurva(filas: readonly { talla: string | null }[]): string[] {
  return [...new Set(filas.map((f) => f.talla).filter((t): t is string => !!t))].sort(compararTallas);
}

/** Lo que de verdad filtra la lista, ya resuelto contra lo que la sede ofrece (`valorOfrecido`): lo mismo que dicen las
 *  píldoras, para que una etiqueta nunca nombre un filtro que no está actuando. */
export type FiltrosElegidos = Omit<FiltrosExistencias, "orden">;

/** Un chip por cosa puesta, siempre «Nombre: valor» como la píldora (igual que Productos); la búsqueda, entre comillas.
 *  `quitar` son las claves de la URL que lo apagan. */
export function chipsDeFiltros(f: FiltrosElegidos): { texto: string; quitar: ClaveUrl[] }[] {
  const chips: { texto: string; quitar: ClaveUrl[] }[] = [];
  if (f.q.trim()) chips.push({ texto: `«${f.q.trim()}»`, quitar: ["q"] });
  if (f.categoria) chips.push({ texto: `Categoría: ${f.categoria}`, quitar: ["cat"] });
  if (f.tallas.length) chips.push({ texto: `Talla: ${f.tallas.join(", ")}`, quitar: ["talla"] });
  const colores = [...f.familias.map((x) => `Familia ${textoDeFamilia(x)}`), ...f.colores];
  if (colores.length) chips.push({ texto: `Color: ${colores.join(", ")}`, quitar: ["color", "familia"] });
  if (f.hoy) chips.push({ texto: `Hoy: ${TEXTO_HOY[f.hoy]}`, quitar: ["hoy"] });
  if (f.condicion) chips.push({ texto: `Condición: ${ROTULO_CONDICION[f.condicion]}`, quitar: ["condicion"] });
  if (f.marca) chips.push({ texto: `Marca: ${f.marca}`, quitar: ["marca"] });
  return chips;
}

/** Cuántos filtros quitan prendas: lo dice el botón «Filtros · N». Ni la búsqueda (se ve en su caja) ni el orden (solo acomoda). */
export function contarFiltrosActivos(f: FiltrosElegidos): number {
  // Color y familia son un mismo filtro (el de color, con su lista agrupada por familia): cuentan una vez.
  const color = f.colores.length > 0 || f.familias.length > 0 ? 1 : 0;
  return [f.categoria, f.marca, f.hoy, f.condicion].filter((v) => v !== null).length + (f.tallas.length > 0 ? 1 : 0) + color;
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
  /** La familia del color (`colores.familia_color`: azul, neutro, tierra…). La pone la página con una lectura aparte y
   *  tolerante; ausente o null = sin familia (o la lectura falló): el color se filtra solo por su nombre. */
  colorFamilia?: string | null;
  planPiso?: Pick<PisoDeTalla, "accion"> | null;
  danado: number | null;
  /** Unidades apartadas para clientes (siguen en la tienda, no se venden ni se mueven). */
  apartado: number;
  pisoDisponible: number | null;
  almacenDisponible: number | null;
  /** El ritmo reciente de la talla en el piso (`existencias-ritmo.ts`): para «Se acaban» y «Sin ventas». Ausente o null = no se pudo calcular. */
  coberturaPiso?: CoberturaPiso | null;
  ritmoReciente?: RitmoReciente | null;
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

/** ¿La fila es de un color elegido, o de un color de una familia elegida? Sin nada elegido, sí. */
function coincideColor(f: FilaFiltrable, elegidos: FiltrosElegidos): boolean {
  if (elegidos.colores.length === 0 && elegidos.familias.length === 0) return true;
  return (f.color !== null && elegidos.colores.includes(f.color)) || (!!f.colorFamilia && elegidos.familias.includes(f.colorFamilia));
}

/** Los filtros visuales que NO son texto. `omitir` = los que se ignoran: el estado vacío los «relaja» de a uno para decir cuál
 *  deja la pantalla en blanco, y los conteos ignoran el suyo. «Hoy» y «Condición» son dos ejes: qué pide la talla y en qué
 *  condición está. */
export function pasaFiltros(f: FilaFiltrable, elegidos: FiltrosElegidos, omitir?: ReadonlySet<ClaveFiltro>): boolean {
  if (!omitir?.has("categoria") && elegidos.categoria !== null && f.categoria !== elegidos.categoria) return false;
  if (!omitir?.has("marca") && elegidos.marca !== null && f.marca !== elegidos.marca) return false;
  if (!omitir?.has("talla") && elegidos.tallas.length > 0 && !elegidos.tallas.includes(f.talla ?? "")) return false;
  if (!omitir?.has("color") && !coincideColor(f, elegidos)) return false;
  if (!omitir?.has("hoy") && elegidos.hoy !== null && hoyDeTalla(f) !== elegidos.hoy) return false;
  if (!omitir?.has("condicion") && elegidos.condicion !== null && !tieneCondicion(f, elegidos.condicion)) return false;
  return true;
}

export function tieneCondicion(f: FilaFiltrable, c: Condicion): boolean {
  switch (c) {
    case "danadas":
      return (f.danado ?? 0) > 0;
    case "apartadas":
      return f.apartado > 0;
    case "se_acaban":
      // Algo colgado que dura menos de una semana al ritmo medido. Sin ritmo medido (pocas jornadas) no se afirma nada.
      return (f.pisoDisponible ?? 0) > 0 && f.coberturaPiso?.tipo === "medida" && f.coberturaPiso.dias <= DIAS_SE_ACABA;
    case "sin_ventas":
      // Con jornadas suficientes en el piso y NINGUNA venta en la ventana (decisión de Felipe, 2026-09-25: se dice «sin ventas esta semana»,
      // nunca «nunca vende»). Con pocas jornadas (`insuficiente`) no se dice nada.
      return (f.pisoDisponible ?? 0) > 0 && f.ritmoReciente?.tipo === "sin_salida";
  }
}

/** La lista filtrada: el texto Y las píldoras, todo a la vez, como en Productos (2026-10-03). Antes, si el texto decía una talla
 *  o un color, mandaba sobre esa píldora en silencio: con «azul» escrito y Color en «Beige», el combo seguía diciendo «Beige»
 *  pero la lista traía azules. Ahora lo que se ve es lo que filtra; si no queda nada, el estado vacío dice qué quitar.
 *  `omitir` ignora los filtros que se pidan; `opciones` solo cambia el orden. */
export function filtrarExistencias<F extends FilaFiltrable>(
  indice: IndiceBusquedaEspecial<F>,
  elegidos: FiltrosElegidos,
  omitir?: ReadonlySet<ClaveFiltro>,
  opciones?: OpcionesDeOrden<F>
) {
  return filtrarConBusquedaEspecial(indice, elegidos.q, { otros: (f) => pasaFiltros(f, elegidos, omitir) }, opciones);
}

/* ====================================================================
   Cuántos productos trae cada opción (2026-10-03, como Productos ADR-0308): la barra esconde las opciones que dejarían la
   lista vacía y dice cuántos hay en cada una. El conteo es DISYUNTIVO: cada filtro cuenta con todos los demás puestos menos
   el suyo («¿cuántas Krisstell hay en cada talla?» mira la marca elegida, no la talla elegida, porque esa es la pregunta).
   La unidad es la TARJETA que trae la lista (`claveDeTarjeta`, ADR-0331 act. c): el producto (modelo) sin «Hoy», la prenda (modelo
   + color) con un caso de «Hoy» elegido. Es la misma del «N productos / N prendas» de arriba, así un número nunca contradice a la
   lista: antes «Por colgar · 5» traía 6 perchas, una escondida detrás de un punto de color.
   Se cuenta en el navegador sobre lo que ya llegó: TRU tiene ~2.300 tallas y seis pasadas son ~14.000 filas, milisegundos.
   ==================================================================== */

export const CLAVES_CONTEO: readonly ClaveFiltro[] = ["categoria", "marca", "talla", "color", "hoy", "condicion"];
/** filtro → { opción → cuántas tarjetas trae }. Una opción que no está tiene 0. */
export type ConteosFiltros = Record<ClaveFiltro, Record<string, number>>;

/** Las opciones de familia en la lista de Color: el mismo prefijo que `opcionesDeColor` (`lib/productos-filtros.ts`), para que
 *  el conteo y la opción se encuentren (lo vigila la prueba). */
export const PREFIJO_FAMILIA = "familia:";

/** Lo que vale una fila en cada filtro. En «Condición» puede valer dos cosas a la vez (dañada y apartada); en «Color», su
 *  color y su familia (cada una es una opción de la lista). */
function valoresDe(f: FilaFiltrable, clave: ClaveFiltro): (string | null | undefined)[] {
  switch (clave) {
    case "categoria":
      return [f.categoria];
    case "marca":
      return [f.marca];
    case "talla":
      return [f.talla];
    case "color":
      return [f.color, f.colorFamilia ? PREFIJO_FAMILIA + f.colorFamilia : null];
    case "hoy":
      return [hoyDeTalla(f)];
    case "condicion":
      return CONDICIONES.filter((c) => tieneCondicion(f, c));
  }
}

export function conteosDeFiltros<F extends FilaFiltrable>(indice: IndiceBusquedaEspecial<F>, elegidos: FiltrosElegidos): ConteosFiltros {
  const salida = {} as ConteosFiltros;
  for (const clave of CLAVES_CONTEO) {
    const tarjetas = new Map<string, Set<string>>();
    for (const f of filtrarExistencias(indice, elegidos, new Set([clave])).filas) {
      for (const v of valoresDe(f, clave)) {
        if (!v) continue;
        // Elegir un caso de «Hoy» pasa la lista a prendas; en los demás filtros manda el «Hoy» que ya está puesto.
        const tarjeta = claveDeTarjeta(f, clave === "hoy" ? (v as TipoHoy) : elegidos.hoy);
        const s = tarjetas.get(v);
        if (s) s.add(tarjeta);
        else tarjetas.set(v, new Set([tarjeta]));
      }
    }
    salida[clave] = Object.fromEntries([...tarjetas].map(([v, s]) => [v, s.size]));
  }
  return salida;
}
