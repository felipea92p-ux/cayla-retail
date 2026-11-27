/* ====================================================================
   La cuenta de «por colgar» de una sede (ADR-0331 act. b). El archivo nació como «Para hoy» de Existencias (rediseño del 2026-10-04):
   las tareas de la sede con su cifra y su frase, que desde el 2026-10-06 se abrían desde el anillo «N de M hoy» y la ventana
   «Pendientes». Las dos se fueron el 2026-11-26 (Felipe, «Existencias sin ruido»): todo lo que listaban ya se veía en otro lado —el piso
   sin cuadrar, las dañadas, lo que viene en camino y «sin stock atrás», en Existencias; las ventas sin registrar, los apartados vencidos
   y los traslados atrasados, en los avisos de Inicio—. Queda la cuenta que comparten el filtro «Hoy ▸ Por colgar» y el Inicio de Almacén.
   ==================================================================== */

import { contarEnPausa, hoyDeTalla } from "./existencias-hoy";
import { agruparPorPrenda, ordenarPorListaDelDia, type FilaPrenda, type PrendaAgrupada } from "./existencias-prendas";

/** Lo «por colgar» de TODA la sede (no lo filtrado), con la decisión del motor del piso que trae cada talla (`hoyDeTalla`). */
export type PorColgarDeSede<F extends FilaPrenda> = {
  /** Cuántas tallas (variantes) están «Por colgar»: el motor pide una colgada, no queda ninguna y en el almacén hay. */
  tallas: number;
  /** Lo libre en el almacén de esas tallas: lo que se podría colgar hoy. */
  unidades: number;
  /** Cuántas tallas serían «por colgar» pero esperan el cuadre del piso («En pausa», ADR-0328 decisión 5). Con el piso sin
   *  cuadrar `tallas` es 0 y esta es la cifra que el Inicio dice en su lugar: nunca un «al día» falso. */
  enPausa: number;
  /** Esas tallas, en el orden de la sede (lo que se manda a «Bajar al piso»). */
  filas: F[];
  /** Agrupadas por prenda (modelo + color), en el orden de la lista del día del motor: lo vendido ayer primero. */
  prendas: PrendaAgrupada<F>[];
};

/** La ÚNICA cuenta de «por colgar» de una sede: de aquí salen la cifra que suma el filtro
 *  «Hoy ▸ Por colgar» y el aviso y el bloque del Inicio de Almacén. Hasta el 2026-10-04 el Inicio contaba por su lado (modelos con
 *  alguna talla que pedía reponer, agotadas incluidas) y su número no coincidía con el de Existencias: con una sola función, no
 *  pueden discrepar (ADR-0331 act. b).
 *
 *  QUÉ es «por colgar» no se decide aquí: lo decide el motor del piso (`lib/piso-plan.ts`, ADR-0328 act. 7) y cada talla trae su
 *  decisión en `planPiso`. El motor también da el ORDEN (`listaDelDia`: lo vendido ayer primero); sin lista (el motor no respondió,
 *  o el piso está en pausa) las prendas quedan en el orden en que llegaron. Se pide siempre, para que ninguna pantalla vuelva a
 *  ordenar por su cuenta. */
export function porColgarDeLaSede<F extends FilaPrenda>(stock: readonly F[], listaDelDia: readonly string[]): PorColgarDeSede<F> {
  const filas = stock.filter((f) => hoyDeTalla(f) === "por_colgar");
  return {
    tallas: filas.length,
    unidades: filas.reduce((s, f) => s + (f.almacenDisponible ?? 0), 0),
    enPausa: contarEnPausa(stock),
    filas,
    prendas: ordenarPorListaDelDia(agruparPorPrenda(filas), listaDelDia),
  };
}
