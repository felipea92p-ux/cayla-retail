import { FAMILIAS_FUERA_DEL_RIEL } from "./capacidad-piso";

/**
 * Los grupos del mix del piso y a cuál pertenece cada categoría (ADR-0329; migración `20261006100000_plan_del_piso_grupos_del_mix.sql`).
 *
 * El mix no se reparte entre las 42 categorías sueltas sino entre 8 grupos con un rol (destino, rutina, ocasional, de temporada,
 * conveniencia): con 600 ganchos y pocos días de venta, una categoría con 2 prendas no dice nada. Esta pantalla es la primera
 * mitad del Plan del piso: el líder revisa la propuesta de grupos y la confirma, o cambia lo que no calza.
 *
 * PROMETE: leer las dos lecturas de la base sin confiar en su forma (lo que no tiene la forma esperada es «no se pudo leer», nunca
 * una lista inventada); decir el estado de cada categoría (confirmada, por revisar, sin grupo); decir a qué grupos puede ir cada
 * una (nunca uno del otro lado del riel, que la base rechazaría); y armar el lote que `fijar_grupos_de_categorias` recibe.
 * ASUME: lógica pura, se importa desde el servidor y desde el cliente. No guarda nada ni habla con la base.
 */

export const ROLES_MIX = ["destino", "rutina", "ocasional", "estacional", "conveniencia"] as const;
export type RolMix = (typeof ROLES_MIX)[number];

/** Cómo se llama cada rol en pantalla, en palabras del negocio. */
export const ROL_ETIQUETA: Record<RolMix, string> = {
  destino: "Destino",
  rutina: "Rutina",
  ocasional: "Ocasional",
  estacional: "De temporada",
  conveniencia: "Conveniencia",
};

/** Qué quiere decir cada rol (ADR-0329, decisión 4): una hipótesis del dueño que se valida con datos propios, no un hecho. */
export const ROL_AYUDA: Record<RolMix, string> = {
  destino: "Lo que el cliente viene a buscar: trae gente a la tienda y la hace volver.",
  rutina: "Lo que se compra seguido y completa el look de lo que trae gente.",
  ocasional: "Un look completo en una sola compra, o un complemento de compra más alta.",
  estacional: "Depende del clima y de la época del año.",
  conveniencia: "Se suma al paso, junto a la caja.",
};

export type GrupoMix = { clave: string; nombre: string; rol: RolMix; enRiel: boolean; orden: number };

export type CategoriaMix = {
  categoriaId: string;
  categoria: string;
  prefijo: string | null;
  familia: string | null;
  /** Nulo = «Sin grupo»: la base no inventa un grupo. */
  grupoClave: string | null;
  /** El líder ya la revisó. Falso mientras sea solo la propuesta sembrada. */
  confirmada: boolean;
  confirmadaEn: string | null;
  /** La que `fijar_grupos_de_categorias` pide (0 si todavía no tenía grupo). */
  version: number;
};

const esTexto = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const esEntero = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

function filas(datos: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(datos)) return null;
  const fs: Record<string, unknown>[] = [];
  for (const f of datos) {
    if (f === null || typeof f !== "object") return null;
    fs.push(f as Record<string, unknown>);
  }
  return fs;
}

/** `fn_grupos_mix`. Null si algo no tiene la forma esperada (se dice «no se pudo leer», no se muestra a medias). */
export function leerGrupos(datos: unknown): GrupoMix[] | null {
  const fs = filas(datos);
  if (!fs) return null;
  const grupos: GrupoMix[] = [];
  for (const f of fs) {
    const { clave, nombre, rol, en_riel: enRiel, orden } = f;
    if (!esTexto(clave) || !esTexto(nombre) || typeof enRiel !== "boolean" || !esEntero(orden)) return null;
    if (!(ROLES_MIX as readonly unknown[]).includes(rol)) return null;
    grupos.push({ clave, nombre, rol: rol as RolMix, enRiel, orden });
  }
  return grupos.sort((a, b) => a.orden - b.orden);
}

/** `fn_categorias_grupo_mix`. Null si algo no tiene la forma esperada. */
export function leerCategorias(datos: unknown): CategoriaMix[] | null {
  const fs = filas(datos);
  if (!fs) return null;
  const categorias: CategoriaMix[] = [];
  for (const f of fs) {
    const { categoria_id: categoriaId, categoria, prefijo, familia, grupo_clave: grupoClave, confirmada, confirmada_en: confirmadaEn, version } = f;
    if (!esTexto(categoriaId) || !esTexto(categoria) || typeof confirmada !== "boolean" || !esEntero(version) || version < 0) return null;
    categorias.push({
      categoriaId,
      categoria,
      prefijo: esTexto(prefijo) ? prefijo : null,
      familia: esTexto(familia) ? familia : null,
      grupoClave: esTexto(grupoClave) ? grupoClave : null,
      confirmada,
      confirmadaEn: esTexto(confirmadaEn) ? confirmadaEn : null,
      version,
    });
  }
  return categorias;
}

export type EstadoCategoria = "confirmada" | "por_revisar" | "sin_grupo";

/** Sin grupo manda sobre todo; con grupo, «confirmada» es lo que el líder ya revisó y lo demás es la propuesta por revisar. */
export function estadoDe(c: CategoriaMix): EstadoCategoria {
  if (c.grupoClave === null) return "sin_grupo";
  return c.confirmada ? "confirmada" : "por_revisar";
}

export type ResumenGrupos = { total: number; confirmadas: number; porRevisar: number; sinGrupo: number };

export function resumir(categorias: readonly CategoriaMix[]): ResumenGrupos {
  let confirmadas = 0;
  let porRevisar = 0;
  let sinGrupo = 0;
  for (const c of categorias) {
    const e = estadoDe(c);
    if (e === "confirmada") confirmadas++;
    else if (e === "por_revisar") porRevisar++;
    else sinGrupo++;
  }
  return { total: categorias.length, confirmadas, porRevisar, sinGrupo };
}

/** Lo que dice la Propuesta cuando quedan categorías cuyo grupo nadie ha confirmado, y a dónde lleva (la pestaña Grupos). */
export type AvisoDeGruposPorRevisar = { titulo: string; detalle: string; accion: string };

/**
 * El aviso de la Propuesta sobre las categorías que esperan al líder, que son DOS cosas distintas y la propuesta las trata distinto:
 *  · «por revisar»: el sistema les puso un grupo, que la propuesta SÍ usa mientras nadie lo confirme;
 *  · «sin grupo»: son nuevas y no tienen ninguno, así que NO entran al reparto (`armarPropuesta` las cuenta aparte).
 * Dice cuántas son de cada una, qué pasa mientras tanto y a dónde ir. Quien es líder las confirma; quien no, solo las ve. Sin ninguna, no hay aviso.
 */
export function avisoDeGruposPorRevisar(porRevisar: number, sinGrupo: number, esLider: boolean): AvisoDeGruposPorRevisar | null {
  const rev = Number.isFinite(porRevisar) && porRevisar > 0 ? Math.floor(porRevisar) : 0;
  const sin = Number.isFinite(sinGrupo) && sinGrupo > 0 ? Math.floor(sinGrupo) : 0;
  const total = rev + sin;
  if (total === 0) return null;
  const cuantas = total.toLocaleString("es-PE");
  const accion = esLider ? (total === 1 ? "Revisar la categoría" : `Revisar las ${cuantas} categorías`) : total === 1 ? "Ver la categoría" : `Ver las ${cuantas} categorías`;
  const quien = esLider ? "no" : "el líder no";
  const nRev = rev.toLocaleString("es-PE");
  const nSin = sin.toLocaleString("es-PE");

  if (sin === 0) {
    const una = rev === 1;
    return {
      titulo: una ? "1 categoría sigue por revisar" : `${nRev} categorías siguen por revisar`,
      detalle: `Mientras ${quien} ${una ? "la" : "las"} ${esLider ? "confirmes" : "confirme"}, la propuesta usa el grupo que el sistema ${una ? "le" : "les"} puso.`,
      accion,
    };
  }
  if (rev === 0) {
    const una = sin === 1;
    return {
      titulo: una ? "1 categoría no tiene grupo" : `${nSin} categorías no tienen grupo`,
      detalle: `Mientras ${quien} ${una ? "le" : "les"} ${esLider ? "elijas" : "elija"} uno, ${una ? "no entra" : "no entran"} al reparto de la propuesta.`,
      accion,
    };
  }
  return {
    titulo: `${cuantas} categorías esperan revisión`,
    detalle: `${rev === 1 ? "1 sigue con el grupo que le puso el sistema" : `${nRev} siguen con el grupo que les puso el sistema`}; ${sin === 1 ? "1 no tiene grupo y no entra" : `${nSin} no tienen grupo y no entran`} al reparto de la propuesta.`,
    accion,
  };
}

/**
 * ¿La ropa o lo que va fuera del riel? La misma regla que la base (`fn_categoria_grupo_mix_coherente`): una familia de
 * `FAMILIAS_FUERA_DEL_RIEL` va a un grupo de fuera del riel; todo lo demás —y una categoría sin familia— cuelga en el riel.
 */
export function cuelgaEnElRiel(familia: string | null): boolean {
  return familia === null || !FAMILIAS_FUERA_DEL_RIEL.has(familia);
}

/** Los grupos a los que esta categoría puede ir. Un vestido no se ofrece entre los accesorios de la caja: el error es del diseño,
 *  no de quien elige (Norman), y la base lo rechazaría de todos modos. */
export function gruposPermitidos(c: Pick<CategoriaMix, "familia">, grupos: readonly GrupoMix[]): GrupoMix[] {
  const enRiel = cuelgaEnElRiel(c.familia);
  return grupos.filter((g) => g.enRiel === enRiel);
}

export type Seccion = { grupo: GrupoMix; categorias: CategoriaMix[]; porRevisar: number };
export type Vista = { secciones: Seccion[]; sinGrupo: CategoriaMix[] };

/**
 * Las categorías repartidas por su grupo, en el orden de los grupos; las que no tienen, aparte y primero (son lo que falta). Una
 * categoría cuyo grupo ya no existe en la lista cuenta como «sin grupo»: se ve, no se esconde.
 */
export function armarVista(grupos: readonly GrupoMix[], categorias: readonly CategoriaMix[]): Vista {
  const porClave = new Map(grupos.map((g) => [g.clave, [] as CategoriaMix[]]));
  const sinGrupo: CategoriaMix[] = [];
  for (const c of categorias) {
    const lista = c.grupoClave === null ? undefined : porClave.get(c.grupoClave);
    if (lista) lista.push(c);
    else sinGrupo.push(c);
  }
  const porNombre = (a: CategoriaMix, b: CategoriaMix) => a.categoria.localeCompare(b.categoria, "es");
  return {
    sinGrupo: sinGrupo.sort(porNombre),
    secciones: grupos.map((grupo) => {
      const lista = (porClave.get(grupo.clave) ?? []).sort(porNombre);
      return { grupo, categorias: lista, porRevisar: lista.filter((c) => !c.confirmada).length };
    }),
  };
}

/**
 * Lo que el líder dejó preparado sin guardar: categoría → el grupo en que quedará (el mismo que tiene si solo la confirma) y la
 * VERSIÓN de la categoría que vio al prepararlo. Si otra persona la cambia después, esa versión ya no es la vigente y el cambio
 * preparado deja de valer: no se guarda (decidía sobre un estado que ya no existe) y se le dice a quien lo preparó.
 */
export type CambioPreparado = { grupoClave: string; version: number };
export type Pendientes = ReadonlyMap<string, CambioPreparado>;

/** El grupo preparado de una categoría, si lo preparado sigue valiendo contra lo que se leyó (misma versión). */
export function preparadoDe(pendientes: Pendientes, c: Pick<CategoriaMix, "categoriaId" | "version">): string | undefined {
  const p = pendientes.get(c.categoriaId);
  return p !== undefined && p.version === c.version ? p.grupoClave : undefined;
}

/** Pone (o quita) un cambio preparado. Volver a elegir el grupo que ya tenía una categoría YA confirmada es no cambiar nada. */
export function conCambio(pendientes: Pendientes, c: CategoriaMix, grupoClave: string): Pendientes {
  const nuevo = new Map(pendientes);
  if (c.confirmada && c.grupoClave === grupoClave) nuevo.delete(c.categoriaId);
  else nuevo.set(c.categoriaId, { grupoClave, version: c.version });
  return nuevo;
}

/** Prepara, de una vez, la confirmación de TODAS las que siguen por revisar en el grupo que ya tienen. Lo ya preparado se respeta. */
export function confirmarPropuestas(pendientes: Pendientes, categorias: readonly CategoriaMix[]): Pendientes {
  const nuevo = new Map(pendientes);
  for (const c of categorias) {
    if (estadoDe(c) === "por_revisar" && preparadoDe(nuevo, c) === undefined) nuevo.set(c.categoriaId, { grupoClave: c.grupoClave as string, version: c.version });
  }
  return nuevo;
}

/** Las categorías con un cambio preparado que otra persona cambió después: lo preparado ya no vale y se avisa. */
export function obsoletas(categorias: readonly CategoriaMix[], pendientes: Pendientes): CategoriaMix[] {
  return categorias.filter((c) => pendientes.has(c.categoriaId) && preparadoDe(pendientes, c) === undefined);
}

/** Lo preparado sin lo que ya no vale (y sin lo de una categoría que dejó de existir). */
export function sinObsoletas(categorias: readonly CategoriaMix[], pendientes: Pendientes): Pendientes {
  const nuevo = new Map<string, CambioPreparado>();
  for (const c of categorias) {
    const p = pendientes.get(c.categoriaId);
    if (p !== undefined && preparadoDe(pendientes, c) !== undefined) nuevo.set(c.categoriaId, p);
  }
  return nuevo;
}

export type CambioGrupo = { categoriaId: string; categoria: string; antes: string | null; despues: string; version: number };

/** Los cambios preparados que siguen valiendo contra lo que se leyó, en el orden de la lista (lo obsoleto nunca llega al lote). */
export function cambiosPreparados(categorias: readonly CategoriaMix[], pendientes: Pendientes): CambioGrupo[] {
  const cambios: CambioGrupo[] = [];
  for (const c of categorias) {
    const despues = preparadoDe(pendientes, c);
    if (despues === undefined) continue;
    cambios.push({ categoriaId: c.categoriaId, categoria: c.categoria, antes: c.grupoClave, despues, version: c.version });
  }
  return cambios;
}

/** El argumento de `fijar_grupos_de_categorias`: cada categoría con su grupo y la versión que se leyó. */
export function loteParaGuardar(cambios: readonly CambioGrupo[]): { categoria_id: string; grupo_clave: string; version: number }[] {
  return cambios.map((c) => ({ categoria_id: c.categoriaId, grupo_clave: c.despues, version: c.version }));
}

/** Una línea por cambio para la hoja de confirmación: «Poleras: de Abrigo y capas a Polos, tops y blusas» o «Jeans: confirmar en Jeans». */
export function describirCambio(c: CambioGrupo, grupos: readonly GrupoMix[]): string {
  const nombre = (clave: string | null) => (clave === null ? "ningún grupo" : (grupos.find((g) => g.clave === clave)?.nombre ?? clave));
  if (c.antes === c.despues) return `${c.categoria}: confirmar en «${nombre(c.despues)}»`;
  return `${c.categoria}: ${c.antes === null ? "sin grupo" : `de «${nombre(c.antes)}»`} a «${nombre(c.despues)}»`;
}

export type ResultadoGuardado = { cambiadas: number; confirmadas: number; sinCambios: number };

/** La respuesta de `fijar_grupos_de_categorias`; null si no tiene la forma esperada. */
export function leerResultado(datos: unknown): ResultadoGuardado | null {
  if (datos === null || typeof datos !== "object") return null;
  const d = datos as Record<string, unknown>;
  if (!esEntero(d.cambiadas) || !esEntero(d.confirmadas) || !esEntero(d.sin_cambios)) return null;
  return { cambiadas: d.cambiadas, confirmadas: d.confirmadas, sinCambios: d.sin_cambios };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que se le dice a quien guardó: qué quedó cambiado y qué quedó confirmado tal como estaba. */
export function textoGuardado(r: ResultadoGuardado): string {
  const partes: string[] = [];
  if (r.cambiadas > 0) partes.push(`${plural(r.cambiadas, "categoría cambió", "categorías cambiaron")} de grupo`);
  if (r.confirmadas > 0) partes.push(`${plural(r.confirmadas, "quedó confirmada", "quedaron confirmadas")}`);
  if (partes.length === 0) return "Ya estaba todo guardado así.";
  return partes.join(" y ");
}
