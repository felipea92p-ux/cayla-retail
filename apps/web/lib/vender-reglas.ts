// Reglas puras del punto de venta — sin `createClient`, sin `next/headers`, cero
// dependencia de servidor. Mismo patrón que `comprobantes-reglas.ts`: lo que el
// componente cliente `PuntoDeVenta` necesita como VALOR vive en un archivo que
// ningún fetcher server-only pueda arrastrar al navegador.

import { METODOS_PAGO, type MetodoPagoVenta } from "@cayla-retail/shared";
import { nombresCortos } from "./nombre-integrante";
import { efectivoACobrar, redondeoDelEfectivo, UNIDAD_EFECTIVO } from "./redondeo-efectivo-reglas";
import { motivoNoCobrable } from "./vender-stock-local";

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
export type PagoAplicado = {
  metodo: MetodoPagoVenta;
  monto: number;
  /** La cajera escribió este monto a mano (hoja de cobro, 2026-10-02). Con tres o más medios, el primero que NO lo tiene
   *  se queda con «el resto» (`pagosTrasEditarMonto`). Solo de pantalla: no viaja a la venta. */
  fijo?: boolean;
  recibido?: number;
  /** El nº de operación de Yape, Plin o transferencia (opcional, ADR-0230): con él, Ventas ▸ Historial encuentra la venta
   *  aunque la clienta haya perdido la boleta y solo tenga la captura del pago. */
  referencia?: string;
};

/** Los medios que dan un nº de operación que la clienta ve en su celular. */
export const METODOS_CON_OPERACION: readonly MetodoPagoVenta[] = ["yape", "plin", "transferencia"];

/** El nº de operación tal como se guarda: sin espacios, solo letras y dígitos, hasta 40. Vacío = no se anotó. */
export function limpiarOperacion(texto: string): string {
  return texto.replace(/[^0-9a-z]/gi, "").slice(0, 40);
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que falta cubrir del total con los pagos puestos, a 2 decimales. Negativo si se
 *  pasan — `registrar_venta` exige que sumen igual que los ítems al centavo. */
export function restanteDePagos(total: number, pagos: readonly PagoAplicado[]): number {
  return redondear2(total - pagos.reduce((acc, p) => acc + p.monto, 0));
}

/** Atajos F1–F6 de la caja: cada tecla es un medio de pago, en el MISMO orden en que la hoja de cobro
 *  los muestra (`medios`; por defecto los cinco de siempre: F1 efectivo, F2 tarjeta, F3 yape, F4 plin, F5
 *  transferencia; con el QR disponible, F3 es QR y los demás se corren). `null` si la tecla
 *  no es un atajo. Con cualquier modificador (Ctrl+F5 = recarga forzada, Alt+F4 = cerrar…) o con la
 *  tecla mantenida (`repeat`) NO cuenta: un atajo del navegador o del sistema no se le quita a
 *  nadie, y mantener F2 no puede prender y apagar el medio veinte veces por segundo. */
export function metodoDeAtajo(
  t: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean; repeat?: boolean },
  medios: readonly MetodoPagoVenta[] = METODOS_PAGO,
): MetodoPagoVenta | null {
  if (t.ctrlKey || t.altKey || t.metaKey || t.shiftKey || t.repeat) return null;
  const m = /^F([1-9])$/.exec(t.key);
  return m ? (medios[Number(m[1]) - 1] ?? null) : null;
}

/** Los montos que la hoja de cobro ofrece para «¿Con cuánto paga?» además del exacto (patrón Square/Shopify POS): los
 *  billetes con que suele pagarse un monto, de menor a mayor y siempre por encima de él. S/59.90 → 60, 70, 100, 200;
 *  S/223.90 → 230, 240, 250, 300. Un toque deja anotado lo recibido y el vuelto sale solo. Hasta cuatro. */
export function montosSugeridos(monto: number): number[] {
  if (!Number.isFinite(monto) || monto <= 0) return [];
  const arriba = (paso: number) => Math.ceil(monto / paso) * paso;
  const candidatos = [arriba(10), arriba(10) + 10, arriba(20), arriba(50), arriba(100), arriba(200), arriba(100) + 100];
  return [...new Set(candidatos)].filter((v) => v > monto + 0.001).sort((a, b) => a - b).slice(0, 4);
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
export function vueltoDe(pago: PagoAplicado, redondear = false): number {
  if (pago.metodo !== "efectivo" || pago.recibido === undefined) return 0;
  // Con el redondeo del efectivo (ADR-0311) lo que se cobra son las monedas: el vuelto sale de eso, no de la deuda exacta.
  const cobra = redondear ? efectivoACobrar(pago.monto) : pago.monto;
  return Math.max(0, redondear2(pago.recibido - cobra));
}

/** Lo que dice la hoja de cobro bajo los billetes frente a lo que se cobra en efectivo (Felipe 2026-10-05): **vuelto** si lo recibido pasa,
 *  **falta** si no llega y **exacto** si es justo; `null` mientras no se haya dicho cuánto paga (la línea queda invisible, reservando su
 *  alto). `monto` es la cifra que se muestra: el vuelto, lo que falta o el cobro exacto. La hoja pinta **exacto en verde** y **falta en
 *  rojo**; el vuelto queda neutro (es información, no un aviso). `vuelto` es el de `vueltoDe` con el mismo redondeo que `aCobrar`. */
export type LecturaDelRecibido = { estado: "vuelto" | "falta" | "exacto"; monto: number };
export function lecturaDelRecibido(recibido: number | undefined, aCobrar: number, vuelto: number): LecturaDelRecibido | null {
  if (recibido === undefined) return null;
  if (vuelto > 0) return { estado: "vuelto", monto: vuelto };
  if (recibido < aCobrar) return { estado: "falta", monto: redondear2(aCobrar - recibido) };
  return { estado: "exacto", monto: aCobrar };
}

/** Cambia el monto de un medio y reparte «el resto»:
 *  · con DOS medios, el otro toma lo que falta para llegar al total: la cajera parte el cobro (Plin 40) y el efectivo se
 *    llena solo con los 40 restantes; después puede editar cualquiera y el otro se reajusta;
 *  · con TRES o más (hoja de cobro, 2026-10-02), el primer medio que la cajera no escribió a mano (`fijo`) se queda con
 *    lo que falta; si ya los escribió todos, solo cambia el editado;
 *  · con uno, solo cambia el editado.
 *  Un campo vaciado o roto cuenta como 0. Lo escrito por encima del total deja al resto en 0 y `motivoBloqueoCobro`
 *  avisa que se pasa. */
export function pagosTrasEditarMonto(pagos: readonly PagoAplicado[], indice: number, monto: number, total: number): PagoAplicado[] {
  if (!pagos[indice]) return [...pagos];
  const limpio = Math.max(0, redondear2(monto || 0));
  const editados = pagos.map((p, i) => (i === indice ? { ...p, monto: limpio, fijo: true } : p));
  const resto = (otro: number) => {
    const ajenos = editados.reduce((acc, p, i) => (i === otro ? acc : acc + p.monto), 0);
    return editados.map((p, i) => (i === otro ? { ...p, monto: Math.max(0, redondear2(total - ajenos)) } : p));
  };
  if (pagos.length === 2) return resto(indice === 0 ? 1 : 0);
  if (pagos.length < 2) return editados;
  const libre = editados.findIndex((p, i) => i !== indice && !p.fijo);
  return libre === -1 ? editados : resto(libre);
}

/** Los pasos del cobro que la pantalla resalta: elegir el medio, anotar cuánto entregó la clienta
 *  (solo si hay efectivo) y, cubierto todo, el comprobante y confirmar. */
export type PasoCobro = "medio" | "recibido" | "comprobante";

/** Cuál es el siguiente paso, derivado de lo que ya está puesto: mientras los medios no cubran
 *  el total (o se pasen) falta el medio; con efectivo cubierto falta anotar lo recibido hasta que
 *  alcance; después toca el comprobante, que es opcional. Solo GUÍA: no bloquea nada (lo que
 *  impide cobrar sigue siendo `motivoBloqueoCobro`). */
export function pasoDelCobro(pagos: readonly PagoAplicado[], total: number, redondear = false): PasoCobro {
  if (pagos.length === 0 || restanteDePagos(total, pagos) !== 0) return "medio";
  const efectivo = pagos.find((p) => p.metodo === "efectivo" && p.monto > 0);
  // Con el redondeo del efectivo (ADR-0311) alcanza con lo que se cobra en monedas.
  const cobra = efectivo ? (redondear ? efectivoACobrar(efectivo.monto) : efectivo.monto) : 0;
  if (efectivo && (efectivo.recibido === undefined || efectivo.recibido < cobra)) return "recibido";
  return "comprobante";
}

/** Los pagos como viajan a `registrar_venta`. Solo montos > 0 (`venta_pagos` lo exige). El
 *  `recibido` va únicamente en efectivo y solo si cubre lo que corresponde: la base lo
 *  guarda para reimprimir el vuelto y su candado (`venta_pagos_recibido_coherente`) rechaza
 *  TODA la venta si `recibido < monto`, así que una cifra a medio escribir no puede viajar. */
export type PagoParaRpc = { metodo: MetodoPagoVenta | "redondeo"; monto: number; recibido?: number; referencia?: string };

export function pagosParaRpc(pagos: readonly PagoAplicado[], redondear = false): PagoParaRpc[] {
  // Con el redondeo del efectivo (ADR-0311) viaja el efectivo YA cobrado en monedas y, aparte, la fila de redondeo: la suma de todo
  // sigue igualando los ítems y la base verifica que el redondeo sea el de la ley.
  const { pagos: cobrados, redondeo } = pagosCobrados(pagos, redondear);
  const filas = cobrados
    .filter((p) => p.monto > 0)
    .map(({ metodo, monto, recibido, referencia }): PagoParaRpc => {
      if (metodo === "efectivo") return recibido !== undefined && recibido >= monto ? { metodo, monto, recibido } : { metodo, monto };
      // El nº de operación viaja solo si se anotó. Una base que todavía no tiene `venta_pagos.referencia` lo ignora (lee
      // el pago clave por clave): la venta se registra igual.
      const operacion = METODOS_CON_OPERACION.includes(metodo) ? limpiarOperacion(referencia ?? "") : "";
      return operacion ? { metodo, monto, referencia: operacion } : { metodo, monto };
    });
  return redondeo > 0 ? [...filas, { metodo: "redondeo", monto: redondeo }] : filas;
}

/** Los pagos de pantalla —exactos: cubren el total al céntimo— como se COBRAN. Con el redondeo del efectivo activo (ADR-0311) el
 *  efectivo se cobra al múltiplo de S/ 0.10, hacia abajo, y lo que no se cobra es el `redondeo` (de 0.00 a 0.09). Sin él (la base
 *  todavía no lo acepta, o no hay efectivo) los pagos quedan como están. La pantalla sigue trabajando con los pagos exactos
 *  (`restanteDePagos`, `pagosTrasEditarMonto`…): el redondeo es del borde, no del estado que la cajera edita. */
export function pagosCobrados(pagos: readonly PagoAplicado[], activo: boolean): { pagos: PagoAplicado[]; redondeo: number } {
  if (!activo) return { pagos: [...pagos], redondeo: 0 };
  let redondeo = 0;
  const cobrados = pagos.map((p) => {
    if (p.metodo !== "efectivo" || p.monto <= 0) return p;
    redondeo = redondear2(redondeo + redondeoDelEfectivo(p.monto));
    return { ...p, monto: efectivoACobrar(p.monto) };
  });
  return { pagos: cobrados, redondeo };
}

/** El cobro en efectivo con el redondeo de la ley, para decírselo a la cajera: la deuda exacta, lo que cobra en monedas y lo que no
 *  se cobra. `null` si no hay efectivo. Sin el redondeo activo, se cobra la deuda tal cual. */
export function cobroEnEfectivo(pagos: readonly PagoAplicado[], activo: boolean): { deuda: number; aCobrar: number; redondeo: number } | null {
  const efectivo = pagos.find((p) => p.metodo === "efectivo");
  if (!efectivo) return null;
  return activo
    ? { deuda: efectivo.monto, aCobrar: efectivoACobrar(efectivo.monto), redondeo: redondeoDelEfectivo(efectivo.monto) }
    : { deuda: efectivo.monto, aCobrar: efectivo.monto, redondeo: 0 };
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
  /** Qué está mal del carné o del pasaporte de la boleta (`problemaDocumentoComprobante`, ADR-0288 D-3); `null`/ausente = nada.
   *  La base rechaza uno fuera de formato y, con él, la venta entera: mejor no dejar cobrar hasta corregirlo. */
  problemaDocumento?: string | null;
  /** Por qué el combo «Responsable» todavía no deja guardar (`ControlResponsable.motivo`, ADR-0161); `null`/ausente = ya
   *  hay responsable. Se pide antes que el pago: primero quién hace la venta, después la plata. */
  motivoResponsable?: string | null;
  /** Se cobra una proforma VENCIDA y aún no se confirmó que va al precio de entonces (ADR-0167). Ausente = no aplica. */
  proformaVencidaSinConfirmar?: boolean;
  /** Todavía no se eligió boleta, factura ni nota de venta: desde la hoja de cobro ninguno viene marcado (Felipe,
   *  2026-10-02), para que siempre se elija. Ausente = ya hay uno. */
  sinComprobante?: boolean;
  /** El redondeo del efectivo está activo (`fn_acepta_redondeo_efectivo`, ADR-0311): un efectivo menor de S/ 0.10 no se puede entregar. */
  redondeoEfectivo?: boolean;
}): string | null {
  if (!v.cajaAbierta) return "Abre la caja para vender.";
  if (v.prendas === 0) return "Agrega una prenda para cobrar.";
  if (v.motivoResponsable) return v.motivoResponsable;
  if (v.momento !== "cobrar") return null;
  if (v.proformaVencidaSinConfirmar) return "Confirma que cobras la proforma vencida al precio de entonces.";
  if (v.pagos.length === 0) return "Elige cómo pagó el cliente.";
  const restante = restanteDePagos(v.total, v.pagos);
  if (restante > 0) return `Falta cubrir S/${restante.toFixed(2)}.`;
  if (restante < 0) return "Los pagos superan el total.";
  // Con el redondeo, un efectivo de menos de S/ 0.10 (p. ej. los 0.07 que sobran tras un Yape) no se puede entregar: no hay moneda. Se
  // cobra con otro medio; regalar el monto de otro medio no es redondear.
  const efectivo = v.redondeoEfectivo ? v.pagos.find((p) => p.metodo === "efectivo" && p.monto > 0) : undefined;
  if (efectivo && efectivoACobrar(efectivo.monto) <= 0) return `El efectivo no puede ser menos de S/ ${UNIDAD_EFECTIVO.toFixed(2)}: cóbralo con otro medio.`;
  if (v.sinComprobante) return "Elige el comprobante.";
  if (v.facturaSinRuc) return "La factura necesita el RUC de la empresa.";
  if (v.problemaDocumento) return v.problemaDocumento;
  return null;
}

// ---- Descuento manual (decidido con Felipe el 2026-09-14) -------------------------
// El precio lo fija el catálogo y ya no se edita en la caja; lo que se decide en el
// mostrador es un descuento. Viaja como `descuento_unitario` por línea — la columna que
// `venta_items` ya tiene (≥ 0, ≤ precio, subtotal generado) y que `registrar_venta`
// recibe — así queda medido por prenda en vez de disfrazado de "precio más bajo".

/** Un % convertido a monto por unidad: la cuenta EXACTA `precio × % / 100`, llevada al céntimo más cercano (el medio
 *  céntimo, hacia arriba: lo mismo que `round(x, 2)` de Postgres). Es la única cuenta de «un % se vuelve soles» de la
 *  caja: la usan el descuento manual en % y el de campaña (`descuentoDeCampana`, ADR-0302). Fuera de 0..100 se recorta:
 *  0 (o inválido) no descuenta; 100 regala la prenda, nunca más — el candado `venta_items_descuento_no_supera_precio`
 *  lo rechazaría igual.
 *
 *  Va en enteros (céntimos × diezmilésimas de %), no en coma flotante: así S/ 19.90 con 25 % (4.975) daba 4.97 en vez de
 *  4.98, y se equivocaba en 1 de cada ~550 combinaciones de precio y % (medido el 2026-10-01). El % se toma con hasta 4
 *  decimales; el de una campaña tiene 2 (`etiquetas.descuento_pct` es numeric(5,2)). */
export function descuentoUnitarioPorPorcentaje(precioUnitario: number, porcentaje: number): number {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  if (porcentaje >= 100) return precioUnitario;
  const precioC = Math.round(precioUnitario * 100);
  const pct4 = Math.round(porcentaje * 10_000); // 33.33 % → 333 300
  // precioC × pct4 / 1 000 000 es el descuento exacto en céntimos; sumar medio millón antes de truncar lo lleva al
  // céntimo más cercano. Cabe de sobra en un entero de JS: S/ 99 999.99 × 100 % = 10^13 < 2^53.
  return Math.floor((precioC * pct4 + 500_000) / 1_000_000) / 100;
}

// ---- Motivo y argumento del descuento (R-45 / D-44, cerrado el 2026-09-15) ---------
// Un texto libre no se puede sumar; una lista sí, y a fin de mes se ve cuánto margen se
// fue por cada motivo (R-45, punto 2). El candado de verdad vive en `registrar_venta`
// (`20260915140000_descuento_motivo_y_escalonado.sql`) — esto es la MISMA regla en el
// navegador, para que el apartado sepa qué pedir antes de que la Encargada intente cobrar.

/** Los cinco motivos que `registrar_venta` acepta — la base manda; agregar uno acá sin
 *  agregarlo también en la migración deja a la venta rechazándose con el error genérico. */
export const RAZONES_DESCUENTO = [
  { valor: "cumpleanos_clienta_top", etiqueta: "Cumpleaños cliente top" },
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
 * El descuento por unidad de una campaña: EXACTO, el % de la campaña sobre el precio, al céntimo (Felipe, 2026-10-01,
 * ADR-0302). S/ 39.00 con 20 % descuenta S/ 7.80 y se cobra S/ 31.20: lo que dice el papel («−20 %») es lo que se cobra.
 * Reemplaza el redondeo del precio hacia abajo a .90 de ADR-0182, que descontaba hasta casi un sol de más.
 *
 * ES LA MISMA CUENTA, AL CÉNTIMO, QUE `retail.fn_descuento_campana` (20261001161912): la caja la calcula y
 * `registrar_venta`, `separar_prendas` y `editar_separacion` la verifican. Si divergen, la venta se rechaza en el
 * mostrador.
 */
export function descuentoDeCampana(precio: number, pct: number): number {
  return descuentoUnitarioPorPorcentaje(precio, pct);
}

/** Lo que se cobra por unas líneas: Σ cantidad × (precio − descuento), sumado en céntimos exactos (como `ticketConCumple`).
 *  Es el ÚNICO total de un ticket en la web: caja, apartados, ventas en espera y la cola sin conexión. En coma flotante,
 *  99.90 − 14.99 da 84.91000000000001: «armar» mostraba ese número y Apartar no aceptaba S/ 84.91 recibidos en efectivo
 *  contra ese total. Con el descuento de campaña exacto (ADR-0302) esos céntimos dejaron de ser raros. */
export function totalDeLineas(lineas: readonly { cantidad: number; precioUnitario: number; descuentoUnitario: number }[]): number {
  return lineas.reduce((c, l) => c + l.cantidad * (Math.round(l.precioUnitario * 100) - Math.round(l.descuentoUnitario * 100)), 0) / 100;
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

/** ¿Hay algún descuento puesto A MANO? Solo ese se puede quitar desde el ticket. */
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
export type PasoDescuento = "valor" | "motivo" | "motivoOtro" | "argumento" | "prendas" | "listo";

/** El primer campo que falta llenar del apartado «Descuento»: la pantalla lo ilumina y, al
 *  terminar uno, lleva el foco al siguiente. Solo GUÍA: lo que impide aplicar sigue siendo
 *  el motivo del botón y, al cobrar, `registrar_venta`. */
export function pasoDelDescuento(e: {
  valorValido: boolean;
  razon: string;
  razonOtro: string;
  pideArgumento: boolean;
  argumento: string;
  prendas: number;
}): PasoDescuento {
  if (!e.valorValido) return "valor";
  if (e.razon === "") return "motivo";
  if (e.razon === "otro" && e.razonOtro.trim() === "") return "motivoOtro";
  if (e.pideArgumento && e.argumento.trim() === "") return "argumento";
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

// ---- «Agotada» o «apartada para un cliente» ------------------------------------------------------------------------
// Una prenda con todo el piso apartado NO está agotada: sigue ahí, en el piso, y es de una clienta. Decirle «agotada» a
// la colaboradora que mira la bodega del piso es decirle que no ve lo que ve. La regla vive en UN solo lugar,
// `motivoNoCobrable` (`lib/vender-stock-local.ts`, D-40): cobrable > «está en el almacén» > «apartada» > «agotada». Vender
// la usa entera (con el almacén); Cambios, que no ofrece lo del almacén, le pasa solo el piso y lo apartado y le basta
// esta frase (cada pantalla la sigue escribiendo a su manera: «sin stock aquí», «no queda aquí»…).

/** Lo que la caja sabe de una prenda en ESTA sede. `stockAqui` es lo cobrable (piso disponible; en Taller, el total
 *  disponible), `apartadoAqui` lo apartado en ese mismo lugar (`apartadoEnPiso`) y `almacenAqui` lo libre en el almacén
 *  (solo Vender lo trae). Opcionales: quien no los trae dice «agotada» como siempre. */
export type SinStockAqui = { stockAqui: number; apartadoAqui?: number | null; almacenAqui?: number | null };

/** ¿Lo que impide vender la prenda aquí es que lo que queda en el PISO está apartado para una clienta? Es
 *  `motivoNoCobrable(...) === "apartada"`: solo cuenta lo apartado en el piso, que es de donde vende la caja (una venta
 *  nunca descuenta el almacén en silencio), y si hay piso libre no hay nada que explicar. Con stock libre en el almacén
 *  gana «está en el almacén» —ahí HAY un camino de venta— y esto da `false`. */
export function sinStockPorApartado(p: SinStockAqui): boolean {
  return motivoNoCobrable(p) === "apartada";
}

/** La frase de una prenda que no se puede vender aquí: «apartada para un cliente» si lo único que queda en el piso es
 *  de otra clienta, y si no, `agotada` (el texto de siempre de cada pantalla). Se llama cuando `stockAqui <= 0`. La
 *  frase abre en mayúscula solo si `agotada` abre en mayúscula («Sin stock aquí» → «Apartada para un cliente»), para
 *  que la pantalla no tenga que cuidar el caso.
 *
 *  La palabra describe el piso —lo que la caja puede cobrar—, igual que «agotada» lo describe cuando el piso está en 0;
 *  decir «agotada» sería falso: la unidad está ahí, es de otra. En Vender, si además hay stock libre en el almacén, esta
 *  frase ni se llega a usar: `motivoNoCobrable` dice «en_almacen». */
export function textoSinStock(p: SinStockAqui, agotada = "agotada"): string {
  if (!sinStockPorApartado(p)) return agotada;
  const empiezaEnMayuscula = agotada.charAt(0) !== agotada.charAt(0).toLowerCase();
  return empiezaEnMayuscula ? "Apartada para un cliente" : "apartada para un cliente";
}
