/**
 * «Reponer piso» por PRENDA (modelo + color): las reglas puras de la ventana, sin React ni supabase, para probarlas.
 *
 * EL PROBLEMA. El botón «Reponer» de la tarjeta (y «Reponer a piso» del cajón) abría una ventana para UNA sola talla —la
 * primera que se podía bajar—: con la S y la M por colgar, la M no aparecía y para bajarla había que cerrar y volver a
 * empezar. Además la ventana mostraba el SKU y «disponible en piso / en almacén» en voz de sistema.
 *
 * CONTRATO. La ventana lista TODAS las tallas de la prenda, la persona elige cuántas baja de cada una, y al confirmar se
 * llama UNA vez a `bajar_al_piso` (todo o nada, con marca de reintento: ADR-0208), nunca una llamada por talla. Asume que
 * las cifras que recibe son lo DISPONIBLE (neto de lo apartado para clientas), que es lo único que la base deja mover.
 * No sugiere cuántas bajar (ADR-0231): arranca en cero y la cifra la pone quien tiene la prenda en la mano.
 *
 * UN MODELO, TODOS SUS COLORES (ADR-0317). «Reponer prenda» y «Subir prenda» abren la ventana con el MODELO entero: una fila por
 * color y una columna por talla (la misma tabla de Nuevo/Editar producto). Cada celda es una variante, así que `cantidades`,
 * `problemas` y las líneas siguen yendo por `varianteId` y la llamada a la base sigue siendo UNA, todo o nada.
 */

import type { LineaBajada } from "./bajada-reglas";
import { hoyDeTalla } from "./existencias-hoy";
import type { FilaPrenda } from "./existencias-prendas";
import type { AccionPiso } from "./piso-plan";
import { nombreCortoSede } from "./stock-por-sede";

/** Un color del modelo tal como llega a la ventana: una prenda (modelo + color) con todas sus tallas. */
export type PrendaParaReponer = {
  referencia: string;
  color: string | null;
  colorHex: string | null;
  /** La foto de la prenda: va a la izquierda de la ventana. */
  fotoUrl?: string | null;
  /** Su categoría (opcional), para dibujar la prenda sin foto con su ícono: ver `SinFoto`. Una `PrendaAgrupada` la trae. */
  categoria?: string | null;
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  tallas: readonly FilaDeTalla[];
};

/** Lo mínimo de cada talla que necesita la ventana; una fila de Existencias lo satisface por estructura. `planPiso` (la decisión
 *  del motor del piso) solo hace falta para el aviso de «Subir prenda»: cuántas debería tener colgadas la talla. */
export type FilaDeTalla = Pick<FilaPrenda, "varianteId" | "talla" | "pisoDisponible" | "almacenDisponible"> & {
  /** `accion` solo hace falta para marcar lo que falta en el piso (`tallasQueFaltan`); `requisito`, para el aviso de «Subir prenda». */
  planPiso?: { requisito: number; accion?: AccionPiso } | null;
  /** Lo que viene en traslados hacia esta sede y dónde más hay (`FilaExistencias`): para decir «casi no hay: en otras sedes». */
  enTransito?: number;
  enRed?: readonly { sede: string; cantidad: number }[];
};

/** Una talla tal como la lee la ventana: sin nulos, para que ninguna cuenta dependa de `?? 0` regado por el JSX. `requisito`:
 *  cuántas debería tener colgadas hoy (`lib/piso-plan.ts`); 0 si el motor no la decidió. */
export type TallaParaReponer = { varianteId: string; talla: string; piso: number; almacen: number; requisito: number };

/** Cuánto lleva cada talla en el selector, por variante. Lo que no está aquí es 0. */
export type Cantidades = Readonly<Record<string, number>>;

/** Hacia dónde van las prendas: «bajar» = del almacén al piso («Reponer»); «subir» = del piso al almacén («Subir a almacén»). */
export type Rumbo = "bajar" | "subir";

/** Todas las tallas de la prenda, en el orden en que llegan (ya vienen en curva: `agruparPorPrenda`). Sin tope ni filtro:
 *  una talla sin nada en el almacén también se lista, para que quien la busca vea POR QUÉ no se puede bajar. */
export function tallasParaReponer(filas: readonly FilaDeTalla[]): TallaParaReponer[] {
  return filas.map((f) => ({
    varianteId: f.varianteId,
    talla: f.talla?.trim() || "Única",
    piso: Math.max(0, f.pisoDisponible ?? 0),
    almacen: Math.max(0, f.almacenDisponible ?? 0),
    requisito: Math.max(0, f.planPiso?.requisito ?? 0),
  }));
}

/** Se puede bajar si hay algo LIBRE en el almacén. No pide que «Acción hoy» diga reponer: quien ve una talla con 3 en el
 *  piso y 4 atrás puede querer subir una más, y la base solo exige que haya. */
export function sePuedeBajarTalla(t: Pick<TallaParaReponer, "almacen">): boolean {
  return t.almacen > 0;
}

export function cantidadDe(cantidades: Cantidades, varianteId: string): number {
  return cantidades[varianteId] ?? 0;
}

/** Un entero entre 0 y el tope: el «+» no pasa de lo que hay y el «−» no baja de cero. */
export function acotarCantidad(n: number, tope: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, Math.trunc(n)), Math.max(0, Math.trunc(tope)));
}

/** Lo que la persona teclea en la cajita del número: lo que no es número cuenta como cero, y nunca pasa del tope. */
export function leerCantidadTecleada(texto: string, tope: number): number {
  const solo = texto.replace(/\D/g, "");
  return solo === "" ? 0 : acotarCantidad(Number(solo), tope);
}

/** Las líneas que viajan a la base: solo las tallas con algo elegido, en el orden de la curva, recortadas al tope del lugar
 *  de donde salen (el almacén al bajar, el piso al subir). */
export function lineasDeMover(tallas: readonly TallaParaReponer[], cantidades: Cantidades, rumbo: Rumbo): LineaBajada[] {
  const lineas: LineaBajada[] = [];
  for (const t of tallas) {
    const cantidad = acotarCantidad(cantidadDe(cantidades, t.varianteId), rumbo === "bajar" ? t.almacen : t.piso);
    if (cantidad > 0) lineas.push({ varianteId: t.varianteId, cantidad });
  }
  return lineas;
}

/** Lo que dice una fila cuando la base le contestó que ya no hay tanto. `motivo` viene de `bajar_al_piso` / `retirar_del_piso`;
 *  `lugar` es de donde salen las prendas (el almacén al bajar, el piso al subir). */
export function textoFilaSinAlcance(hay: number, motivo: string, lugar: "almacén" | "piso" = "almacén"): string {
  if (motivo === "archivada") return "Esta talla está archivada: no se baja al piso.";
  if (motivo === "no_existe") return "Esta talla ya no existe en el catálogo.";
  if (motivo === "no_es_prenda") return "Esto no es una prenda real: no se mueve.";
  const en = lugar === "piso" ? "el piso" : "el almacén";
  return hay === 0 ? `Ya no queda nada libre en ${en}.` : hay === 1 ? `Solo queda 1 libre en ${en}.` : `Solo quedan ${hay} libres en ${en}.`;
}

/* ====================================================================
   Lo que la ventana «Reponer prenda» dice del modelo (2026-10-05, maqueta `existencias-tactil-2026-10`): qué falta en el piso, tres
   atajos para llenar la tabla y lo que casi no hay (con quién lo tiene). Todo sale de la MISMA decisión del piso que el filtro «Hoy»
   (`hoyDeTalla`): una talla «falta en el piso» cuando el motor la pide («Por colgar») y hay algo libre atrás que bajar.

   Los atajos no cambian la regla de ADR-0231 («la ventana no sugiere cuántas bajar: arranca en cero»): la tabla SIGUE abriendo en 0, y
   estos botones solo llenan cuando la persona los toca —el mismo 1 por talla con el que Existencias manda a «Bajar al piso» lo marcado
   (`lineasParaBajar`, ADR-0237)—. Quien tiene la prenda en la mano ajusta cada cifra después.
   ==================================================================== */

/** ¿El motor del piso la pide («Por colgar»)? La misma pregunta del filtro «Hoy» (`hoyDeTalla`); sin decisión del motor, no. */
function pideColgarse(f: FilaDeTalla): boolean {
  const accion = f.planPiso?.accion;
  return !!accion && hoyDeTalla({ pisoDisponible: f.pisoDisponible, almacenDisponible: f.almacenDisponible, planPiso: { accion } }) === "por_colgar";
}

/** Las tallas que faltan en el piso: las que el motor pide («Por colgar») y tienen algo libre en el almacén. Por `varianteId`. */
export function tallasQueFaltan(prendas: readonly PrendaParaReponer[]): Set<string> {
  const faltan = new Set<string>();
  for (const p of prendas) for (const f of p.tallas) if (pideColgarse(f) && Math.max(0, f.almacenDisponible ?? 0) > 0) faltan.add(f.varianteId);
  return faltan;
}

/** «Faltan en el piso: Azul marino 26, 28 · Celeste 30.» o, si no falta nada, `null`. */
export function fraseDeLoQueFalta(prendas: readonly PrendaParaReponer[]): string | null {
  const faltan = tallasQueFaltan(prendas);
  const partes = prendas
    .map((p) => {
      const tallas = p.tallas.filter((f) => faltan.has(f.varianteId)).map((f) => f.talla?.trim() || "Única");
      if (tallas.length === 0) return null;
      const color = p.color?.trim();
      return prendas.length > 1 && color ? `${color} ${tallas.join(", ")}` : tallas.join(", ");
    })
    .filter((x): x is string => x !== null);
  return partes.length === 0 ? null : `Faltan en el piso: ${partes.join(" · ")}.`;
}

/** «Lo que falta en el piso»: una unidad de cada talla que falta. */
export function cantidadesDeLoQueFalta(prendas: readonly PrendaParaReponer[]): Cantidades {
  return Object.fromEntries([...tallasQueFaltan(prendas)].map((id) => [id, 1]));
}

/** «Todo el almacén»: de cada talla, todo lo libre que hay atrás. */
export function cantidadesDeTodoElAlmacen(prendas: readonly PrendaParaReponer[]): Cantidades {
  const todo: Record<string, number> = {};
  for (const p of prendas) for (const f of p.tallas) if (Math.max(0, f.almacenDisponible ?? 0) > 0) todo[f.varianteId] = Math.max(0, f.almacenDisponible ?? 0);
  return todo;
}

export type CasiNoHay = { clave: string; color: string | null; talla: string; agotada: boolean; /** «AQP 2 · LIM 1». */ sedes: string };

/** Las tallas con 1 o ninguna libre en esta sede (piso + almacén), que no vienen en camino y que otra sede sí tiene: lo que se pide
 *  a otra sede. Lo que ya viene en traslado no se pide de nuevo. */
export function casiNoHay(prendas: readonly PrendaParaReponer[]): CasiNoHay[] {
  const salida: CasiNoHay[] = [];
  for (const p of prendas) {
    for (const f of p.tallas) {
      const aqui = Math.max(0, f.pisoDisponible ?? 0) + Math.max(0, f.almacenDisponible ?? 0);
      const red = (f.enRed ?? []).filter((x) => x.cantidad > 0);
      if (aqui > 1 || (f.enTransito ?? 0) > 0 || red.length === 0) continue;
      salida.push({
        clave: f.varianteId,
        color: p.color?.trim() || null,
        talla: f.talla?.trim() || "Única",
        agotada: aqui === 0,
        sedes: red.map((x) => `${nombreCortoSede(x.sede)} ${x.cantidad}`).join(" · "),
      });
    }
  }
  return salida;
}

/** Un color del modelo ya leído por la ventana: sin nulos, con la clave que lo distingue de los demás. */
export type ColorParaMover = { clave: string; nombre: string; hex: string | null; tallas: readonly TallaParaReponer[] };

/** Los colores del modelo, en el orden en que llegan. `clave` es el nombre: dos colores del mismo modelo no se llaman igual. */
export function coloresParaMover(prendas: readonly PrendaParaReponer[]): ColorParaMover[] {
  return prendas.map((p, i) => ({
    clave: `${i}:${p.color?.trim() || "sin-color"}`,
    nombre: p.color?.trim() || "Sin color",
    hex: p.colorHex,
    tallas: tallasParaReponer(p.tallas),
  }));
}

/** Lo máximo que se mueve de esta celda: lo libre del lugar de donde salen las prendas. */
export const topeDeTalla = (t: Pick<TallaParaReponer, "piso" | "almacen">, rumbo: Rumbo): number => (rumbo === "bajar" ? t.almacen : t.piso);

/** Lo que se movió, para el aviso de éxito: «S 1 · M 2» con un solo color; «Azul S 2, M 3 · Blanco S 2» con varios. */
export function detalleDeLoMovido(colores: readonly ColorParaMover[], lineas: readonly LineaBajada[]): string {
  const cantidad = new Map(lineas.map((l) => [l.varianteId, l.cantidad]));
  const partes = colores
    .map((c) => {
      const tallas = c.tallas.filter((t) => cantidad.has(t.varianteId)).map((t) => `${t.talla} ${cantidad.get(t.varianteId)}`);
      if (tallas.length === 0) return null;
      return colores.length > 1 ? `${c.nombre} ${tallas.join(", ")}` : tallas.join(" · ");
    })
    .filter((x): x is string => x !== null);
  return partes.join(" · ");
}

/** Las líneas que viajan a la base: las de todos los colores juntas, en el orden de la tabla. UNA sola llamada, todo o nada. */
export function lineasDeMoverModelo(colores: readonly Pick<ColorParaMover, "tallas">[], cantidades: Cantidades, rumbo: Rumbo): LineaBajada[] {
  return colores.flatMap((c) => lineasDeMover(c.tallas, cantidades, rumbo));
}
