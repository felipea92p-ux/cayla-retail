/**
 * Lo del COBRO que viaja con un ticket cuando se deja en espera y se retoma (Felipe 2026-10-25, «varias ventas a la vez»,
 * pregunta 8). Hasta hoy la espera guardaba solo prendas, nota, nombre y clienta; quién atendió, la boleta o factura, el
 * documento escrito a mano, los pagos a medias y el cupón se perdían. Con varias clientas abiertas a la vez eso obligaba a
 * rehacer todo cada vez que la cajera cambiaba de ticket.
 *
 * Qué NO se guarda y por qué:
 *  · El formulario de descuento: es un borrador. El descuento YA aplicado vive dentro de cada línea (`descuentoUnitario`).
 *  · El cobro «en vuelo» (la venta mandada a la base): eso es del paso 3 del plan; aquí el ticket que se deja en espera
 *    nunca está cobrándose.
 *
 * Quién atendió se recuerda SOLO si la persona se eligió a propósito para ESE ticket. Nunca se hereda de la sesión ni de
 * la venta anterior (ADR-0161, A6 y modo «atencion»): un ticket nuevo viene con el combo vacío, y al retomar uno el combo
 * solo lo muestra elegido si esa persona sigue presente en la tienda (`responsableVigente`); si ya salió, vuelve vacío.
 *
 * El cupón es al portador y NO se reserva mientras el ticket espera: si otra caja lo gasta, la base lo rechaza al cobrar y
 * la pantalla ya sabe quitarlo y avisar (`rechazoDelCupon`). Es lo mismo que pasa hoy entre dos cajas.
 *
 * Lo guardado en el navegador se lee con tolerancia (`cobroDeTicketGuardado`): un ticket de una versión anterior no trae
 * nada de esto y vuelve con el cobro vacío; lo que no tiene la forma esperada se descarta, no rompe la caja.
 */
import { METODOS_PAGO_VENTA } from "@cayla-retail/shared";
import type { CuponPuesto } from "./club-puntos-reglas";
import { tipoDocumentoDe, type TipoDocumentoClienta } from "./documento-clienta-reglas";
import type { PagoAplicado } from "./vender-reglas";

export type ComprobanteDelTicket = "boleta" | "factura" | "nota_venta";

export type CobroDelTicket = {
  /** La persona que se eligió en «¿Quién está atendiendo?» para este ticket, o `null`. */
  responsableId: string | null;
  /** Boleta, factura o nota de venta; `null` mientras nadie lo eligió (se elige siempre, ver `motivoBloqueoCobro`). */
  comprobante: ComprobanteDelTicket | null;
  /** El documento del comprobante tal como estaba (puede ser el de su ficha o uno escrito a mano). */
  docTipo: TipoDocumentoClienta;
  docNumero: string;
  clienteNombre: string;
  /** El WhatsApp al que se mandará la boleta de ESTA venta. */
  celularBoleta: string;
  /** Una fila por medio, con lo que ya se había tecleado. Si el total cambió, el cobro sigue bloqueado hasta que cuadre. */
  pagos: PagoAplicado[];
  cupon: CuponPuesto | null;
};

/** El cobro de un ticket recién abierto. Una función y no una constante: `pagos` es una lista y dos tickets no la comparten. */
export function cobroVacio(): CobroDelTicket {
  return { responsableId: null, comprobante: null, docTipo: "dni", docNumero: "", clienteNombre: "", celularBoleta: "", pagos: [], cupon: null };
}

const COMPROBANTES: readonly ComprobanteDelTicket[] = ["boleta", "factura", "nota_venta"];

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const esMonto = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

function pagoGuardado(valor: unknown): PagoAplicado | null {
  if (!valor || typeof valor !== "object") return null;
  const p = valor as Record<string, unknown>;
  const metodo = METODOS_PAGO_VENTA.find((m) => m === p.metodo);
  const monto = p.monto;
  if (!metodo || !esMonto(monto)) return null;
  const recibido = p.recibido;
  const referencia = texto(p.referencia);
  const cuentaId = texto(p.cuentaId);
  return {
    metodo,
    monto,
    ...(p.fijo === true ? { fijo: true } : {}),
    ...(esMonto(recibido) ? { recibido } : {}),
    ...(referencia ? { referencia } : {}),
    ...(cuentaId ? { cuentaId } : {}),
  };
}

function cuponGuardado(valor: unknown): CuponPuesto | null {
  if (!valor || typeof valor !== "object") return null;
  const c = valor as Record<string, unknown>;
  const codigo = texto(c.codigo);
  const venceEl = texto(c.venceEl);
  const origen = c.origen === "puntos" || c.origen === "codigo" ? c.origen : null;
  const { valor: monto, compraMinima } = c;
  if (!codigo || !venceEl || !origen || !esMonto(monto) || !esMonto(compraMinima)) return null;
  return { codigo, valor: monto, compraMinima, venceEl, origen, de: texto(c.de) || null };
}

/**
 * El cobro de un ticket en espera tal como vuelve de `localStorage`. Siempre devuelve algo usable: `undefined` (un ticket
 * de antes de esto), un texto o un objeto a medias dan el cobro vacío o la parte que sí se entiende.
 */
export function cobroDeTicketGuardado(valor: unknown): CobroDelTicket {
  const vacio = cobroVacio();
  if (!valor || typeof valor !== "object") return vacio;
  const c = valor as Record<string, unknown>;
  return {
    responsableId: texto(c.responsableId).trim() || null,
    comprobante: COMPROBANTES.find((t) => t === c.comprobante) ?? null,
    docTipo: tipoDocumentoDe(texto(c.docTipo)),
    docNumero: texto(c.docNumero),
    clienteNombre: texto(c.clienteNombre),
    celularBoleta: texto(c.celularBoleta),
    pagos: Array.isArray(c.pagos) ? c.pagos.flatMap((p) => pagoGuardado(p) ?? []) : [],
    cupon: cuponGuardado(c.cupon),
  };
}
