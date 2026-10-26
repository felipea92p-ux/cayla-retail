import {
  FAMILIAS_DE_COLOR,
  familiaDeColorDeLaTienda,
  type FamiliaDeColor,
  type FamiliaDeColorId,
} from "@cayla-retail/shared/colores-de-la-tienda";

// Los filtros de COLOR y TALLA de la lista de la tienda (ADR-0512, actividad 2): la regla, pura y sin red, que usan el servidor (para
// armar la lista desde la dirección) y el navegador (para los números del panel). Nació de la maqueta que Felipe eligió
// (`docs/maquetas/tienda-filtros-2026-10/logica.js`, opción 1) y de su prueba de 51.439 comprobaciones; esta es la misma, en TypeScript.
//
// Las ocho reglas (lo que la tienda tiene que cumplir):
//  1. LA UNIDAD ES LA VARIANTE. «Negro y M» exige UNA variante negra en M con unidades. Si color y talla se filtraran por separado, saldría
//     una prenda con negro en S y beige en M, y al abrirla el negro no estaría en M (con los datos de Trujillo: 177 prendas de más).
//  2. Dentro de una faceta se SUMA (Negro o Blanco); entre facetas se CRUZA (y, en la misma variante).
//  3. Cada opción dice cuántas prendas DARÍA, contando lo demás elegido pero no su propia faceta (`contar`).
//  4. Una opción que daría 0 NO se puede elegir (`alternar` la rechaza): el estado «0 resultados» no se alcanza tocando filtros. Cambiar de
//     grupo o de categoría podría dejar 0: `alCambiarDeNivel` suelta lo que ahí no existe y DICE qué soltó. Y una opción ya elegida puede
//     quedar «muerta» (`muertas`: elegiste Morado y luego XL, y no hay morado en XL): sigue elegida, marcada, y se quita con un toque.
//  5. «Estándar» y «Única» son UNA opción para quien compra (`UNICA`); «S/M» cuenta como S y como M.
//  6. La talla solo se pide donde hay tallas de verdad (`Opciones.tallaRelevante`: dos o más que no sean la única). Donde no, ninguna talla
//     queda elegida (un filtro invisible cambiaría los números sin que nadie sepa por qué).
//  7. Al cambiar de grupo o de categoría, lo elegido que ahí no existe se suelta y se avisa.
//  8. El estado va en la dirección (`?color=negro,blanco&talla=M,UNICA`), en un orden fijo, y una dirección escrita a mano no se le cree.
//
// «Nivel» = las prendas de la lista tal como están ahora (el grupo, la categoría, la campaña y la tienda ya aplicados): quien llama le
// pasa sus ids. Aquí no se sabe de grupos ni de categorías.

// ---------------------------------------------------------------- Lo que manda la base (`retail.tienda_filtros`)

export type VarianteDisponible = { prenda: string; color: string | null; talla: string };

export type DatosDeFiltros = {
  sede: string | null;
  variantes: readonly VarianteDisponible[];
  /** El color → su `familia_color` del ERP (o null): el respaldo de un color que la tabla de la tienda todavía no conozca. */
  colores: Readonly<Record<string, string | null>>;
};

/**
 * Lee lo que respondió `retail.tienda_filtros`. Una variante rota se salta (nunca tira a las demás); si la respuesta entera no es lo que
 * se espera, `null`: la lista se ve sin filtros y la persona no pierde nada (principio 9).
 */
export function interpretarFiltros(crudo: unknown): DatosDeFiltros | null {
  if (typeof crudo !== "object" || crudo === null) return null;
  const { sede, variantes, colores } = crudo as { sede?: unknown; variantes?: unknown; colores?: unknown };
  if (!Array.isArray(variantes)) return null;
  const buenas: VarianteDisponible[] = [];
  for (const v of variantes as unknown[]) {
    if (Array.isArray(v) && v.length >= 3 && typeof v[0] === "string" && (typeof v[1] === "string" || v[1] === null) && typeof v[2] === "string") {
      buenas.push({ prenda: v[0], color: v[1], talla: v[2] });
    }
  }
  const dichos: Record<string, string | null> = {};
  if (typeof colores === "object" && colores !== null) {
    for (const [codigo, familia] of Object.entries(colores)) if (typeof familia === "string" || familia === null) dichos[codigo] = familia;
  }
  return { sede: typeof sede === "string" ? sede : null, variantes: buenas, colores: dichos };
}

// ---------------------------------------------------------------- Las tallas

/** La talla «Estándar / única»: para quien compra, una sola opción (en la base son dos: «Estándar» y «Única»). */
export const UNICA = "UNICA";
const LETRAS = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/**
 * Las opciones de talla que cuenta una talla de la base: «Estándar» y «Única» son `UNICA`; «S/M» cuenta como S y como M; una letra, en
 * mayúsculas; cualquier otra (una cintura, un número, un nombre raro) se queda como está.
 */
export function clavesDeTalla(valor: string): string[] {
  const v = valor.trim();
  if (/^(est[aá]ndar|[uú]nica)$/i.test(v)) return [UNICA];
  const doble = /^([a-z]+)\s*\/\s*([a-z]+)$/i.exec(v);
  if (doble) {
    const [a, b] = [doble[1].toUpperCase(), doble[2].toUpperCase()];
    if (LETRAS.some((l) => l === a) && LETRAS.some((l) => l === b)) return [a, b];
  }
  return [LETRAS.some((l) => l === v.toUpperCase()) ? v.toUpperCase() : v];
}

/** Cómo se agrupan las tallas en el panel: las de ropa (letras), las cinturas (26 a 34), los números (35 en adelante), la única y lo demás. */
export type SistemaDeTalla = "letra" | "cintura" | "numero" | "unica" | "otra";

export function sistemaDeTalla(clave: string): SistemaDeTalla {
  if (clave === UNICA) return "unica";
  if (LETRAS.some((l) => l === clave)) return "letra";
  if (/^\d+$/.test(clave)) {
    const n = Number(clave);
    return n >= 20 && n <= 34 ? "cintura" : "numero";
  }
  return "otra";
}

const RANGO_DEL_SISTEMA: Record<SistemaDeTalla, number> = { letra: 0, cintura: 1, numero: 2, otra: 3, unica: 4 };

/** Las tallas en el orden de la tienda: XS a XXL, las cinturas y los números de menor a mayor, lo demás por nombre y la única al final. */
export function compararTallas(a: string, b: string): number {
  const [sa, sb] = [sistemaDeTalla(a), sistemaDeTalla(b)];
  if (sa !== sb) return RANGO_DEL_SISTEMA[sa] - RANGO_DEL_SISTEMA[sb];
  if (sa === "letra") return LETRAS.indexOf(a as (typeof LETRAS)[number]) - LETRAS.indexOf(b as (typeof LETRAS)[number]);
  if (sa === "cintura" || sa === "numero") return Number(a) - Number(b);
  return a.localeCompare(b, "es");
}

/** Cómo se llama una talla para quien compra («UNICA» → «Estándar / única»; las demás, tal cual). */
export function etiquetaDeTalla(clave: string): string {
  return clave === UNICA ? "Estándar / única" : clave;
}

// ---------------------------------------------------------------- Lo elegido y la dirección

export type Faceta = "color" | "talla";
export type Elegido = { readonly color: readonly FamiliaDeColorId[]; readonly talla: readonly string[] };
export const NADA_ELEGIDO: Elegido = { color: [], talla: [] };
export const hayElegido = (e: Elegido): boolean => e.color.length + e.talla.length > 0;

const ORDEN_DE_FAMILIA: ReadonlyMap<FamiliaDeColorId, number> = new Map(FAMILIAS_DE_COLOR.map((f, i) => [f.id, i]));
const IDS_DE_FAMILIA: ReadonlySet<string> = new Set(FAMILIAS_DE_COLOR.map((f) => f.id));
/** Cuántas opciones de una faceta se leen de la dirección: más que las que existen no tiene sentido (y es lo que pone un abuso). */
const MAXIMO_LEIDO = 24;

/** Lo elegido, sin repetir y en el orden fijo de la tienda (las familias como la paleta, las tallas como `compararTallas`). */
export function ordenar(e: Elegido): Elegido {
  const color = [...new Set(e.color)].sort((a, b) => (ORDEN_DE_FAMILIA.get(a) ?? 99) - (ORDEN_DE_FAMILIA.get(b) ?? 99));
  const talla = [...new Set(e.talla)].sort(compararTallas);
  return { color, talla };
}

const partes = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v[0] : v)
    ?.split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= 24)
    .slice(0, MAXIMO_LEIDO) ?? [];

/**
 * Lo elegido que trae la dirección (`?color=negro,blanco&talla=M,UNICA`). Lo que no es una familia, o una talla que se pueda escribir,
 * se ignora: nunca falla. Lo que sí es una familia o una talla pero no existe en esta lista lo quita `alCambiarDeNivel`.
 */
export function leerElegido(sp: { color?: string | string[]; talla?: string | string[] }): Elegido {
  const color = partes(sp.color)
    .map((c) => c.toLowerCase())
    .filter((c): c is FamiliaDeColorId => IDS_DE_FAMILIA.has(c));
  const talla = partes(sp.talla).flatMap((t) => clavesDeTalla(t));
  return ordenar({ color, talla });
}

/** Lo elegido como lo escribe la dirección: solo lo que hay (sin `color` ni `talla` vacíos), siempre en el mismo orden. */
export function escribirElegido(e: Elegido): { color?: string; talla?: string } {
  const o = ordenar(e);
  const salida: { color?: string; talla?: string } = {};
  if (o.color.length > 0) salida.color = o.color.join(",");
  if (o.talla.length > 0) salida.talla = o.talla.join(",");
  return salida;
}

// ---------------------------------------------------------------- El índice

export type VarianteIndexada = { codigo: string | null; familia: FamiliaDeColorId | null; tallas: readonly string[] };
/** Cada prenda con sus variantes que hay (color ya llevado a su familia de la tienda, talla ya llevada a sus opciones). */
export type Indice = ReadonlyMap<string, readonly VarianteIndexada[]>;

export function indexar(datos: DatosDeFiltros): Indice {
  const indice = new Map<string, VarianteIndexada[]>();
  for (const v of datos.variantes) {
    const familia = familiaDeColorDeLaTienda(v.color, v.color ? datos.colores[v.color] : null);
    const lista = indice.get(v.prenda) ?? [];
    lista.push({ codigo: v.color, familia, tallas: clavesDeTalla(v.talla) });
    indice.set(v.prenda, lista);
  }
  return indice;
}

const sinVariantes: readonly VarianteIndexada[] = [];
const variantesDe = (indice: Indice, prenda: string) => indice.get(prenda) ?? sinVariantes;

function cumple(v: VarianteIndexada, e: Elegido, ignorar?: Faceta): boolean {
  const color = ignorar === "color" || e.color.length === 0 || (v.familia !== null && e.color.includes(v.familia));
  const talla = ignorar === "talla" || e.talla.length === 0 || v.tallas.some((t) => e.talla.includes(t));
  return color && talla;
}

/**
 * ¿La prenda cumple lo elegido? Sin nada elegido, todas (incluida la que no tiene variantes: la lista de hoy no la esconde). Con algo
 * elegido, solo la que tiene UNA variante que cumple color y talla a la vez (regla 1).
 */
export function prendaPasa(indice: Indice, prenda: string, e: Elegido): boolean {
  return !hayElegido(e) || variantesDe(indice, prenda).some((v) => cumple(v, e));
}

/** Las variantes de la prenda que cumplen lo elegido (para decir «En Negro · talla M» y llevar el color y la talla a la ficha). */
export function variantesQueCoinciden(indice: Indice, prenda: string, e: Elegido): readonly VarianteIndexada[] {
  return variantesDe(indice, prenda).filter((v) => cumple(v, e));
}

// ---------------------------------------------------------------- Las opciones y sus números

export type Opciones = {
  /** Las familias que hay en este nivel, en el orden de la paleta. */
  familias: readonly FamiliaDeColor[];
  /** Las tallas que hay, en el orden de la tienda. */
  tallas: readonly string[];
  /** ¿Se pide talla aquí? Dos o más que no sean la única (regla 6). */
  tallaRelevante: boolean;
};

/** Lo que hay en este nivel, sin mirar lo elegido: decide qué opciones se dibujan. */
export function opcionesDelNivel(indice: Indice, delNivel: readonly string[]): Opciones {
  const familias = new Set<FamiliaDeColorId>();
  const tallas = new Set<string>();
  for (const id of delNivel) {
    for (const v of variantesDe(indice, id)) {
      if (v.familia) familias.add(v.familia);
      for (const t of v.tallas) tallas.add(t);
    }
  }
  const ordenadas = [...tallas].sort(compararTallas);
  return {
    familias: FAMILIAS_DE_COLOR.filter((f) => familias.has(f.id)),
    tallas: ordenadas,
    tallaRelevante: ordenadas.filter((t) => t !== UNICA).length >= 2,
  };
}

export type Conteos = {
  /** Cuántas prendas daría cada familia, contando la talla elegida pero no el color elegido. */
  color: ReadonlyMap<FamiliaDeColorId, number>;
  /** Cuántas daría cada talla, contando el color elegido pero no la talla elegida. */
  talla: ReadonlyMap<string, number>;
  /** Cuántas prendas del nivel cumplen todo lo elegido. */
  total: number;
};

export function contar(indice: Indice, delNivel: readonly string[], e: Elegido): Conteos {
  const color = new Map<FamiliaDeColorId, number>();
  const talla = new Map<string, number>();
  let total = 0;
  for (const id of delNivel) {
    const familias = new Set<FamiliaDeColorId>();
    const tallas = new Set<string>();
    let cumpleTodo = false;
    for (const v of variantesDe(indice, id)) {
      if (v.familia && cumple(v, e, "color")) familias.add(v.familia);
      if (cumple(v, e, "talla")) for (const t of v.tallas) tallas.add(t);
      if (cumple(v, e)) cumpleTodo = true;
    }
    for (const f of familias) color.set(f, (color.get(f) ?? 0) + 1);
    for (const t of tallas) talla.set(t, (talla.get(t) ?? 0) + 1);
    if (cumpleTodo) total += 1;
  }
  return { color, talla, total };
}

export type Soltado = { color: readonly FamiliaDeColorId[]; talla: readonly string[] };
const NADA_SOLTADO: Soltado = { color: [], talla: [] };
export const huboSoltado = (s: Soltado): boolean => s.color.length + s.talla.length > 0;

/**
 * Lo elegido que quedó «muerta»: elegida, pero sin ninguna prenda con lo que se sumó en la OTRA faceta (regla 4). Los resultados no se
 * vacían (otra opción de su faceta los sostiene); la pantalla la marca y se quita con un toque.
 */
export function muertas(indice: Indice, delNivel: readonly string[], e: Elegido): Soltado {
  const c = contar(indice, delNivel, e);
  return { color: e.color.filter((f) => !((c.color.get(f) ?? 0) > 0)), talla: e.talla.filter((t) => !((c.talla.get(t) ?? 0) > 0)) };
}

// ---------------------------------------------------------------- Cambiar lo elegido

export type Cambio = { elegido: Elegido; soltado: Soltado };

/**
 * Suma o quita una opción (reglas 4 y 6). Sumar una que daría 0, o una talla donde no se pide talla, se rechaza (`hecho: false`).
 * Quitar siempre se puede; si lo que queda de esa faceta son solo opciones muertas, quitar la última viva dejaría 0, así que se
 * sueltan también (y se dice en `soltado`).
 */
export function alternar(indice: Indice, delNivel: readonly string[], e: Elegido, faceta: Faceta, valor: string): Cambio & { hecho: boolean } {
  const actuales: readonly string[] = faceta === "color" ? e.color : e.talla;
  const nuevo = (lista: readonly string[]): Elegido =>
    ordenar(faceta === "color" ? { color: lista as readonly FamiliaDeColorId[], talla: e.talla } : { color: e.color, talla: lista });

  if (actuales.includes(valor)) {
    let resto = actuales.filter((x) => x !== valor);
    let soltado = NADA_SOLTADO;
    if (resto.length > 0 && contar(indice, delNivel, nuevo(resto)).total === 0) {
      soltado = faceta === "color" ? { color: resto as readonly FamiliaDeColorId[], talla: [] } : { color: [], talla: resto };
      resto = [];
    }
    return { elegido: nuevo(resto), soltado, hecho: true };
  }

  const pide = faceta === "color" || opcionesDelNivel(indice, delNivel).tallaRelevante;
  const c = contar(indice, delNivel, e);
  const da = (faceta === "color" ? c.color.get(valor as FamiliaDeColorId) : c.talla.get(valor)) ?? 0;
  if (!pide || da === 0) return { elegido: ordenar(e), soltado: NADA_SOLTADO, hecho: false };
  return { elegido: nuevo([...actuales, valor]), soltado: NADA_SOLTADO, hecho: true };
}

/**
 * Lo elegido, llevado a un nivel nuevo (otro grupo, otra categoría, o una dirección escrita a mano). Lo que ahí NO EXISTE se suelta; donde no
 * se pide talla, se sueltan todas; y si aun así no quedara nada que ver, se suelta la talla y, si todavía no, el color (regla 7). El nivel
 * nunca queda vacío por lo elegido: lo que pasa de ahí lo dice `soltado`.
 */
export function alCambiarDeNivel(indice: Indice, delNuevoNivel: readonly string[], e: Elegido): Cambio {
  const hay = opcionesDelNivel(indice, delNuevoNivel);
  const familiasQueHay = new Set(hay.familias.map((f) => f.id));
  const tallasQueHay = new Set(hay.tallas);
  let color = e.color.filter((f) => familiasQueHay.has(f));
  let talla = e.talla.filter((t) => tallasQueHay.has(t));
  if (talla.length > 0 && !hay.tallaRelevante) talla = [];
  if (contar(indice, delNuevoNivel, { color, talla }).total === 0) talla = [];
  if (contar(indice, delNuevoNivel, { color, talla }).total === 0) color = [];
  const elegido = ordenar({ color, talla });
  return {
    elegido,
    soltado: {
      color: e.color.filter((f) => !elegido.color.includes(f)),
      talla: e.talla.filter((t) => !elegido.talla.includes(t)),
    },
  };
}

/** Quita lo elegido de una faceta o, sin faceta, todo. */
export function limpiar(e: Elegido, faceta?: Faceta): Elegido {
  return ordenar({ color: faceta === "talla" ? e.color : [], talla: faceta === "color" ? e.talla : [] });
}
