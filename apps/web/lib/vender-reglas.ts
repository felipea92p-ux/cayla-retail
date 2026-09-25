// Reglas puras del punto de venta — sin `createClient`, sin `next/headers`, cero
// dependencia de servidor. Mismo patrón que `comprobantes-reglas.ts`: lo que el
// componente cliente `PuntoDeVenta` necesita como VALOR vive en un archivo que
// ningún fetcher server-only pueda arrastrar al navegador.

import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { nombresCortos } from "./nombre-integrante";

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
 *  para el efectivo: lo que entregó, para calcular el vuelto. `monto` es lo que el medio
 *  CUBRE (lo que suma contra los ítems); `recibido` viaja aparte (ver `pagosParaRpc`) y
 *  nunca sustituye a `monto`, o `registrar_venta` rechazaría la venta por no cuadrar. */
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

/** Cambia el monto de un medio y, con DOS medios, el otro toma lo que falta para llegar al total:
 *  la cajera parte el cobro (Plin 40) y el efectivo se llena solo con los 40 restantes; después
 *  puede editar cualquiera y el otro se reajusta. Con uno o con tres o más medios solo cambia el
 *  editado: no hay un «otro» evidente a quién repartirle. Un campo vaciado o roto cuenta como 0.
 *  Lo escrito por encima del total deja al otro en 0 y `motivoBloqueoCobro` avisa que se pasa. */
export function pagosTrasEditarMonto(pagos: readonly PagoAplicado[], indice: number, monto: number, total: number): PagoAplicado[] {
  if (!pagos[indice]) return [...pagos];
  const limpio = Math.max(0, redondear2(monto || 0));
  const editados = pagos.map((p, i) => (i === indice ? { ...p, monto: limpio } : p));
  if (pagos.length !== 2) return editados;
  const otro = indice === 0 ? 1 : 0;
  return editados.map((p, i) => (i === otro ? { ...p, monto: Math.max(0, redondear2(total - limpio)) } : p));
}

/** Los pasos del cobro que la pantalla resalta: elegir el medio, anotar cuánto entregó la clienta
 *  (solo si hay efectivo) y, cubierto todo, el comprobante y confirmar. */
export type PasoCobro = "medio" | "recibido" | "comprobante";

/** Cuál es el siguiente paso, derivado de lo que ya está puesto: mientras los medios no cubran
 *  el total (o se pasen) falta el medio; con efectivo cubierto falta anotar lo recibido hasta que
 *  alcance; después toca el comprobante, que es opcional. Solo GUÍA: no bloquea nada (lo que
 *  impide cobrar sigue siendo `motivoBloqueoCobro`). */
export function pasoDelCobro(pagos: readonly PagoAplicado[], total: number): PasoCobro {
  if (pagos.length === 0 || restanteDePagos(total, pagos) !== 0) return "medio";
  const efectivo = pagos.find((p) => p.metodo === "efectivo" && p.monto > 0);
  if (efectivo && (efectivo.recibido === undefined || efectivo.recibido < efectivo.monto)) return "recibido";
  return "comprobante";
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
  /** Por qué el combo «Responsable» todavía no deja guardar (`ControlResponsable.motivo`, ADR-0161); `null`/ausente = ya
   *  hay responsable. Se pide antes que el pago: primero quién hace la venta, después la plata. */
  motivoResponsable?: string | null;
  /** Se cobra una proforma VENCIDA y aún no se confirmó que va al precio de entonces (ADR-0167). Ausente = no aplica. */
  proformaVencidaSinConfirmar?: boolean;
}): string | null {
  if (!v.cajaAbierta) return "Abre la caja para vender.";
  if (v.prendas === 0) return "Agrega una prenda para cobrar.";
  if (v.motivoResponsable) return v.motivoResponsable;
  if (v.momento !== "cobrar") return null;
  if (v.proformaVencidaSinConfirmar) return "Confirma que cobras la proforma vencida al precio de entonces.";
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
 *  texto de "otro" (solo si el motivo es ese) y el argumento escrito que pide todo
 *  descuento pasado el 15 % (`necesitaArgumentoEscrito`). Viajan por línea, igual que
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

/**
 * El descuento por unidad de una campaña, con el precio rebajado REDONDEADO HACIA ABAJO a .90 (Felipe, 2026-09-23,
 * ADR-0182): S/ 89.90 con 20 % da S/ 71.92 y se cobra S/ 71.90 → descuento S/ 18.00. Si el cálculo cae en 71.85, queda
 * 70.90: siempre el .90 más cercano por debajo, nunca por encima. Un precio rebajado de menos de S/ 0.90 no se redondea
 * (no existe un .90 por debajo) y 100 % regala la prenda.
 *
 * ES LA MISMA REGLA, AL CÉNTIMO, QUE `retail.fn_descuento_campana` (20260923174100): la caja la calcula y
 * `registrar_venta`/`separar_prendas` la verifican. Si divergen, la venta se rechaza en el mostrador. Por eso va en
 * enteros (diezmilésimas de céntimo): con coma flotante, un 71.8999… en vez de 71.90 bajaría el precio un sol entero.
 * Los % tienen como mucho 2 decimales (`parsearDescuento`).
 */
export function descuentoDeCampana(precio: number, pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  if (pct >= 100) return precio;
  const precioC = Math.round(precio * 100);
  // precio rebajado exacto, en diezmilésimas de céntimo: precio × (100 − pct) / 100, sin redondear. El % con 2
  // decimales, como `round(p_pct, 2)` en la base.
  const rebajado = precioC * (10_000 - Math.round(pct * 100));
  const UN_CENTIMO = 10_000;
  const finalC =
    rebajado >= 90 * UN_CENTIMO
      ? Math.floor((rebajado + 10 * UN_CENTIMO) / (100 * UN_CENTIMO)) * 100 - 10 // el X.90 más alto que no lo pasa
      : Math.round(rebajado / UN_CENTIMO);
  return (precioC - finalC) / 100;
}

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
    descuentoUnitario: descuentoDeCampana(l.precioUnitario, l.campana.pct),
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
    const deCampana = descuentoDeCampana(l.precioUnitario, l.campana.pct);
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
      redondear2(l.descuentoUnitario - descuentoDeCampana(l.precioUnitario, campana.pct)) > 0.01;
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

/** El % entero que se muestra en el chip de la línea, leído desde el monto guardado
 *  (el monto es la verdad; el % es solo cómo se lo contamos a la colaboradora). */
export function porcentajeDeLinea(l: { precioUnitario: number; descuentoUnitario: number }): number {
  if (l.precioUnitario <= 0 || l.descuentoUnitario <= 0) return 0;
  return Math.round((l.descuentoUnitario / l.precioUnitario) * 100);
}

/** Desde qué % un descuento manual pide argumento escrito. Felipe, 2026-09-25: a cualquiera
 *  que pase el 15 % (antes: solo a un Líder, pasado el 20 %). */
export const UMBRAL_ARGUMENTO_PCT = 15;

/** Si una línea pide el argumento escrito: su descuento por unidad pasa el 15 % del precio.
 *  Misma cuenta que `registrar_venta` (el 15 % redondeado al céntimo, con 1 céntimo de
 *  holgura) — así un 15 % justo que el redondeo deja en 15.003 % no lo pide en la pantalla
 *  y sí en la base, ni al revés. El candado real vive en la base; esto decide cuándo el
 *  apartado MUESTRA el campo. */
export function necesitaArgumentoEscrito(precioUnitario: number, descuentoUnitario: number): boolean {
  if (precioUnitario <= 0 || descuentoUnitario <= 0) return false;
  return redondear2(descuentoUnitario - redondear2((precioUnitario * UMBRAL_ARGUMENTO_PCT) / 100)) > 0.01;
}

/** Los campos del apartado «Descuento», en el orden en que se llenan de arriba abajo. */
export type PasoDescuento = "valor" | "motivo" | "motivoOtro" | "argumento" | "codigo" | "prendas" | "listo";

/** El primer campo que falta llenar del apartado «Descuento»: la pantalla lo ilumina y, al
 *  terminar uno, lleva el foco al siguiente. Solo GUÍA: lo que impide aplicar sigue siendo
 *  el motivo del botón y, al cobrar, `registrar_venta`. */
export function pasoDelDescuento(e: {
  valorValido: boolean;
  razon: string;
  razonOtro: string;
  pideArgumento: boolean;
  argumento: string;
  pideCodigo: boolean;
  codigo: string;
  prendas: number;
}): PasoDescuento {
  if (!e.valorValido) return "valor";
  if (e.razon === "") return "motivo";
  if (e.razon === "otro" && e.razonOtro.trim() === "") return "motivoOtro";
  if (e.pideArgumento && e.argumento.trim() === "") return "argumento";
  if (e.pideCodigo && e.codigo.trim() === "") return "codigo";
  if (e.prendas === 0) return "prendas";
  return "listo";
}

// ---- Quién atendió: el papel del ticket (ADR-0163 → ADR-0161) ------------------------------------------------------
// Quién atendió ya no es una fila de chips propia: es el RESPONSABLE de la venta, elegido en el combo del ADR-0161
// (`components/ComboResponsable.tsx`, reglas en `lib/responsable-reglas.ts`), y viaja a `registrar_venta` como
// `p_asesora_id`. Aquí queda solo cómo se nombra en el papel.

/** Una persona que se puede nombrar en el ticket (`PersonaDeTurno` calza con esta forma). */
export type Vendedora = { personaId: string; nombre: string };

/** El nombre que sale en el papel: el primer nombre, y la inicial del apellido solo si otra de la fila comparte
 *  primer nombre (`nombresCortos`, la misma regla de «Ventas de hoy»). `null` si no hay a quién nombrar. */
export function atendioCorto(vendedoras: readonly Vendedora[], id: string | null): string | null {
  const v = vendedoras.find((x) => x.personaId === id);
  return v ? (nombresCortos(vendedoras.map((x) => x.nombre)).get(v.nombre) ?? null) : null;
}

// ---- «Agotada» o «apartada para una clienta» ------------------------------------------------------------------------
// Una prenda con todo el piso apartado NO está agotada: sigue ahí, en el piso, y es de una clienta. Decirle «agotada» a
// la colaboradora que mira la bodega del piso es decirle que no ve lo que ve. Vender y Cambios comparten esta frase
// (cada pantalla la sigue escribiendo a su manera: «sin stock aquí», «no queda aquí»…).

/** Lo que la caja sabe de una prenda en ESTA sede. `stockAqui` es lo cobrable (piso disponible; en Taller, el total
 *  disponible) y `apartadoAqui` lo apartado en ese mismo lugar (`apartadoEnPiso`, `lib/vender-stock-local.ts`).
 *  Opcional: quien no lo trae dice «agotada» como siempre. */
export type SinStockAqui = { stockAqui: number; apartadoAqui?: number };

/** ¿Lo que impide vender la prenda aquí es que lo que queda en el PISO está apartado para una clienta? Solo cuenta lo
 *  apartado en el piso, que es de donde vende la caja (una venta nunca descuenta el almacén en silencio): una prenda
 *  con el piso en 0 y stock —apartado o no— en el almacén sigue siendo «agotada aquí». Y si además hay piso libre
 *  (`stockAqui > 0`) no hay nada que explicar. */
export function sinStockPorApartado(p: SinStockAqui): boolean {
  return p.stockAqui <= 0 && (p.apartadoAqui ?? 0) > 0;
}

/** La frase de una prenda que no se puede vender aquí: «apartada para una clienta» si el piso está apartado, y si no,
 *  `agotada` (el texto de siempre de cada pantalla). Se llama cuando `stockAqui <= 0`. La frase abre en mayúscula
 *  solo si `agotada` abre en mayúscula («Sin stock aquí» → «Apartada para una clienta»), para que la pantalla no tenga
 *  que cuidar el caso.
 *
 *  Piso apartado con stock libre en el almacén: dice «apartada». La palabra describe el piso —lo que la caja puede
 *  cobrar—, igual que «agotada» lo describe cuando el piso está en 0; lo que hay en el almacén no entra en esta cuenta
 *  (para venderlo hay que subirlo al piso primero) y decir «agotada» sería falso: la unidad está ahí, es de otra. */
export function textoSinStock(p: SinStockAqui, agotada = "agotada"): string {
  if (!sinStockPorApartado(p)) return agotada;
  const empiezaEnMayuscula = agotada.charAt(0) !== agotada.charAt(0).toLowerCase();
  return empiezaEnMayuscula ? "Apartada para una clienta" : "apartada para una clienta";
}

/** El aviso que sale al querer agregar al ticket una prenda sin nada libre en el piso (`PuntoDeVenta.agregar`). El
 *  título dice qué le pasa a la prenda; el detalle, qué hacer con ella. Una apartada NO está bloqueada del todo —la clienta
 *  que la apartó sí se la lleva—, solo no se vende desde la caja: por eso no dice «no se puede vender» a secas. */
export function avisoSinStockAqui(nombre: string, p: SinStockAqui, sede: string): { titulo: string; detalle: string } {
  return {
    titulo: `${nombre} está ${textoSinStock(p)}`,
    detalle: sinStockPorApartado(p) ? "No se vende desde aquí: es de la clienta que la apartó." : `No hay stock en ${sede}.`,
  };
}
