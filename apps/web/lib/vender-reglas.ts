// Reglas puras del punto de venta — sin `createClient`, sin `next/headers`, cero
// dependencia de servidor. Mismo patrón que `comprobantes-reglas.ts`: lo que el
// componente cliente `PuntoDeVenta` necesita como VALOR vive en un archivo que
// ningún fetcher server-only pueda arrastrar al navegador.

import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";

/** Los momentos del ticket (ADR-0044). En «armar» solo se ven las líneas y el total;
 *  «descuento» es el apartado para decidir un descuento (vuelve a «armar»); «espera» es
 *  la lista de tickets en espera de la sede (vuelve a «armar»); el pago y el comprobante
 *  aparecen recién al tocar «Cobrar». */
export type MomentoTicket = "armar" | "descuento" | "espera" | "cobrar";

/** Qué tickets en espera vuelven a la pantalla al montar Vender. La espera de la sede
 *  se vacía al cerrar caja (ADR-0049) — y eso incluye abrir la página al día siguiente
 *  con la caja todavía cerrada: lo guardado ayer no vuelve. Vive acá y no dentro del
 *  efecto porque es la decisión, no el acceso al storage. */
export function esperaAlCargar<T>(cajaCerrada: boolean, guardados: T[]): T[] {
  return cajaCerrada ? [] : guardados;
}

/** Las líneas de un ticket retomado, con el código de etiqueta completo. Un ticket dejado
 *  en espera antes de que el carrito guardara `codigo` (2026-09-16) vuelve del navegador
 *  SIN ese campo, y si es una prenda del censo tampoco trae sku: la línea se pintaba con
 *  el hueco vacío. Se completa desde el catálogo de la sede por `varianteId` — el mismo
 *  dato que habría guardado `agregar()`. Lo que el catálogo ya no tenga (prenda
 *  desactivada, «Cargo especial») queda sin código y `codigoPrenda` cae al sku. */
export function conCodigoDelCatalogo<T extends { varianteId: string; codigo?: string | null }>(
  carrito: readonly T[],
  catalogo: readonly { varianteId: string; codigo: string | null }[]
): (T & { codigo: string | null })[] {
  return carrito.map((it) => ({
    ...it,
    codigo: it.codigo ?? catalogo.find((v) => v.varianteId === it.varianteId)?.codigo ?? null,
  }));
}

/** Un medio con el que la clienta pagó parte (o todo) del ticket. `recibido` es solo
 *  para el efectivo y solo de pantalla: lo que entregó, para calcular el vuelto. A la
 *  RPC viaja únicamente `{ metodo, monto }` — si viajara lo entregado en vez de lo que
 *  cubre, `registrar_venta` lo rechazaría por no cuadrar con los ítems. */
export type PagoAplicado = { metodo: MetodoPago; monto: number; recibido?: number };

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que falta cubrir del total con los pagos puestos, a 2 decimales. Negativo si se
 *  pasan — `registrar_venta` exige que sumen igual que los ítems al centavo. */
export function restanteDePagos(total: number, pagos: readonly PagoAplicado[]): number {
  return redondear2(total - pagos.reduce((acc, p) => acc + p.monto, 0));
}

/** Atajos F1–F5 de la caja: cada tecla es un medio de pago, en el MISMO orden en que el selector
 *  los muestra (F1 efectivo, F2 tarjeta, F3 yape, F4 plin, F5 transferencia). `null` si la tecla
 *  no es un atajo. Con cualquier modificador (Ctrl+F5 = recarga forzada, Alt+F4 = cerrar…) o con la
 *  tecla mantenida (`repeat`) NO cuenta: un atajo del navegador o del sistema no se le quita a
 *  nadie, y mantener F2 no puede prender y apagar el medio veinte veces por segundo. */
export function metodoDeAtajo(t: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean; repeat?: boolean }): MetodoPago | null {
  if (t.ctrlKey || t.altKey || t.metaKey || t.shiftKey || t.repeat) return null;
  const m = /^F([1-5])$/.exec(t.key);
  return m ? METODOS_PAGO[Number(m[1]) - 1] : null;
}

/** Separa el IGV de un total que YA lo incluye (los precios de CAYLA son con IGV). Es la
 *  misma cuenta que hace `ComprobantesPanel` al emitir — `igv = total − total/(1+tasa)` a
 *  2 decimales y `subtotal = total − igv` —, así lo que la cajera ve en el ticket es lo que
 *  saldrá en el comprobante, y `subtotal + igv = total` al centavo (la base lo exige). */
export function desgloseIgv(total: number, tasa: number): { subtotal: number; igv: number } {
  const igv = redondear2(total - total / (1 + tasa));
  return { subtotal: redondear2(total - igv), igv };
}

/** Quita el pago `indice` y traspasa su monto al que queda en su lugar (el «siguiente»; si
 *  era el último, al último que queda). Sin esto, quitar el medio que llevaba el total dejaba
 *  el resto en 0 y la cajera tenía que volver a escribirlo (Felipe, 2026-09-18). El total
 *  cubierto no cambia: solo cambia quién lo cubre. Si no queda ningún otro medio, o el
 *  quitado estaba en 0, no hay nada que traspasar. */
export function quitarPagoTraspasando(pagos: readonly PagoAplicado[], indice: number): PagoAplicado[] {
  const quitado = pagos[indice];
  if (!quitado) return [...pagos];
  const resto = pagos.filter((_, i) => i !== indice);
  if (resto.length === 0 || quitado.monto <= 0) return resto;
  const destino = Math.min(indice, resto.length - 1);
  return resto.map((p, i) => (i === destino ? { ...p, monto: redondear2(p.monto + quitado.monto) } : p));
}

/** El vuelto de un pago: lo recibido menos lo que cubre, solo en efectivo (Yape, Plin,
 *  tarjeta y transferencia no dan vuelto). Nunca negativo: si lo recibido no llega, no
 *  hay vuelto que mostrar — lo que falta lo dice `motivoBloqueoCobro`. */
export function vueltoDe(pago: PagoAplicado): number {
  if (pago.metodo !== "efectivo" || pago.recibido === undefined) return 0;
  return Math.max(0, redondear2(pago.recibido - pago.monto));
}

/** Los pagos como viajan a `registrar_venta`. Solo montos > 0 (`venta_pagos` lo exige). El
 *  `recibido` va únicamente en efectivo y solo si cubre lo que corresponde: la base lo
 *  guarda para reimprimir el vuelto y su candado (`venta_pagos_recibido_coherente`) rechaza
 *  TODA la venta si `recibido < monto`, así que una cifra a medio escribir no puede viajar. */
export function pagosParaRpc(pagos: readonly PagoAplicado[]): { metodo: MetodoPago; monto: number; recibido?: number }[] {
  return pagos
    .filter((p) => p.monto > 0)
    .map(({ metodo, monto, recibido }) =>
      metodo === "efectivo" && recibido !== undefined && recibido >= monto ? { metodo, monto, recibido } : { metodo, monto }
    );
}

/**
 * Por qué el botón principal del ticket está apagado — o `null` si se puede seguir.
 *
 * Se deriva UNA sola vez en `PuntoDeVenta` y alimenta tres cosas a la vez: el
 * `disabled` del botón, la línea que lo explica debajo, y el freno dentro de
 * `cobrar()`. Antes cada una tenía su propia condición y el botón callaba.
 *
 * El orden es el del recorrido real: primero tiene que haber caja, después algo
 * que cobrar, y solo entonces —ya en el momento «cobrar»— con qué se cubre la
 * plata (todos los medios, hasta el centavo) y recién al final el comprobante.
 * Pedir el método con el ticket vacío es exactamente la decisión antes de tiempo
 * que este cambio elimina.
 */
export function motivoBloqueoCobro(v: {
  cajaAbierta: boolean;
  prendas: number;
  momento: MomentoTicket;
  total: number;
  pagos: readonly PagoAplicado[];
  facturaSinRuc: boolean;
}): string | null {
  if (!v.cajaAbierta) return "Abre la caja para vender.";
  if (v.prendas === 0) return "Agrega una prenda para cobrar.";
  if (v.momento !== "cobrar") return null;
  if (v.pagos.length === 0) return "Elige cómo pagó la clienta.";
  const restante = restanteDePagos(v.total, v.pagos);
  if (restante > 0) return `Falta cubrir S/${restante.toFixed(2)}.`;
  if (restante < 0) return "Los pagos superan el total.";
  if (v.facturaSinRuc) return "La factura necesita el RUC de la empresa.";
  return null;
}

// ---- Descuento manual (decidido con Felipe el 2026-09-14) -------------------------
// El precio lo fija el catálogo y ya no se edita en la caja; lo que se decide en el
// mostrador es un descuento. Viaja como `descuento_unitario` por línea — la columna que
// `venta_items` ya tiene (≥ 0, ≤ precio, subtotal generado) y que `registrar_venta`
// recibe — así queda medido por prenda en vez de disfrazado de "precio más bajo".

/** Un % (entero o no) convertido a monto por unidad, con 2 decimales. Fuera de 0..100
 *  se recorta: 0 (o inválido) no descuenta; 100 regala la prenda, nunca más — el
 *  candado `venta_items_descuento_no_supera_precio` lo rechazaría igual. */
export function descuentoUnitarioPorPorcentaje(precioUnitario: number, porcentaje: number): number {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  if (porcentaje >= 100) return precioUnitario;
  return redondear2((precioUnitario * porcentaje) / 100);
}

/** Un monto en soles (no %) convertido a descuento por unidad, con 2 decimales. Nunca
 *  supera el precio — el candado `venta_items_descuento_no_supera_precio` lo rechazaría
 *  igual, pero acá se recorta antes para que "Quedaría en" no muestre un negativo. */
export function descuentoUnitarioPorMonto(precioUnitario: number, montoUnitario: number): number {
  if (!Number.isFinite(montoUnitario) || montoUnitario <= 0) return 0;
  return redondear2(Math.min(montoUnitario, precioUnitario));
}

// ---- Motivo y argumento del descuento (R-45 / D-44, cerrado el 2026-09-15) ---------
// Un texto libre no se puede sumar; una lista sí, y a fin de mes se ve cuánto margen se
// fue por cada motivo (R-45, punto 2). El candado de verdad vive en `registrar_venta`
// (`20260915140000_descuento_motivo_y_escalonado.sql`) — esto es la MISMA regla en el
// navegador, para que el apartado sepa qué pedir antes de que la Encargada intente cobrar.

/** Los cinco motivos que `registrar_venta` acepta — la base manda; agregar uno acá sin
 *  agregarlo también en la migración deja a la venta rechazándose con el error genérico. */
export const RAZONES_DESCUENTO = [
  { valor: "cumpleanos_clienta_top", etiqueta: "Cumpleaños clienta top" },
  { valor: "prenda_con_desperfecto", etiqueta: "Prenda con desperfecto" },
  { valor: "liquidacion_temporada", etiqueta: "Liquidación de temporada" },
  { valor: "cerrar_venta", etiqueta: "Cerrar la venta" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

/** Lo que acompaña a un descuento aplicado: el motivo (uno de `RAZONES_DESCUENTO`), el
 *  texto de "otro" (solo si el motivo es ese) y el argumento escrito que pide la banda
 *  20-35% de un Líder (`necesitaArgumentoEscrito`). Viajan por línea, igual que
 *  `descuentoUnitario`: dos líneas con el mismo % pueden llevar motivos distintos si se
 *  aplicaron en dos acciones separadas del apartado. */
export type DetalleDescuento = { razon: string; razonOtro: string; argumento: string };

/** Lo que queda en una línea al quitarle el descuento: ni monto, ni motivo, ni argumento. */
export const SIN_DETALLE_DESCUENTO: DetalleDescuento = { razon: "", razonOtro: "", argumento: "" };

// ---- Descuento de campaña (paso 3 de ADR-0107, 2026-09-18) -------------------------
// Una prenda con una campaña vigente (Black Friday 20 %) se cobra con ese descuento sola.
// La regla completa —cuál campaña, qué fecha, qué se rechaza— vive en la base
// (`fn_campanas_por_variante` y `registrar_venta`, 20260918170000); acá se aplica lo que
// la base ya decidió (`campanas_vigentes()`) y se mantiene la regla «UN solo descuento por
// prenda: el mayor». La base verifica todo de nuevo al cobrar.

/** El motivo con que viaja el descuento de una campaña: uno más en `venta_items`. */
export const RAZON_CAMPANA = "campana";

/** La campaña que rige hoy para una prenda: la de mayor % (la elige la base). */
export type CampanaLinea = { etiquetaId: string; nombre: string; pct: number };

type LineaDescontable = {
  claveLinea: string;
  precioUnitario: number;
  descuentoUnitario: number;
  razonDescuento: string;
  razonDescuentoOtro: string;
  argumentoDescuento: string;
  campana?: CampanaLinea | null;
};

/** ¿El descuento que lleva esta línea es el de su campaña (no uno puesto a mano)? */
export function esDescuentoDeCampana(l: { descuentoUnitario: number; razonDescuento: string }): boolean {
  return l.descuentoUnitario > 0 && l.razonDescuento === RAZON_CAMPANA;
}

/** ¿Hay algún descuento puesto A MANO? Solo ese pide código a una colaboradora. */
export function hayDescuentoManual(carrito: readonly { descuentoUnitario: number; razonDescuento: string }[]): boolean {
  return carrito.some((l) => l.descuentoUnitario > 0 && l.razonDescuento !== RAZON_CAMPANA);
}

/** Deja la línea con el descuento de su campaña (o tal cual, si no tiene). */
export function conDescuentoDeCampana<L extends LineaDescontable>(l: L): L {
  if (!l.campana) return l;
  return {
    ...l,
    descuentoUnitario: descuentoUnitarioPorPorcentaje(l.precioUnitario, l.campana.pct),
    razonDescuento: RAZON_CAMPANA,
    razonDescuentoOtro: "",
    argumentoDescuento: "",
  };
}

/** Qué descuento por unidad queda en la línea si se le pide `montoNuevo`: el pedido, salvo
 *  que su campaña dé igual o más — entonces prevalece la campaña (un solo descuento, el
 *  mayor). El 0,01 es el redondeo: la base tampoco deja pasar un manual que no supere a la
 *  campaña por más de un centavo. */
export function descuentoResultante(l: LineaDescontable, montoNuevo: number): { monto: number; prevaleceCampana: boolean } {
  if (l.campana) {
    const deCampana = descuentoUnitarioPorPorcentaje(l.precioUnitario, l.campana.pct);
    if (redondear2(montoNuevo - deCampana) <= 0.01) return { monto: deCampana, prevaleceCampana: true };
  }
  return { monto: montoNuevo, prevaleceCampana: false };
}

/** Re-evalúa las campañas de un carrito contra las que rigen ahora: un ticket dejado en
 *  espera puede haber nacido antes (o después) de que una campaña empezara o terminara.
 *  El descuento manual MAYOR que la campaña se respeta; el de campaña se ajusta o se va. */
export function conCampanas<L extends LineaDescontable & { varianteId: string }>(carrito: L[], porVariante: ReadonlyMap<string, CampanaLinea>): L[] {
  return carrito.map((l) => {
    const campana = porVariante.get(l.varianteId) ?? null;
    if (!campana) {
      const limpia = { ...l, campana: null };
      return esDescuentoDeCampana(l)
        ? { ...limpia, descuentoUnitario: 0, razonDescuento: "", razonDescuentoOtro: "", argumentoDescuento: "" }
        : limpia;
    }
    const conCampana = { ...l, campana };
    const manualMayor =
      l.descuentoUnitario > 0 &&
      !esDescuentoDeCampana(l) &&
      redondear2(l.descuentoUnitario - descuentoUnitarioPorPorcentaje(l.precioUnitario, campana.pct)) > 0.01;
    return manualMayor ? conCampana : conDescuentoDeCampana(conCampana);
  });
}

function aplicarConMonto<L extends LineaDescontable>(carrito: L[], claves: string[], detalle: DetalleDescuento, montoPara: (l: L) => number): L[] {
  const alcanza = (l: L) => claves.length === 0 || claves.includes(l.claveLinea);
  return carrito.map((l) => {
    if (!alcanza(l)) return l;
    const { monto, prevaleceCampana } = descuentoResultante(l, montoPara(l));
    if (prevaleceCampana) return conDescuentoDeCampana(l);
    return {
      ...l,
      descuentoUnitario: monto,
      razonDescuento: detalle.razon,
      razonDescuentoOtro: detalle.razon === "otro" ? detalle.razonOtro : "",
      argumentoDescuento: detalle.argumento,
    };
  });
}

/** Devuelve un carrito nuevo con el % aplicado a las líneas de `claves` — o a todas si
 *  `claves` viene vacío ("todo el ticket"). Las que no entran quedan como estaban. Para
 *  quitar un descuento: `aplicarDescuento(carrito, 0, claves, SIN_DETALLE_DESCUENTO)`. */
export function aplicarDescuento<L extends LineaDescontable>(carrito: L[], porcentaje: number, claves: string[], detalle: DetalleDescuento): L[] {
  return aplicarConMonto(carrito, claves, detalle, (l) => descuentoUnitarioPorPorcentaje(l.precioUnitario, porcentaje));
}

/** Lo mismo que `aplicarDescuento`, pero con un monto en soles por unidad en vez de un %
 *  — la otra entrada del apartado «Descuento» (Xstore «Add Discount» admite las dos). */
export function aplicarDescuentoMonto<L extends LineaDescontable>(carrito: L[], montoUnitario: number, claves: string[], detalle: DetalleDescuento): L[] {
  return aplicarConMonto(carrito, claves, detalle, (l) => descuentoUnitarioPorMonto(l.precioUnitario, montoUnitario));
}

/** El % entero que se muestra en el chip de la línea, leído desde el monto guardado
 *  (el monto es la verdad; el % es solo cómo se lo contamos a la colaboradora). */
export function porcentajeDeLinea(l: { precioUnitario: number; descuentoUnitario: number }): number {
  if (l.precioUnitario <= 0 || l.descuentoUnitario <= 0) return 0;
  return Math.round((l.descuentoUnitario / l.precioUnitario) * 100);
}

/** Si el apartado tiene que pedir el argumento escrito: solo a un Líder, y solo pasado el
 *  20% (R-45). El candado real vive en `registrar_venta`; esto es progresividad de la
 *  pantalla, no una segunda copia de la regla — por eso no bloquea nada por sí solo. */
export function necesitaArgumentoEscrito(esLider: boolean, porcentaje: number): boolean {
  return esLider && porcentaje > 20;
}

