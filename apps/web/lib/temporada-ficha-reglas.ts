/**
 * La temporada de UNA prenda, en la ficha y en el alta (ADR-0246). Reglas puras (sin React ni supabase) que usan
 * `ProductoForm`, `NuevoProductoForm` y `catalogo-v2.ts`.
 *
 * Lo compartido con la pestaña «Temporadas» de Atributos (las opciones del desplegable, el nombre de cada clave, la
 * lista «Sin temporada») vive en `temporada-reglas.ts` y no se repite aquí. Aquí solo va lo propio de editar una
 * prenda: qué colores se ofrecen para tener su propia temporada, qué cambió contra lo que había al abrir la ficha y
 * qué viaja a la base.
 *
 * Y lo que NO vive en ningún archivo de la web, a propósito: cuál es la temporada de una prenda (color → producto →
 * categoría). Esa regla es UNA y está en la base (`retail.fn_temporada_efectiva`).
 */

import { SIN_PROPIA, type TemporadaEfectiva } from "./temporada-reglas";

/**
 * La sección «Temporada por color» aparece desde dos colores. Con uno solo, la temporada del producto YA es la de ese
 * color: ofrecerle «su propia temporada» sería un segundo lugar para decir lo mismo, y dos lugares se contradicen.
 * Salvo cuando ese color YA tiene una guardada (ver `ofrecerTemporadaPorColor`).
 */
export const MIN_COLORES_PARA_TEMPORADA_POR_COLOR = 2;

/**
 * ¿Se muestra «Temporada por color»? Desde dos colores activos; y también con uno solo si ese color ya tiene su propia
 * temporada guardada, o si la ficha no sabe si la tiene (`desconocidos`). La excepción de la base sigue mandando aunque la
 * prenda se quede con un color: esconder la sección la dejaría mandar sin que nadie la vea ni pueda quitarla.
 */
export function ofrecerTemporadaPorColor(
  colores: readonly string[],
  guardadas: Readonly<Record<string, string>>,
  desconocidos: readonly string[] = [],
): boolean {
  return colores.length >= MIN_COLORES_PARA_TEMPORADA_POR_COLOR || colores.some((c) => !!guardadas[c] || desconocidos.includes(c));
}

/**
 * Los colores activos AHORA en la ficha cuya temporada propia no se sabe: los que al abrirla tenían todas sus variantes
 * apagadas. `fn_temporada_efectiva` solo mira variantes activas, así que la excepción de un color apagado (la base la
 * conserva) no llega a la ficha; si alguien lo reactiva, mostrarle «Igual que su prenda» sería mentir sobre lo guardado.
 * Un color que la prenda nunca tuvo no entra: no puede tener excepción.
 */
export function coloresSinTemporadaConocida(
  alAbrir: readonly { colorCodigo: string | null; activo: boolean }[],
  coloresActivos: readonly string[],
): string[] {
  const conocidos = new Set(alAbrir.filter((v) => v.activo && v.colorCodigo).map((v) => v.colorCodigo));
  const existian = new Set(alAbrir.map((v) => v.colorCodigo).filter(Boolean));
  return coloresActivos.filter((c) => existian.has(c) && !conocidos.has(c));
}

/**
 * Las excepciones que la prenda ya tiene guardadas: color → clave. Sale de `fn_temporada_efectiva` (origen «color»):
 * un color que sigue a su prenda o a su categoría no está en el resultado.
 */
export function temporadasPropiasPorColor(filas: readonly TemporadaEfectiva[]): Record<string, string> {
  const propias: Record<string, string> = {};
  for (const f of filas) if (f.origen === "color" && f.color_codigo && f.temporada) propias[f.color_codigo] = f.temporada;
  return propias;
}

/**
 * Los colores de la ficha a los que se les puede poner temporada propia: los de las variantes ACTIVAS (una variante
 * apagada ya no se vende y la base tampoco la cuenta), sin repetir, en el orden en que aparecen en la tabla.
 */
export function coloresConVariantesActivas(variantes: readonly { colorCodigo: string; activo: boolean }[]): string[] {
  const vistos: string[] = [];
  for (const v of variantes) if (v.activo && v.colorCodigo && !vistos.includes(v.colorCodigo)) vistos.push(v.colorCodigo);
  return vistos;
}

/**
 * Qué colores cambiaron de temporada contra lo que había al abrir la ficha, listo para `asignar_temporadas`:
 * `{CODIGO: clave}` le pone (o le cambia) su temporada propia; `{CODIGO: null}` se la quita y el color vuelve a seguir a
 * su prenda. Solo los colores que siguen en la ficha y cambiaron de verdad: mandar los que nadie tocó dejaría en el
 * historial un «cambio» que nadie hizo. `null` si no hay nada que guardar (y entonces no se llama a la base).
 */
export function cambiosTemporadaPorColor(
  colores: readonly string[],
  elegidas: Readonly<Record<string, string>>,
  originales: Readonly<Record<string, string>>,
): Record<string, string | null> | null {
  const cambios: Record<string, string | null> = {};
  for (const color of colores) {
    const ahora = elegidas[color] ?? SIN_PROPIA;
    const antes = originales[color] ?? SIN_PROPIA;
    if (ahora !== antes) cambios[color] = ahora === SIN_PROPIA ? null : ahora;
  }
  return Object.keys(cambios).length > 0 ? cambios : null;
}

/**
 * La clave que tendría un color que no tiene la suya: la temporada propia de la prenda (lo elegido en la ficha, aún sin
 * guardar) o, si la prenda tampoco tiene, la de su categoría. Es el «(Verano)» de «Igual que su prenda (Verano)».
 */
export function temporadaHeredadaPorColor(propiaDeLaPrenda: string, deSuCategoria: string | null | undefined): string | null {
  return propiaDeLaPrenda !== SIN_PROPIA ? propiaDeLaPrenda : (deSuCategoria ?? null);
}

/**
 * Lo que viaja al alta: `p_temporada` SOLO si se eligió una. La opción de herencia («Igual que su categoría…» o «Sin
 * temporada») no manda nada: así la prenda sigue a su categoría si mañana esta cambia, y el alta sigue funcionando en
 * una base donde el SQL de temporadas todavía no está (la versión vieja de la función no conoce el parámetro).
 */
export function temporadaParaAlta(elegida: string): string | undefined {
  return elegida === SIN_PROPIA ? undefined : elegida;
}
