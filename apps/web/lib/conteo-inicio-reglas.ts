/**
 * Las frases y cuentas chicas del INICIO de Conteo (`/inventario/conteo`), sin red ni React, para probarlas aparte:
 * lo que dice «dónde» bajo cada lugar, cómo se lee una fila del historial y qué falta para poder empezar. Las reglas
 * del conteo en sí (estados, resultado, textos de progreso) viven en `conteo-reglas.ts`; esto solo arma la pantalla de
 * arranque encima de ellas.
 */

import { diaYHoraLima } from "./fechas-lima";
import { resultadoConteo, type ConteoResumen } from "./conteo-reglas";
import { tolerar } from "./resultado";

/** Cuántos conteos trae el historial del inicio (`fn_conteos_resumen`, del más reciente al más antiguo). */
export const LIMITE_HISTORIAL_CONTEO = 20;

/**
 * La línea bajo «Almacén de tienda» / «Piso de venta» al elegir dónde contar: el último conteo de ESE lugar que sí dijo algo
 * del inventario, «Último conteo: 12 · 28/09». Un conteo cancelado (o cerrado sin ninguna variante verificada) no cuenta: no
 * midió nada. Uno parcial sí: verificó una parte. El que sigue en curso tampoco: todavía no terminó.
 *
 * `conteos` viene del más reciente al más antiguo. Si el lugar no aparece pero el historial llegó a su tope, puede que su
 * último conteo sea más viejo que la ventana: se dice «Sin conteo reciente» en vez de afirmar que nunca se contó.
 */
export function textoUltimoConteo(conteos: readonly ConteoResumen[], sububicacionId: string, limite: number = LIMITE_HISTORIAL_CONTEO): string {
  const ultimo = conteos.find((c) => {
    if (c.sububicacionId !== sububicacionId) return false;
    const r = resultadoConteo(c);
    return r === "todo_correcto" || r === "con_diferencias" || r === "parcial";
  });
  if (ultimo) return `Último conteo: ${ultimo.numero} · ${diaYHoraLima(ultimo.cerradoEn ?? ultimo.creadoEn).dia}`;
  return conteos.length >= limite ? "Sin conteo reciente" : "Nunca se contó";
}

/** La clave de «toda la ubicación» en `AlcanceConteo`: lo que cuenta una sede que no separa piso y almacén (el Taller). */
export const TODA_LA_UBICACION = "toda";

/** Una fila de `fn_conteo_alcance`: cuántas variantes traería un conteo de ese lugar y esa categoría (`sububicacion_id` NULL = toda la ubicación). */
export type FilaAlcance = { sububicacion_id: string | null; categoria_id: string | null; variantes: number };

/** Cuántas VARIANTES (nunca unidades: el conteo es a ciegas) trae un conteo de cada lugar, en total y por categoría. Clave: id de sububicación o `TODA_LA_UBICACION`. */
export type AlcanceConteo = Record<string, { total: number; porCategoria: Record<string, number> }>;

/**
 * Ordena las filas de `fn_conteo_alcance` para preguntarlas por lugar. Un producto sin categoría (`categoria_id` NULL) suma al total
 * del lugar pero no aparece en ninguna categoría: no hay chip para elegirlo, y un conteo «Todo» sí lo incluye.
 */
export function armarAlcance(filas: readonly FilaAlcance[]): AlcanceConteo {
  const out: AlcanceConteo = {};
  for (const f of filas) {
    const lugar = (out[f.sububicacion_id ?? TODA_LA_UBICACION] ??= { total: 0, porCategoria: {} });
    lugar.total += f.variantes;
    if (f.categoria_id) lugar.porCategoria[f.categoria_id] = (lugar.porCategoria[f.categoria_id] ?? 0) + f.variantes;
  }
  return out;
}

/**
 * La respuesta de `fn_conteo_alcance` ya leída: las cifras, o `null` y el porqué si la base no pudo darlas. Es la mitad de «dato de apoyo»
 * de la tarjeta de abrir: si la función todavía no existe en la base (la web salió antes que el SQL) o falla, la tarjeta se dibuja sin
 * cifras y abrir un conteo sigue funcionando. Un mapa vacío (`{}`) NO es lo mismo que `null`: es una sede sin stock, con todo en cero.
 */
export function alcanceDeRespuesta(respuesta: { data: readonly FilaAlcance[] | null; error: { message: string } | null }): { alcance: AlcanceConteo | null; fallo: string | null } {
  const { datos, fallo } = tolerar(respuesta, "cuántas variantes trae cada conteo");
  return { alcance: datos ? armarAlcance(datos) : null, fallo };
}

/**
 * Las categorías con prendas en el lugar elegido, primero: una sede real tiene decenas de categorías y en un piso o un almacén casi
 * todas están en 0, así que en orden alfabético las que sí se cuentan quedarían enterradas. Con el mismo número, el orden de siempre
 * (por nombre). Sin cifras (`cifraDe` nulo) no hay nada que ordenar: se devuelve tal cual.
 */
export function categoriasPorVariantes<T extends { id: string }>(categorias: readonly T[], cifraDe: ((categoriaId: string) => number) | null): T[] {
  if (!cifraDe) return [...categorias];
  return [...categorias].sort((a, b) => cifraDe(b.id) - cifraDe(a.id));
}

/**
 * Cuántas variantes traería el conteo que se está armando, o `null` si todavía no se sabe: no se cargó la cifra (la función no está en
 * la base o falló) o falta elegir el lugar. Con categoría, las de esa categoría en ese lugar (0 si no tiene ninguna registrada allí: un
 * conteo así solo serviría para encontrar prendas que aparecieron donde no estaban, y por eso no se bloquea).
 */
export function variantesDelConteo(alcance: AlcanceConteo | null, lugar: string | null, categoriaId: string | null): number | null {
  if (!alcance || !lugar) return null;
  const l = alcance[lugar];
  if (!l) return 0;
  return categoriaId ? (l.porCategoria[categoriaId] ?? 0) : l.total;
}

/**
 * El sufijo `?variantes=id,id` de «Contar esta prenda» (ADR-0241) para la ruta del conteo, o vacío si no hay ninguna. Los ids
 * ya vienen validados (`idsDeParam`): son uuids, y la coma se queda tal cual para que la URL se lea igual que la de Movimientos.
 */
export function sufijoVariantes(ids: readonly string[]): string {
  return ids.length === 0 ? "" : `?variantes=${ids.join(",")}`;
}

// ---------------------------------------------------------------------------------------------------------------
// El conteo de ARRANQUE (ADR-0328, actividad 15)
// ---------------------------------------------------------------------------------------------------------------

/** Una fila de `fn_conteo_arranque`: si el próximo conteo de TODO ese lugar sería el de arranque (`sububicacion_id` NULL = toda la ubicación). */
export type FilaArranque = { sububicacion_id: string | null; arranque_pendiente: boolean };

/** Por lugar (id de sububicación o `TODA_LA_UBICACION`): `true` = el lugar nunca tuvo un conteo completo cerrado. */
export type ArranqueConteo = Record<string, boolean>;

/**
 * La respuesta de `fn_conteo_arranque` ya leída, o `null` y el porqué si la base no pudo darla. Es un dato de apoyo como las cifras:
 * sin él (la web salió antes que el SQL, o falló) la tarjeta no dice nada del arranque y abrir un conteo sigue igual. Lo que decide
 * si un cierre es de arranque es `cerrar_conteo`, no esta lectura.
 */
export function arranqueDeRespuesta(respuesta: { data: readonly FilaArranque[] | null; error: { message: string } | null }): {
  arranque: ArranqueConteo | null;
  fallo: string | null;
} {
  const { datos, fallo } = tolerar(respuesta, "qué lugares no tuvieron su conteo de arranque");
  if (!datos) return { arranque: null, fallo };
  const arranque: ArranqueConteo = {};
  for (const f of datos) arranque[f.sububicacion_id ?? TODA_LA_UBICACION] = f.arranque_pendiente === true;
  return { arranque, fallo };
}

/**
 * Lo que «Abrir un conteo» dice del arranque, solo cuando el lugar elegido nunca tuvo un conteo completo cerrado (Felipe: el primer
 * conteo completo es de arranque, «corrige el stock sin contar como merma ni entrar en la exactitud»):
 *   · contando TODO → que este será el de arranque, qué significa y cuándo vale (contado a mano y cerrado sin pendientes: lo aplicado
 *     sin contar no vale, `fn_conteo_vale_como_arranque`);
 *   · contando una categoría o unas prendas → que así NO es el de arranque y sus diferencias sí cuentan como pérdida (para que nadie
 *     pierda el arranque sin saberlo).
 * `null` si el lugar ya tuvo su arranque, si falta elegir el lugar o si no se pudo leer.
 */
export function avisoDeArranque(e: {
  arranque: ArranqueConteo | null;
  /** La clave del lugar elegido (id o `TODA_LA_UBICACION`); `null` si falta elegirlo. */
  lugarClave: string | null;
  queCuento: "todo" | "categoria" | "prendas";
  /** «el piso de venta», «el almacén de tienda», «esta ubicación». */
  lugarConArticulo: string;
}): { tipo: "arranque" | "no_es_arranque"; titulo: string; texto: string } | null {
  if (!e.arranque || e.lugarClave === null || e.arranque[e.lugarClave] !== true) return null;
  if (e.queCuento === "todo") {
    // «de» + «el piso de venta» → «del piso de venta»; «de esta ubicación» queda igual.
    const deLugar = e.lugarConArticulo.startsWith("el ") ? `del ${e.lugarConArticulo.slice(3)}` : `de ${e.lugarConArticulo}`;
    return {
      tipo: "arranque",
      titulo: "Conteo de arranque",
      texto: `Es el primer conteo completo ${deLugar}. Lo que encuentres corrige el stock, pero las diferencias no cuentan como pérdida ni bajan la exactitud: son de cuando se cargó el inventario. Vale si cuentas todo a mano, sin «Aplicar todos completos», y lo cierras sin pendientes.`,
    };
  }
  const acotado = e.queCuento === "categoria" ? "solo una categoría" : "solo unas prendas";
  const lugar = `${e.lugarConArticulo.charAt(0).toUpperCase()}${e.lugarConArticulo.slice(1)}`;
  return {
    tipo: "no_es_arranque",
    titulo: "Todavía falta el conteo de arranque",
    texto: `${lugar} nunca se contó completo. Contando ${acotado}, las diferencias sí cuentan como pérdida; si eliges «Todo», será el conteo de arranque.`,
  };
}
