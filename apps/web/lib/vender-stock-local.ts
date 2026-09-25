/**
 * El stock de la caja después de vender, sin recargar la pantalla entera (ADR-0192).
 *
 * EL PROBLEMA. Tras cada venta la caja hacía `router.refresh()`: el servidor volvía a leer el catálogo, el stock de
 * TODA la red (~2.900 filas), el de la sede (~2.300), campañas, categorías, tallas y colores — ~10 viajes y ~1 MB por
 * venta, por caja. Lo único que una venta cambia es el stock de SUS prendas en ESTA sede y la lista de ventas de hoy.
 *
 * LA REGLA. Al vender, la pantalla descuenta lo vendido de inmediato (la cajera no ve unidades que ya cobró) y
 * después relee de la base SOLO esas prendas: la cifra final es la de la base, que también refleja lo que otra caja
 * vendió de esas mismas prendas mientras tanto. Si otra caja vende la última unidad de una prenda que aquí no se tocó,
 * esta pantalla la sigue mostrando hasta la próxima carga: quien lo defiende es `registrar_venta` (valida el stock con
 * candado y responde «Stock insuficiente», que la caja traduce con el nombre de la prenda).
 *
 * Todo aquí es puro: lo usan `PuntoDeVenta` (cliente) y `vender/page.tsx` (servidor).
 */
import type { Cantidades } from "@/lib/inventario-reglas";

/** Lo que la caja puede cobrar de una prenda: el PISO disponible (una venta nunca descuenta el almacén en
 *  silencio) o, en una ubicación sin piso/almacén (Taller), el total disponible. Lo apartado no cuenta (ADR-0141). */
export function cantidadCobrable(c: Cantidades | undefined): number {
  if (!c) return 0;
  return c.pisoDisponible ?? c.disponible;
}

/** Lo que hay en el ALMACÉN de esta sede y se podría ofrecer (lo apartado no cuenta, ADR-0141). No se cobra desde la
 *  caja —una venta descuenta el piso—, pero dice «está en el almacén» en vez de «agotada» (D-40). `null` donde no hay
 *  almacén que ofrecer: una ubicación sin piso/almacén (Taller) o una prenda sin fila de stock en esta sede. */
export function almacenDeLaSede(c: Cantidades | undefined): number | null {
  return c?.almacenDisponible ?? null;
}

// --- «Agotada» o «está en el almacén» (D-40) ---------------------------------------------------------------------
// La caja solo cobra del PISO, pero con el piso en 0 y la prenda guardada en el almacén de la MISMA tienda, decir
// «agotada» hacía que la colaboradora le dijera «no hay» a una clienta con la prenda a unos metros. D-40: lo del
// almacén se puede vender y la caja no se frena por un trámite. Mientras bajar al piso siga siendo un paso aparte, la
// caja no cobra del almacén (registrar_venta descuenta el piso): lo dice, y dice qué hacer.

/** Qué puede hacer la caja con una prenda AHORA: cobrarla (hay en el piso), pedir que la bajen (el piso está en 0 y
 *  hay en el almacén de esta sede) o nada (no hay ni en el piso ni en el almacén). Sin `almacenAqui` (Taller, o quien
 *  arme variantes sin ese dato) se comporta como antes: con el piso en 0, agotada. */
export type MotivoCaja = "cobrable" | "en_almacen" | "agotada";

export function motivoNoCobrable({ stockAqui, almacenAqui }: { stockAqui: number; almacenAqui?: number | null }): MotivoCaja {
  if (stockAqui > 0) return "cobrable";
  return (almacenAqui ?? 0) > 0 ? "en_almacen" : "agotada";
}

/** Lo que el aviso necesita saber: el nombre que se lee («Blusa Paracas · M»), la sede y lo que hay en cada lado. */
export type DatosAvisoStock = { nombre: string; sede: string; stockAqui: number; almacenAqui?: number | null };
export type AvisoStock = { titulo: string; detalle: string };

/** Dónde se REGISTRA que una prenda pasó del almacén al piso: el botón «Reponer» de su fila en Existencias
 *  (`InventarioPanel`). Los avisos lo nombran porque «que la bajen» a secas se lee como un paso físico: con la prenda
 *  ya en la mano (la colgaron sin registrar, D-42), la colaboradora iba a traer otra y volvía al mismo aviso. Lo que
 *  falta es el registro, no la prenda. Mismo sentido que el error de stock de `error-escritura.ts`. */
export const DONDE_SE_BAJA = "Inventario ▸ Existencias ▸ Reponer";

/** El aviso cuando una prenda no entra al ticket porque en el piso no hay: dice DÓNDE está y QUÉ hacer, en palabras
 *  de una colaboradora que no conoce el sistema. Sirve igual si la buscó por nombre (la prenda está atrás) o si la
 *  escaneó (la tiene en la mano): en los dos casos falta registrar el paso al piso. En el Taller (sin almacén) se
 *  queda como siempre. */
export function avisoSinPiso({ nombre, sede, stockAqui, almacenAqui }: DatosAvisoStock): AvisoStock {
  if (motivoNoCobrable({ stockAqui, almacenAqui }) === "en_almacen") {
    return {
      titulo: `${nombre} está en el almacén`,
      detalle: `En el sistema hay 0 en el piso y ${almacenAqui} en el almacén de ${sede}. Para cobrarla, que la bajen en ${DONDE_SE_BAJA} (aunque ya la tengas en la mano, hay que registrarlo).`,
    };
  }
  return {
    titulo: `${nombre} está agotada`,
    // Con almacén en 0 se dice que tampoco hay ahí: así nadie va a buscarla en vano.
    detalle: almacenAqui == null ? `No hay stock en ${sede}.` : `No hay en el piso ni en el almacén de ${sede}.`,
  };
}

/** El aviso cuando ya están en el ticket todas las del piso («tope»). `quedoEn`: la cantidad se escribió a mano en el
 *  ticket y se recortó a lo que hay. Si en el almacén hay más, lo dice: la clienta que quiere dos no se va con una. */
export function avisoTope({ nombre, sede, stockAqui, almacenAqui, quedoEn = false }: DatosAvisoStock & { quedoEn?: boolean }): AvisoStock {
  const enAlmacen = almacenAqui ?? 0;
  if (enAlmacen > 0) {
    const delPiso = quedoEn
      ? `En el piso quedan ${stockAqui}; la cantidad quedó en ${stockAqui}.`
      : stockAqui === 1
        ? "La del piso ya está en el ticket."
        : `Las ${stockAqui} del piso ya están en el ticket.`;
    const pedir = enAlmacen === 1 ? "que la bajen" : "que bajen las que necesites";
    return {
      titulo: `No hay más de ${nombre} en el piso`,
      detalle: `${delPiso} Hay ${enAlmacen} más en el almacén de ${sede}: ${pedir} en ${DONDE_SE_BAJA}.`,
    };
  }
  return {
    titulo: `No hay más de ${nombre}`,
    detalle: quedoEn ? `En ${sede} quedan ${stockAqui}; la cantidad quedó en ${stockAqui}.` : `En ${sede} quedan ${stockAqui} y ya están todas en el ticket.`,
  };
}

/** Una línea del ticket que ya no alcanza: su nombre («Blusa Paracas (BLU-0001-BEI-M)»), lo que queda en el piso y lo
 *  que hay en el almacén de esta sede. */
export type LineaCorta = { nombre: string; piso: number; almacen?: number | null };

/** El aviso cuando el ticket pide más de lo que queda en el piso: al retomar un ticket en espera, o cuando la base
 *  rechaza el cobro porque otra caja vendió lo mismo. Si alguna de esas prendas está en el almacén de esta sede, lo
 *  dice con el número y qué hacer, en vez de «ya no tiene stock» (D-40): la colaboradora quitaba la prenda y le
 *  decía «no hay» a la clienta que ya estaba pagando. */
export function avisoCortas(cortas: LineaCorta[], sede: string): AvisoStock {
  const hayEnAlmacen = cortas.some((c) => (c.almacen ?? 0) > 0);
  const lista = cortas
    .map((c) => ((c.almacen ?? 0) > 0 ? `${c.nombre}: en el piso quedan ${c.piso} y en el almacén hay ${c.almacen}` : `${c.nombre}: quedan ${c.piso}`))
    .join("; ");
  return hayEnAlmacen
    ? { titulo: `No alcanza lo del piso de ${sede}`, detalle: `${lista}. Lo del almacén se cobra cuando lo bajen en ${DONDE_SE_BAJA}; si no, ajusta la cantidad o quita la prenda.` }
    : { titulo: `Ya no hay stock suficiente en ${sede}`, detalle: `${lista}. Ajusta la cantidad o quita la prenda.` };
}

/** Lo que la cámara no pudo meter al ticket porque, según el sistema, está en el almacén (piso en 0, o todas las del
 *  piso ya en el ticket). La cámara no pinta el aviso largo —le taparía la ✕—, así que al cerrarla sale UNO solo con lo
 *  que quedó fuera y qué hacer. Sin nada, `null`: no se avisa nada. */
export function avisoQuedaronEnAlmacen(nombres: string[], sede: string): AvisoStock | null {
  if (nombres.length === 0) return null;
  if (nombres.length === 1) {
    return {
      titulo: `${nombres[0]} no entró al ticket`,
      detalle: `Según el sistema está en el almacén de ${sede}. Para cobrarla, que la bajen en ${DONDE_SE_BAJA} (aunque ya la tengas en la mano, hay que registrarlo).`,
    };
  }
  return {
    titulo: `${nombres.length} prendas no entraron al ticket`,
    detalle: `${nombres.join(", ")}. Según el sistema están en el almacén de ${sede}. Para cobrarlas, que las bajen en ${DONDE_SE_BAJA} (aunque ya las tengas en la mano, hay que registrarlo).`,
  };
}

/** Stock de la caja corregido: `ajustes` pisa `stockAqui` de las prendas que se vendieron o releyeron en esta
 *  pantalla. Devuelve el MISMO arreglo si no hay nada que corregir (los `useMemo` de abajo no se recalculan). */
export function conStockAjustado<V extends { varianteId: string; stockAqui: number }>(variantes: V[], ajustes: ReadonlyMap<string, number>): V[] {
  if (ajustes.size === 0) return variantes;
  return variantes.map((v) => (ajustes.has(v.varianteId) ? { ...v, stockAqui: ajustes.get(v.varianteId)! } : v));
}

/** El almacén de la caja corregido con lo que se RELEYÓ de la base (el sondeo en vivo o la relectura tras vender).
 *  Separado de `conStockAjustado` a propósito: una venta descuenta el piso y nunca toca el almacén, así que aquí no
 *  entra nada de `descontarVendido`. Mismo contrato: sin ajustes, el MISMO arreglo. */
export function conAlmacenAjustado<V extends { varianteId: string; almacenAqui?: number | null }>(variantes: V[], ajustes: ReadonlyMap<string, number | null>): V[] {
  if (ajustes.size === 0) return variantes;
  return variantes.map((v) => (ajustes.has(v.varianteId) ? { ...v, almacenAqui: ajustes.get(v.varianteId) ?? null } : v));
}

/** Descuenta lo vendido del stock que la pantalla muestra, sin bajar de 0. Parte de `stockActual` (lo que se ve
 *  ahora, sin la cola sin conexión) y devuelve los ajustes nuevos, mezclados con los que ya había. */
export function descontarVendido(
  ajustes: ReadonlyMap<string, number>,
  stockActual: ReadonlyMap<string, number>,
  vendidas: { varianteId: string; cantidad: number }[],
): Map<string, number> {
  const nuevos = new Map(ajustes);
  for (const { varianteId, cantidad } of vendidas) {
    const antes = nuevos.get(varianteId) ?? stockActual.get(varianteId);
    if (antes === undefined) continue; // no está en el catálogo de la caja (prenda sin registrar, cargo especial)
    nuevos.set(varianteId, Math.max(0, antes - cantidad));
  }
  return nuevos;
}

/** Mezcla lo que la base respondió para las prendas releídas. Una prenda pedida que no volvió en la respuesta ya no
 *  tiene fila de stock en esta sede: queda en 0 (no se inventa lo que había antes). */
export function conStockReleido(ajustes: ReadonlyMap<string, number>, pedidas: string[], releido: ReadonlyMap<string, Cantidades>): Map<string, number> {
  const nuevos = new Map(ajustes);
  for (const id of pedidas) nuevos.set(id, cantidadCobrable(releido.get(id)));
  return nuevos;
}

/** El almacén de las prendas releídas, de las MISMAS filas que `conStockReleido` (sin otra consulta). Una prenda pedida
 *  que no volvió no tiene fila en esta sede: queda en `null` («no hay almacén que ofrecer»), igual que al cargar. */
export function almacenReleido(pedidas: string[], releido: ReadonlyMap<string, Cantidades>): Map<string, number | null> {
  return new Map(pedidas.map((id) => [id, almacenDeLaSede(releido.get(id))]));
}
