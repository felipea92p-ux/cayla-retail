// Existencias por prenda (ADR-0237, spike docs/maquetas/existencias-conectada-2026-09/): la tabla de Existencias
// agrupa sus filas (una por talla) en PRENDAS — un modelo en un color, la misma «percha» de «Por colgar»
// (`clavePercha`) — y cada prenda muestra su curva de tallas en una línea. Lógica pura: la usan la lista, el detalle de
// la prenda y la barra de «varias a la vez»; nada aquí decide qué hay que reponer (eso es `calcularAccionHoy`, ADR-0231).

import { clavePercha, porColgar } from "./inventario-reglas";
import { compararTallas } from "./tallas";
import type { FilaExistencias } from "./inventario-v2";
import { guionDeLaPistola } from "./escaner-guion";
import { hoyDeTalla, type TipoHoy } from "./existencias-hoy";
import { RUTA_NUEVO_TRASLADO } from "./traslados-reglas";

/** Lo mínimo de una fila de Existencias que usa esta regla (las pruebas no arman una fila entera). */
export type FilaPrenda = Pick<
  FilaExistencias,
  | "varianteId"
  | "productoId"
  | "referencia"
  | "sku"
  | "talla"
  | "color"
  | "colorHex"
  | "fotoUrl"
  | "categoriaPrefijo"
  | "categoriaFamilia"
  | "codigosBarras"
  | "pisoDisponible"
  | "almacenDisponible"
  | "disponible"
  | "apartado"
  | "danado"
  | "enTransito"
  | "accionHoy"
  | "marca"
> &
  // La categoría es opcional aquí (`FilaStock.categoria` es obligatoria, pero las pruebas arman filas mínimas): la miniatura dibuja la percha sin ella.
  Partial<Pick<FilaExistencias, "categoria">>;

/** Cómo se pinta una talla en la curva. Desde el 2026-10-04 sale de `hoyDeTalla` y de nada más: antes decidía con sus propias
 *  preguntas y una talla con 2 en el piso y 0 atrás era «reponer» en la celda y «sin stock atrás» en la pastilla de la misma
 *  tarjeta. Lo único que agrega es «sin_stock»: no hay nada libre en la sede (ni colgado ni guardado). */
export type EstadoTalla = "por_colgar" | "reponer" | "sin_stock" | "normal";

export function estadoTalla(f: FilaPrenda): EstadoTalla {
  if (f.disponible <= 0) return "sin_stock";
  const hoy = hoyDeTalla(f);
  if (hoy === "por_colgar") return "por_colgar";
  if (hoy === "por_reponer" || hoy === "sin_stock_atras") return "reponer";
  return "normal";
}

/** ¿Esta talla se puede bajar al piso hoy? Pide reponer (la regla única) y hay algo libre atrás: lo apartado no se mueve. */
export function sePuedeBajar(f: FilaPrenda): boolean {
  return f.accionHoy?.tipo === "reponer_a_piso" && (f.almacenDisponible ?? 0) > 0;
}

export type PrendaAgrupada<F extends FilaPrenda = FilaPrenda> = {
  clave: string;
  productoId: string;
  referencia: string;
  marca: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  /** La categoría de la prenda, para dibujarla cuando no hay foto (`SinFoto`): nombre visible, prefijo (el ícono) y familia (el tono). */
  categoria?: string | null;
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  /** Sus tallas en curva (XS, S, M… y luego la numeración), no en el orden en que llegaron. */
  tallas: F[];
  /** Sumas de lo LIBRE (neto de apartados), las mismas cifras que la tabla por talla. `null` donde no se separa piso y almacén. */
  piso: number | null;
  almacen: number | null;
  disponible: number;
  apartado: number;
  danado: number;
  enTransito: number;
  /** Cuántas tallas se pueden bajar al piso hoy (`sePuedeBajar`). */
  tallasParaBajar: number;
  /** Cuántas tallas no tienen ni una para vender en el piso y sí atrás (`porColgar`). */
  tallasPorColgar: number;
};

function sumarONull(filas: FilaPrenda[], campo: "pisoDisponible" | "almacenDisponible"): number | null {
  if (filas.some((f) => f[campo] === null)) return null;
  return filas.reduce((acc, f) => acc + (f[campo] ?? 0), 0);
}

/** Agrupa filas por prenda (modelo + color) respetando el orden en que llegan: la primera talla que aparece (por
 *  relevancia de la búsqueda, o por percha en «Por colgar») decide dónde va su prenda. */
export function agruparPorPrenda<F extends FilaPrenda>(filas: readonly F[]): PrendaAgrupada<F>[] {
  const grupos = new Map<string, F[]>();
  for (const f of filas) {
    const clave = clavePercha(f);
    const g = grupos.get(clave);
    if (g) g.push(f);
    else grupos.set(clave, [f]);
  }
  return [...grupos.entries()].map(([clave, grupo]) => {
    const tallas = [...grupo].sort((a, b) => compararTallas(a.talla ?? "", b.talla ?? ""));
    const primera = tallas[0];
    return {
      clave,
      productoId: primera.productoId,
      referencia: primera.referencia,
      marca: primera.marca ?? null,
      color: primera.color,
      colorHex: primera.colorHex,
      fotoUrl: primera.fotoUrl,
      categoria: primera.categoria ?? null,
      categoriaPrefijo: primera.categoriaPrefijo ?? null,
      categoriaFamilia: primera.categoriaFamilia ?? null,
      tallas,
      piso: sumarONull(tallas, "pisoDisponible"),
      almacen: sumarONull(tallas, "almacenDisponible"),
      disponible: tallas.reduce((acc, f) => acc + f.disponible, 0),
      apartado: tallas.reduce((acc, f) => acc + f.apartado, 0),
      danado: tallas.reduce((acc, f) => acc + (f.danado ?? 0), 0),
      enTransito: tallas.reduce((acc, f) => acc + f.enTransito, 0),
      tallasParaBajar: tallas.filter(sePuedeBajar).length,
      tallasPorColgar: tallas.filter((f) => porColgar(f)).length,
    };
  });
}

/** Todos los colores de un MODELO (las prendas del mismo producto), en el orden en que las agrupa la lista. «Reponer prenda» y «Subir
 *  prenda» (ADR-0317) abren esta lista entera: un Polo en azul, blanco y negro se mueve en UNA ventana, no en tres. */
export function coloresDelModelo<F extends FilaPrenda>(filas: readonly F[], productoId: string): PrendaAgrupada<F>[] {
  return agruparPorPrenda(filas.filter((f) => f.productoId === productoId));
}

/** `id:cantidad,id:cantidad`: el formato que ya leen «Mover mercadería» (`parsearLineasPrellenadas`) y ahora «Bajar al piso». */
export function lineasEnUrl(lineas: readonly { varianteId: string; cantidad: number }[]): string {
  return lineas
    .filter((l) => Number.isInteger(l.cantidad) && l.cantidad > 0)
    .map((l) => `${l.varianteId}:${l.cantidad}`)
    .join(",");
}

/** Lo que va a «Bajar al piso» desde lo marcado: solo las tallas que se pueden bajar. El 1 es solo la forma del enlace
 *  (`lineasEnUrl` no lleva ceros): «Bajar al piso» las recibe todas «por escanear», en 0, y cada lectura suma una
 *  (`lineasIniciales`, ADR-0237 act. 2026-09-26). CAYLA no sugiere cuánto reponer (ADR-0231): lo que se baja es lo que
 *  la vendedora escanea al colgar. */
export function lineasParaBajar(filas: readonly FilaPrenda[]): { varianteId: string; cantidad: number }[] {
  return filas.filter(sePuedeBajar).map((f) => ({ varianteId: f.varianteId, cantidad: 1 }));
}

/** Lo que va a «Mover mercadería»: las tallas con algo libre para mandar (el traslado sale del almacén; donde no se separa,
 *  de lo disponible), una unidad cada una — la pantalla de traslado topa y deja cambiar la cantidad. */
export function lineasParaTrasladar(filas: readonly FilaPrenda[]): { varianteId: string; cantidad: number }[] {
  return filas.filter((f) => (f.almacenDisponible ?? f.disponible) > 0).map((f) => ({ varianteId: f.varianteId, cantidad: 1 }));
}

/** Tope de variantes que viajan por URL: con más, el enlace se vuelve frágil (límites de largo de URL de ~8 KB, y cada
 *  uuid pesa 36 caracteres). 100 × 40 ≈ 4 KB. La barra avisa en vez de mandar un enlace cortado. */
export const MAX_VARIANTES_EN_URL = 100;

export function urlBajarAlPiso(filas: readonly FilaPrenda[]): string | null {
  const lineas = lineasParaBajar(filas);
  if (lineas.length === 0 || lineas.length > MAX_VARIANTES_EN_URL) return null;
  return `/inventario/bajar?lineas=${lineasEnUrl(lineas)}`;
}

export function urlTrasladar(filas: readonly FilaPrenda[]): string | null {
  const lineas = lineasParaTrasladar(filas);
  if (lineas.length === 0 || lineas.length > MAX_VARIANTES_EN_URL) return null;
  return `${RUTA_NUEVO_TRASLADO}?lineas=${lineasEnUrl(lineas)}&desde=existencias`;
}

/** Etiquetas de precio de EXACTAMENTE esas tallas, siempre por `?variantes=` (tarea #7 del análisis). Antes, con un solo
 *  producto iba por `?producto=`, que imprime TODOS sus colores: desde la Casaca Ximena azul salían también las negras,
 *  aunque el detalle prometía «todas sus tallas». */
export function urlEtiquetas(filas: readonly FilaPrenda[]): string | null {
  if (filas.length === 0 || filas.length > MAX_VARIANTES_EN_URL) return null;
  return `/etiquetas-de-precio?variantes=${filas.map((f) => f.varianteId).join(",")}`;
}

/** Con qué talla se abre el detalle desde «Reponer N tallas» (tarea #7): una que SE PUEDA bajar —primero una por colgar—,
 *  para que el detalle muestre «Reponer al piso». Antes podía abrir una talla que pedía reponer sin nada en el almacén, y
 *  el botón que llevó hasta ahí no llevaba a la acción. */
export function tallaParaReponer<F extends FilaPrenda>(tallas: readonly F[]): F | null {
  return tallas.find((f) => estadoTalla(f) === "por_colgar" && sePuedeBajar(f)) ?? tallas.find(sePuedeBajar) ?? null;
}

/** Normaliza un código leído (pistola, cámara o tipeo) para compararlo: sin espacios, sin mayúsculas y con el guion que la
 *  pistola escribe como apóstrofo en un teclado en español (`guionDeLaPistola`). */
function normalizarCodigo(c: string): string {
  return guionDeLaPistola(c).trim().toLowerCase();
}

/** ¿Qué talla es este código? Busca el código EXACTO (el de la etiqueta o un código de barras), nunca un pedazo: con la
 *  pistola, «POL-0004-NEG-M» no puede abrir la L por parecerse. null = no es de ninguna prenda de esta sede. */
export function tallaPorCodigo<F extends FilaPrenda>(filas: readonly F[], codigo: string): F | null {
  const buscado = normalizarCodigo(codigo);
  if (!buscado) return null;
  const coinciden = filas.filter((f) => normalizarCodigo(f.sku) === buscado || f.codigosBarras.some((c) => normalizarCodigo(c) === buscado));
  // Un código repetido en dos tallas (un código de barras mal cargado) no abre NINGUNA (tarea #11): abrir la primera que
  // aparece mostraba una prenda que quizá no es la de la etiqueta. Queda escrito en el buscador y la lista muestra las dos.
  const distintas = new Set(coinciden.map((f) => f.varianteId));
  return distintas.size === 1 ? coinciden[0] : null;
}

/** «Qué hacer» de una prenda (un color de un modelo): SOLO el diagnóstico, nunca un botón —la acción se hace en el cajón—. Es el
 *  caso de «Hoy» (`lib/existencias-hoy.ts`) más urgente entre sus tallas y cuántas tallas están en él, con las MISMAS palabras
 *  del filtro «Hoy» (Felipe, 2026-10-03): «Por colgar» primero (la clienta no la ve y se arregla hoy), luego «Por reponer» y
 *  «Sin stock atrás» (no se arregla en la tienda); si ninguna pide nada, «Mantener». Lo usan la tarjeta, la lista «Por prenda»
 *  y el cajón: antes decían «sin stock en piso», «Faltan tallas en piso» y «Piso al día» para lo mismo. */
export type QueHacerPrenda = { tipo: TipoHoy; n: number };

export function queHacerPrenda(tallas: readonly FilaPrenda[]): QueHacerPrenda {
  for (const tipo of ["por_colgar", "por_reponer", "sin_stock_atras"] as const) {
    const n = tallas.filter((f) => hoyDeTalla(f) === tipo).length;
    if (n > 0) return { tipo, n };
  }
  return { tipo: "mantener", n: 0 };
}

/** Cuán urgente es una prenda para el piso: 0 = tiene tallas por colgar (la clienta no las ve: piso libre en 0 y algo
 *  atrás), 1 = pide reponer y se puede bajar, 2 = nada que hacer hoy. */
export function urgenciaDePrenda(p: Pick<PrendaAgrupada<FilaPrenda>, "tallasPorColgar" | "tallasParaBajar">): 0 | 1 | 2 {
  if (p.tallasPorColgar > 0) return 0;
  if (p.tallasParaBajar > 0) return 1;
  return 2;
}

/** La lista SIN búsqueda escrita, por urgencia (análisis de Existencias, tarea #5): primero lo que falta en el piso, y
 *  dentro de cada grupo, la que más tallas tiene por colgar. Es estable: a igual urgencia, se respeta el orden de
 *  llegada (modelo y color). Con texto escrito NO se usa: manda la relevancia de la búsqueda. */
export function ordenarPorUrgencia<F extends FilaPrenda>(prendas: readonly PrendaAgrupada<F>[]): PrendaAgrupada<F>[] {
  return prendas
    .map((p, i) => ({ p, i }))
    .sort((a, b) => urgenciaDePrenda(a.p) - urgenciaDePrenda(b.p) || b.p.tallasPorColgar - a.p.tallasPorColgar || a.i - b.i)
    .map(({ p }) => p);
}

/** «Solo M · L (de 4 tallas)»: lo que dice una tarjeta cuando un filtro (Talla, Hoy, Condición o una talla escrita) dejó solo
 *  algunas de sus tallas. Sus cifras grandes (Piso, Almacén) suman solo esas, y sin esta línea «Piso 0» parecía el total del
 *  modelo en ese color. `null` cuando se ven todas: no hay nada que aclarar. */
export function textoTallasRecortadas(tallasVistas: readonly (string | null)[], totalTallas: number): string | null {
  if (tallasVistas.length === 0 || tallasVistas.length >= totalTallas) return null;
  return `Solo ${tallasVistas.map((t) => t ?? "Única").join(" · ")} (de ${totalTallas} ${totalTallas === 1 ? "talla" : "tallas"})`;
}

/** Cuántas tallas tiene cada prenda (modelo + color) en la sede, sin filtros: contra esto se mide si una tarjeta está recortada. */
export function tallasPorPrenda(filas: readonly Pick<FilaPrenda, "productoId" | "color">[]): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const k = clavePercha(f);
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return cuenta;
}
