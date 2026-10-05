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

/**
 * Una fila de `fn_conteo_arranque` (`sububicacion_id` NULL = toda la ubicación). Con `categoria_id` NULL: si un conteo de TODO ese lugar
 * sería de arranque (en el piso, para alguna de sus categorías). Con categoría (solo en el piso): si el próximo conteo de esa categoría
 * sería el de arranque. Una base con la primera versión del SQL no trae `categoria_id`: todas sus filas son de «todo».
 */
export type FilaArranque = { sububicacion_id: string | null; categoria_id?: string | null; arranque_pendiente: boolean };

/**
 * Por lugar (id de sububicación o `TODA_LA_UBICACION`): `todo` = un conteo de todo el lugar sería de arranque; `porCategoria` = en ese
 * lugar el arranque es por categoría (el piso: la base manda una fila por categoría) y si cada una lo tiene pendiente; `null` = el
 * arranque es del lugar entero (el almacén, o una ubicación sin piso ni almacén aparte).
 */
export type ArranqueLugar = { todo: boolean; porCategoria: Record<string, boolean> | null };
export type ArranqueConteo = Record<string, ArranqueLugar>;

/**
 * La respuesta de `fn_conteo_arranque` ya leída, o `null` y el porqué si la base no pudo darla. Es un dato de apoyo como las cifras:
 * sin él (la web salió antes que el SQL, o falló) la tarjeta no dice nada del arranque y abrir un conteo sigue igual. Lo que decide
 * si un cierre es de arranque es `cerrar_conteo`, no esta lectura. Qué lugar es «por categoría» tampoco lo decide la web: lo dice la
 * base mandando filas por categoría (`fn_arranque_por_categoria`).
 */
export function arranqueDeRespuesta(respuesta: { data: readonly FilaArranque[] | null; error: { message: string } | null }): {
  arranque: ArranqueConteo | null;
  fallo: string | null;
} {
  const { datos, fallo } = tolerar(respuesta, "qué lugares no tuvieron su conteo de arranque");
  if (!datos) return { arranque: null, fallo };
  const arranque: ArranqueConteo = {};
  for (const f of datos) {
    const lugar = (arranque[f.sububicacion_id ?? TODA_LA_UBICACION] ??= { todo: false, porCategoria: null });
    if (f.categoria_id) (lugar.porCategoria ??= {})[f.categoria_id] = f.arranque_pendiente === true;
    else lugar.todo = f.arranque_pendiente === true;
  }
  return { arranque, fallo };
}

/**
 * Lo que «Abrir un conteo» dice del arranque (ADR-0328; Felipe: el primer conteo de cada tramo «corrige el stock sin contar como merma
 * ni entrar en la exactitud»). El tramo lo pone la base: en el ALMACÉN (o en toda la ubicación) es el lugar entero; en el PISO, cada
 * categoría, porque el piso se cuenta por categorías a lo largo de la semana. Y un cuadre del piso los reinicia todos.
 *   · Almacén, si todavía no tuvo su arranque: contando TODO, que este lo será, qué significa y cuándo vale (contado a mano y cerrado
 *     sin pendientes: lo aplicado sin contar no vale, `fn_conteo_vale_como_arranque`); contando una categoría o unas prendas, que así
 *     NO lo es y sus diferencias sí cuentan como pérdida (para que nadie lo pierda sin saberlo).
 *   · Piso: contando una categoría que todavía no tuvo el suyo, que este lo será; contando TODO, que lo será de cada categoría que
 *     todavía no lo tuvo; contando unas prendas, que así ninguna arranca. Una categoría que ya lo tuvo no dice nada.
 * `null` si no hay nada que decir, si falta elegir el lugar (o la categoría) o si no se pudo leer.
 */
export function avisoDeArranque(e: {
  arranque: ArranqueConteo | null;
  /** La clave del lugar elegido (id o `TODA_LA_UBICACION`); `null` si falta elegirlo. */
  lugarClave: string | null;
  queCuento: "todo" | "categoria" | "prendas";
  /** «el piso de venta», «el almacén de tienda», «esta ubicación». */
  lugarConArticulo: string;
  /** La categoría elegida, si `queCuento` es «categoria» y ya se eligió. */
  categoria?: { id: string; nombre: string } | null;
}): { tipo: "arranque" | "no_es_arranque"; titulo: string; texto: string } | null {
  const l = e.arranque && e.lugarClave !== null ? e.arranque[e.lugarClave] : undefined;
  if (!l) return null;
  // «de» + «el piso de venta» → «del piso de venta»; «de esta ubicación» queda igual. «en» + «el piso de venta» queda igual.
  const deLugar = e.lugarConArticulo.startsWith("el ") ? `del ${e.lugarConArticulo.slice(3)}` : `de ${e.lugarConArticulo}`;
  const lugar = `${e.lugarConArticulo.charAt(0).toUpperCase()}${e.lugarConArticulo.slice(1)}`;
  const comoVale = "Vale si cuentas todo a mano, sin «Aplicar todos completos», y lo cierras sin pendientes.";

  // El piso: el arranque es por categoría.
  if (l.porCategoria) {
    if (e.queCuento === "categoria") {
      if (!e.categoria || l.porCategoria[e.categoria.id] !== true) return null;
      return {
        tipo: "arranque",
        titulo: "Conteo de arranque",
        texto: `Es el primer conteo de ${e.categoria.nombre} en ${e.lugarConArticulo}. Lo que encuentres corrige el stock, pero las diferencias no cuentan como pérdida ni bajan la exactitud: son errores de registro de antes, no prendas perdidas. Vale si cuentas toda la categoría a mano, sin «Aplicar todos completos», y lo cierras sin pendientes.`,
      };
    }
    if (!l.todo) return null;
    if (e.queCuento === "todo") {
      return {
        tipo: "arranque",
        titulo: "Conteo de arranque",
        texto: `En ${e.lugarConArticulo} el arranque es por categoría: este conteo será el de cada categoría que todavía no tuvo el suyo. En ellas, lo que encuentres corrige el stock, pero las diferencias no cuentan como pérdida ni bajan la exactitud. ${comoVale}`,
      };
    }
    return {
      tipo: "no_es_arranque",
      titulo: "Todavía falta el conteo de arranque",
      texto: `Hay categorías ${deLugar} que todavía no tuvieron su conteo de arranque. Contando solo unas prendas, las diferencias sí cuentan como pérdida; si cuentas una categoría entera o «Todo», será el de arranque.`,
    };
  }

  // El almacén (o toda la ubicación): el arranque es del lugar entero.
  if (!l.todo) return null;
  if (e.queCuento === "todo") {
    return {
      tipo: "arranque",
      titulo: "Conteo de arranque",
      texto: `Será el conteo de arranque ${deLugar}. Lo que encuentres corrige el stock, pero las diferencias no cuentan como pérdida ni bajan la exactitud: son errores de registro de antes, no prendas perdidas. ${comoVale}`,
    };
  }
  const acotado = e.queCuento === "categoria" ? "solo una categoría" : "solo unas prendas";
  return {
    tipo: "no_es_arranque",
    titulo: "Todavía falta el conteo de arranque",
    texto: `${lugar} todavía no tuvo su conteo de arranque. Contando ${acotado}, las diferencias sí cuentan como pérdida; si eliges «Todo», será el conteo de arranque.`,
  };
}
