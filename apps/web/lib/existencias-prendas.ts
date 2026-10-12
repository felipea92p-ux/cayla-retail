// Existencias por prenda (ADR-0237, spike docs/maquetas/existencias-conectada-2026-09/): la tabla de Existencias
// agrupa sus filas (una por talla) en PRENDAS — un modelo en un color, la misma «percha» de «Por colgar»
// (`clavePercha`) — y cada prenda muestra su curva de tallas en una línea. Lógica pura: la usan la lista, el detalle de
// la prenda y la barra de «varias a la vez»; nada aquí decide qué hay que reponer (eso es el motor del piso, `lib/piso-plan.ts`,
// ADR-0328 act. 7: cada talla trae su decisión en `planPiso`).

import { clavePercha } from "./inventario-reglas";
import { compararTallas } from "./tallas";
import type { FilaExistencias } from "./inventario-v2";
import { guionDeLaPistola } from "./escaner-guion";
import { estadoHoyDeTalla, hoyDeTalla, type EstadoHoy } from "./existencias-hoy";
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
  | "planPiso"
  | "marca"
> &
  // La categoría es opcional aquí (`FilaStock.categoria` es obligatoria, pero las pruebas arman filas mínimas): la miniatura dibuja la percha sin ella.
  Partial<Pick<FilaExistencias, "categoria" | "precio" | "precioDeSede">>;

/** Cómo se pinta una talla en la curva. Desde el 2026-10-04 sale de `hoyDeTalla` y de nada más: antes decidía con sus propias
 *  preguntas y una talla con 2 en el piso y 0 atrás era «reponer» en la celda y «sin stock atrás» en la pastilla de la misma
 *  tarjeta. Lo único que agrega es «sin_stock»: no hay nada libre en la sede (ni colgado ni guardado). «sin_atras» se llamó
 *  «reponer» mientras existió «Por reponer», que se fundió en «Por colgar» (se repone cuando se acaba, basta 1 por color). */
export type EstadoTalla = "por_colgar" | "sin_atras" | "sin_stock" | "normal";

export function estadoTalla(f: FilaPrenda): EstadoTalla {
  if (f.disponible <= 0) return "sin_stock";
  const hoy = hoyDeTalla(f);
  if (hoy === "por_colgar") return "por_colgar";
  if (hoy === "sin_stock_atras") return "sin_atras";
  return "normal";
}

/** ¿Esta talla SE PUEDE bajar al piso? Es un hecho físico, no una recomendación: la sede separa piso y almacén y en el almacén hay
 *  algo libre (lo apartado no se mueve). Qué CONVIENE bajar primero lo dice el motor del piso (`planPiso`), nunca si se puede: con
 *  «Mantener» —lo normal en un piso cuadrado—, con el piso en pausa o con el motor caído, «Reponer prenda» y «Bajar al piso» siguen
 *  abiertos (ADR-0306: bajar es una función de Existencias). Atarlo a la recomendación apagaba los botones diciendo que el almacén
 *  estaba vacío cuando no lo estaba. */
export function sePuedeBajar(f: FilaPrenda): boolean {
  return f.pisoDisponible !== null && f.almacenDisponible !== null && f.almacenDisponible > 0;
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
  /** El precio de catálogo (el de su primera talla: en CAYLA el precio es del producto y color, no de la talla). `null` si no se leyó. */
  precio?: number | null;
  /** Ese precio es el de esta sede (precio propio, Felipe 2026-10-09). */
  precioDeSede?: boolean;
  /** Sus tallas en curva (XS, S, M… y luego la numeración), no en el orden en que llegaron. */
  tallas: F[];
  /** Sumas de lo LIBRE (neto de apartados), las mismas cifras que la tabla por talla. `null` donde no se separa piso y almacén. */
  piso: number | null;
  almacen: number | null;
  disponible: number;
  apartado: number;
  danado: number;
  enTransito: number;
  /** Cuántas tallas se PUEDEN bajar al piso (`sePuedeBajar`: algo libre atrás), lo pida el motor o no. */
  tallasParaBajar: number;
  /** Cuántas tallas están «Por colgar» (`hoyDeTalla`). */
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
      // La foto del color: la de la primera talla que la tenga (una talla sin foto no le quita la foto al color).
      fotoUrl: tallas.find((f) => f.fotoUrl)?.fotoUrl ?? null,
      categoria: primera.categoria ?? null,
      categoriaPrefijo: primera.categoriaPrefijo ?? null,
      categoriaFamilia: primera.categoriaFamilia ?? null,
      ...(primera.precio != null ? { precio: primera.precio } : {}),
      ...(primera.precioDeSede ? { precioDeSede: true } : {}),
      tallas,
      piso: sumarONull(tallas, "pisoDisponible"),
      almacen: sumarONull(tallas, "almacenDisponible"),
      disponible: tallas.reduce((acc, f) => acc + f.disponible, 0),
      apartado: tallas.reduce((acc, f) => acc + f.apartado, 0),
      danado: tallas.reduce((acc, f) => acc + (f.danado ?? 0), 0),
      enTransito: tallas.reduce((acc, f) => acc + f.enTransito, 0),
      tallasParaBajar: tallas.filter(sePuedeBajar).length,
      tallasPorColgar: tallas.filter((f) => hoyDeTalla(f) === "por_colgar").length,
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

/** Lo que va a «Bajar al piso» desde lo marcado: las tallas que se pueden bajar (`sePuedeBajar`), las pida el motor o no —quien
 *  las marcó decide—. El 1 es solo la forma del enlace (`lineasEnUrl` no lleva ceros): «Bajar al piso» las recibe todas «por
 *  escanear», en 0, y cada lectura suma una (`lineasIniciales`, ADR-0237 act. 2026-09-26). CAYLA no sugiere cuánto reponer
 *  (ADR-0231): lo que se baja es lo que la asesora escanea al colgar. */
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

/** Con qué talla se abre «Reponer prenda» (tarea #7): una que SE PUEDA bajar, y entre ellas la que el motor pide —por colgar—.
 *  `null` solo si ninguna tiene algo libre atrás: el botón que dice «No hay nada libre en el almacén» dice la verdad. Antes podía
 *  abrir una talla que pedía reponer sin nada en el almacén, y el botón no llevaba a la acción. */
export function tallaParaReponer<F extends FilaPrenda>(tallas: readonly F[]): F | null {
  const bajables = tallas.filter(sePuedeBajar);
  return bajables.find((f) => hoyDeTalla(f) === "por_colgar") ?? bajables[0] ?? null;
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
 *  del filtro «Hoy» (Felipe, 2026-10-03): «Por colgar» primero (el cliente no la ve y se arregla hoy), luego «Sin stock atrás»
 *  (no se arregla en la tienda), luego «En pausa» (espera el cuadre del piso); si ninguna pide nada,
 *  «Mantener». Lo usan la tarjeta, la lista «Por prenda» y el cajón: antes decían «sin stock en piso», «Faltan tallas en piso» y
 *  «Piso al día» para lo mismo. `null` si de NINGUNA talla se sabe nada (el motor no respondió, o la sede no separa piso y
 *  almacén): un «Mantener» ahí afirmaría que el piso está al día sin saberlo. */
export type QueHacerPrenda = { tipo: EstadoHoy; n: number };

export function queHacerPrenda(tallas: readonly FilaPrenda[]): QueHacerPrenda | null {
  const estados = tallas.map(estadoHoyDeTalla);
  for (const tipo of ["por_colgar", "sin_stock_atras", "en_pausa"] as const) {
    const n = estados.filter((e) => e === tipo).length;
    if (n > 0) return { tipo, n };
  }
  return estados.includes("mantener") ? { tipo: "mantener", n: 0 } : null;
}

/** La posición de cada talla en la lista del día del motor (`PlanDelPiso.listaDelDia`). */
function posiciones(listaDelDia: readonly string[]): Map<string, number> {
  return new Map(listaDelDia.map((id, i) => [id, i]));
}

/** La lista SIN búsqueda escrita (análisis de Existencias, tarea #5): primero las prendas de la lista del día, en su orden —el
 *  mismo del Inicio y de «Para hoy» (`porColgarDeLaSede` ordena con esta misma función): lo vendido ayer primero (ADR-0329
 *  act. 1)—; después el resto, en el orden en que llegaron (modelo y color). Estable. Con texto escrito NO se usa: manda la
 *  relevancia de la búsqueda. */
export function ordenarPorListaDelDia<F extends FilaPrenda>(prendas: readonly PrendaAgrupada<F>[], listaDelDia: readonly string[]): PrendaAgrupada<F>[] {
  const pos = posiciones(listaDelDia);
  const rango = (p: PrendaAgrupada<F>) => p.tallas.reduce((min, f) => Math.min(min, pos.get(f.varianteId) ?? Infinity), Infinity);
  return prendas
    .map((p, i) => ({ p, i, r: rango(p) }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
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

// --- Los cuatro lugares de una prenda (cajón de Existencias, 2026-10-04) ------------------------------------------------
// Antes el cajón decía solo «Piso 8 · Almacén 5»: lo apartado y lo dañado existían en la prenda (`apartado`, `danado`) y
// nadie los mostraba, así que lo que se contaba a mano en la tienda no coincidía con lo que se podía vender. Una prenda
// en una tienda está SIEMPRE en uno de cuatro lugares, y las cuatro cifras no se pisan:
//   · piso       libre: colgada, lo único que cobra la caja (`cantidadCobrable`, lib/vender-stock-local.ts).
//   · almacén    libre: guardada atrás; para venderla se baja al piso primero.
//   · apartada   reservada para un cliente. Sigue físicamente en el piso o en el almacén, pero ni se vende ni se mueve;
//                por eso `piso` y `almacen` son NETOS de ella (`pisoDisponible`, `almacenDisponible`) y no se cuenta dos veces.
//   · dañada     en cuarentena. NUNCA entra al `total` de la sede (lib/inventario-reglas.ts, `sumarCantidades`): no es stock.
// De ahí dos totales: `enStock` (piso + almacén + apartada) es lo que hay en el piso y el almacén contando lo apartado, y
// `enLaSede` suma además lo dañado. OJO: la lista de Existencias NO muestra ninguno de los dos (su «Stock actual» es solo lo LIBRE:
// «nunca cuarentena, nunca lo apartado», y el Resumen dice «prendas libres, sin las apartadas»), así que ningún texto del cajón
// dice que un total «es el de la lista»: la suma se explica sola, cifra por cifra (revisión del 2026-10-04).

export type DesgloseDePrenda = {
  piso: number;
  almacen: number;
  apartada: number;
  danada: number;
  /** piso + almacén + apartada: lo que hay en el piso y el almacén, contando lo apartado (sin lo dañado). */
  enStock: number;
  /** enStock + dañadas: todo lo que hay de la prenda en la sede. */
  enLaSede: number;
};

/** Las cuatro cifras de una prenda y sus dos totales. `null` donde no se separa piso y almacén (el Taller): ahí no hay
 *  «colgada» ni «guardada» que repartir, y «no aplica» nunca se disfraza de 0. */
export function desgloseDePrenda(p: Pick<PrendaAgrupada, "piso" | "almacen" | "apartado" | "danado">): DesgloseDePrenda | null {
  if (p.piso === null || p.almacen === null) return null;
  const enStock = p.piso + p.almacen + p.apartado;
  return { piso: p.piso, almacen: p.almacen, apartada: p.apartado, danada: p.danado, enStock, enLaSede: enStock + p.danado };
}

/** La suma explicada bajo las cuatro cifras. `aparte` solo existe si hay dañadas: dice cuánto es la suma SIN ellas, para que
 *  quien cuente a mano el piso y el almacén no espere encontrar también lo que está en cuarentena. No dice «stock»: esa palabra
 *  ya significa «lo libre» en la lista y en el Resumen. */
export function lineaDeLaSuma(d: DesgloseDePrenda): { cuenta: string; texto: string; aparte: string | null } {
  return {
    cuenta: `${d.piso} + ${d.almacen} + ${d.apartada} + ${d.danada} = ${d.enLaSede}`,
    texto: `${d.enLaSede === 1 ? "prenda" : "prendas"} en esta sede`,
    aparte:
      d.danada > 0
        ? `${d.enStock} sin contar ${d.danada === 1 ? "la dañada, que está" : "las dañadas, que están"} en cuarentena`
        : null,
  };
}

/** Lo que hace la caja con cada lugar, en una frase: la aclaración que pidió Felipe (2026-10-04). El número es lo que la
 *  caja puede cobrar HOY de esta prenda. «Cliente», no «clienta»: en pantalla se le habla igual a un hombre que a una mujer. */
export function aclaracionDeLaCaja(d: DesgloseDePrenda): string {
  return `La caja solo cobra lo que está colgado en el piso y libre: hoy,\u00a0${d.piso}. Lo del almacén se baja al piso primero, lo apartado está reservado para un cliente y lo dañado espera la decisión de un líder.`;
}

/** De una lista de la sede (apartados, dañadas en cuarentena…), solo lo que es de ESTA prenda, por sus tallas. Es lo que abre
 *  cada cifra del cajón: tocar «Dañada 1» muestra esa prenda, no la cola entera de la sede. */
export function deLaPrenda<T extends { varianteId: string }>(items: readonly T[], prenda: { tallas: readonly Pick<FilaPrenda, "varianteId">[] }): T[] {
  const ids = new Set(prenda.tallas.map((t) => t.varianteId));
  return items.filter((i) => ids.has(i.varianteId));
}
