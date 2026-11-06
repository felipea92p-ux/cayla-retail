import { categoriasDe, claveCategoria, hrefDePrenda, soles, type Prenda } from "./catalogo";
import { lasNuevas } from "./inicio";

// La portada «L» de la tienda (ADR-0613, regla de Felipe del 2026-11-05): las últimas prendas que entraron de las tres categorías con lo más
// reciente, siempre con foto. Primero sale la última de cada una, después la penúltima y la antepenúltima: tres grupos de tres, nueve prendas.
// Es automática: sigue sola lo que llega, lo que se agota y lo que deja de ser nuevo a los 30 días, sin que nadie tenga que armar nada.

const GRUPOS_A_LA_VEZ = 3;
const PRENDAS_POR_GRUPO = 3;

/**
 * Los fondos, en tonos pastel (Felipe 2026-11-05). El texto va siempre en este tono oscuro: sobre todos pasa de 9:1.
 * Los suaves van primero; los medios solo entran cuando la prenda es tan clara que en un suave se perdería.
 */
const PASTEL_SUAVES = ["#CFDCCB", "#CBDBE8", "#F0D6D4", "#F3E7BD", "#DDD5E8"] as const;
const PASTEL_MEDIOS = ["#A9C2AE", "#A5BEDB", "#E3AFB3", "#BDB0DC", "#E8C98F"] as const;
/** @internal La prueba recorre todos para medir el contraste. */
export const FONDOS_PASTEL = [...PASTEL_SUAVES, ...PASTEL_MEDIOS];
export const TEXTO_DE_PORTADA = "#17110D";
/** Qué tan distinto debe verse el fondo de la prenda (distancia de color CIE76): por debajo, la prenda se pierde. */
const DISTANCIA_MINIMA = 22;

export type Rgb = readonly [number, number, number];

export type PrendaDePortada = { id: string; nombre: string; precio: string; href: string; foto: string; color: Rgb | null };
export type GrupoDePortada = { prendas: PrendaDePortada[] };

/** El color de la prenda que se ve en su primera foto; si no se sabe cuál es, el primero que tiene. */
const colorDeLaFoto = (p: Prenda): string | null => (p.colores.find((c) => c.foto && c.foto === p.fotos[0]) ?? p.colores[0])?.hex ?? null;

const canales = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Una prenda blanca o muy clara no se puede recortar: se confunde con el fondo blanco de su foto. */
const esMuyClara = (p: Prenda): boolean => {
  const hex = colorDeLaFoto(p);
  return hex ? Math.min(...canales(hex)) >= 225 : false;
};

/** El color en CIELAB, donde la distancia se parece a lo que ve el ojo. */
function aLab([r, g, b]: Rgb): Rgb {
  const lineal = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const [rl, gl, bl] = [lineal(r), lineal(g), lineal(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047);
  const y = f(0.2126 * rl + 0.7152 * gl + 0.0722 * bl);
  const z = f((0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** @internal La prueba mide con ella que ninguna prenda se pierda en su fondo. */
export function distanciaDeColor(a: Rgb, b: Rgb): number {
  const [la, lb] = [aLab(a), aLab(b)];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/**
 * El fondo de cada prenda de un grupo: tres pasteles distintos y, para cada prenda, uno que se distinga de ella. Elige primero la prenda con menos
 * opciones, para que otra no le quite la única que le servía, y empieza por un tono distinto en cada grupo (`turno`). Sin saber el color, el siguiente libre.
 */
export function fondosDelGrupo(colores: readonly (Rgb | null)[], turno: number): string[] {
  const libres: string[] = [...PASTEL_SUAVES.map((_, i) => PASTEL_SUAVES[(turno + i) % PASTEL_SUAVES.length]), ...PASTEL_MEDIOS];
  const sirve = (color: Rgb | null, fondo: string) => !color || distanciaDeColor(color, canales(fondo)) >= DISTANCIA_MINIMA;
  const opciones = (color: Rgb | null) => libres.filter((f) => sirve(color, f)).length;
  const orden = colores.map((_, i) => i).sort((a, b) => opciones(colores[a]) - opciones(colores[b]));
  const fondos: string[] = [];
  for (const i of orden) {
    const color = colores[i];
    const elegido =
      libres.find((f) => sirve(color, f)) ?? [...libres].sort((a, b) => distanciaDeColor(color as Rgb, canales(b)) - distanciaDeColor(color as Rgb, canales(a)))[0];
    libres.splice(libres.indexOf(elegido), 1);
    fondos[i] = elegido;
  }
  return fondos;
}

function prendaDePortada(p: Prenda, sede: string | null): PrendaDePortada {
  const hex = colorDeLaFoto(p);
  return { id: p.id, nombre: p.nombre, precio: soles(p.precioFinal), href: hrefDePrenda(p, sede), foto: p.fotos[0], color: hex ? canales(hex) : null };
}

/**
 * Los grupos de la portada, hasta tres. `prendas` ya viene con lo que hay en la tienda elegida. Las categorías van de la que recibió algo hace
 * menos a la que hace más, y cada grupo toma la siguiente prenda de sus tres categorías. Si una se queda sin prendas, la reemplaza la que sigue,
 * sin repetir ninguna prenda (hoy Lima tiene una sola prenda nueva de Polos). Sin tres prendas, `[]`: sigue la portada de siempre.
 */
export function gruposDeLaPortada(prendas: readonly Prenda[], sede: string | null): GrupoDePortada[] {
  const porCategoria = new Map<string, Prenda[]>();
  for (const p of lasNuevas(prendas)) {
    const clave = claveCategoria(p.categoria);
    if (!clave || !p.fotos[0] || esMuyClara(p)) continue;
    porCategoria.set(clave, [...(porCategoria.get(clave) ?? []), p]);
  }
  // `lasNuevas` ya las ordena por llegada: la primera categoría que aparece es la que recibió algo hace menos.
  const filas = [...porCategoria.values()];
  const enUso = filas.slice(0, PRENDAS_POR_GRUPO);
  let siguiente = enUso.length;
  const grupos: GrupoDePortada[] = [];
  for (let g = 0; g < GRUPOS_A_LA_VEZ; g++) {
    const elegidas: PrendaDePortada[] = [];
    for (let lugar = 0; lugar < PRENDAS_POR_GRUPO; lugar++) {
      while ((enUso[lugar]?.length ?? 0) === 0 && siguiente < filas.length) enUso[lugar] = filas[siguiente++];
      // Sin más categorías, lo que quede de las que ya están: mejor dos prendas del mismo tipo que un panel vacío.
      const fila = enUso[lugar]?.length ? enUso[lugar] : filas.find((f) => f.length > 0);
      const p = fila?.shift();
      if (p) elegidas.push(prendaDePortada(p, sede));
    }
    if (elegidas.length < PRENDAS_POR_GRUPO) break;
    grupos.push({ prendas: elegidas });
  }
  return grupos;
}

export type CategoriaConFoto = { clave: string; nombre: string; foto: string; fondo: string };

/**
 * Una prenda por categoría, para la fila de categorías: la más vendida con foto o, si ninguna tiene puesto, la que llegó hace menos. Sale de lo
 * que hay ahora en la tienda elegida, así que nunca muestra algo agotado. El fondo es el color de esa prenda, muy suave.
 */
export function categoriasConFoto(prendas: readonly Prenda[]): CategoriaConFoto[] {
  return categoriasDe(prendas).flatMap((c) => {
    const suyas = prendas.filter((p) => claveCategoria(p.categoria) === c.clave && p.fotos[0]);
    if (suyas.length === 0) return [];
    const mejor = [...suyas].sort((a, b) => (a.vendidos ?? 99) - (b.vendidos ?? 99) || (a.nuevo?.dias ?? 99) - (b.nuevo?.dias ?? 99))[0];
    return [{ clave: c.clave, nombre: c.nombre, foto: mejor.fotos[0], fondo: !esMuyClara(mejor) ? (colorDeLaFoto(mejor) ?? "#8f8f8c") : "#8f8f8c" }];
  });
}

/** Las prendas de la sección de abajo: las mismas de la portada, y si son pocas, lo último que llegó. Sin repetir, hasta nueve. */
export function prendasDeAbajo(prendas: readonly Prenda[], grupos: readonly GrupoDePortada[]): Prenda[] {
  const porId = new Map(prendas.map((p) => [p.id, p]));
  const lista = grupos.flatMap((g) => g.prendas.flatMap((x) => porId.get(x.id) ?? []));
  for (const p of lasNuevas(prendas)) if (!lista.includes(p)) lista.push(p);
  return lista.slice(0, 9);
}
