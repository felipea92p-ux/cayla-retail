import type { EstadoComprobante, TipoComprobante } from "./comprobantes-reglas";
import { anulacionEnTramite } from "./facturacion-actividad";

// ¿Se puede pedir la baja de este comprobante a SUNAT? Lo pregunta `/api/lucode/anular` ANTES de llamar a Lucode, porque
// lo que llega a SUNAT no se deshace: si la base rechazara recién al guardar (`anular_comprobante`), la baja quedaría
// pedida ante SUNAT y el ERP seguiría mostrando el comprobante como válido. Por eso repite, con los mismos criterios,
// lo que esa función exige (el módulo Facturación —antes, solo el líder: ADR-0534—, aceptado, sin nota vigente) y lo que la pantalla ya muestra (una baja en trámite
// solo se consulta: `accionesDelComprobante`). La base sigue siendo la que decide al guardar; esto evita que llegue a
// SUNAT un pedido que la base después no va a registrar.

export type DatosParaPedirBaja = {
  /** Quien pide la baja ve el módulo Facturación (`fn_ve_modulo('facturacion')`; un líder lo ve siempre). */
  veFacturacion: boolean;
  estado: EstadoComprobante;
  anulacion_solicitada_at: string | null;
  /** Notas de crédito o débito del comprobante que no están anuladas (el criterio de `anular_comprobante`). */
  notasVigentes: number;
};

export type RechazoDeBaja = { status: 403 | 409; error: string };

/** `null` si se puede pedir la baja; si no, la respuesta que da la ruta, sin haber llamado a Lucode. */
export function motivoParaNoPedirBaja(d: DatosParaPedirBaja): RechazoDeBaja | null {
  if (!d.veFacturacion) {
    return { status: 403, error: "Anular un comprobante necesita el módulo Facturación en tu rol: la baja ante SUNAT no se deshace." };
  }
  if (d.estado !== "aceptado") {
    return { status: 409, error: `Solo se anula un comprobante aceptado por SUNAT (este está "${d.estado}").` };
  }
  if (anulacionEnTramite(d)) {
    return { status: 409, error: "La baja de este comprobante ya se pidió y está en trámite: consulta su estado en vez de pedirla otra vez." };
  }
  if (d.notasVigentes > 0) {
    return { status: 409, error: "Este comprobante tiene una nota de crédito o débito vigente: resuélvela antes de anularlo." };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La baja anula la venta en el mismo acto (ADR-0016, act. 2026-10-14; Felipe, auditoría del ERP). Antes, «Anular comprobante» daba de
// baja la boleta ante SUNAT y la venta seguía completada: 3 ventas sin comprobante vivo en dos semanas, dos cobradas otra vez. Ahora la
// ruta revisa ANTES de llamar a Lucode todo lo que `anular_venta` va a exigir, y si la venta no se puede anular, la baja no se pide.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Solo una boleta o una factura documentan una venta; una nota corrige otro comprobante y la nota de venta nunca va a SUNAT. */
export function laBajaAnulaLaVenta(tipo: TipoComprobante, ventaId: string | null | undefined): boolean {
  return (tipo === "boleta" || tipo === "factura") && !!ventaId;
}

/** La venta que el comprobante documenta, tal como la lee la ruta antes de pedir la baja. */
export type VentaDelComprobante = {
  estado: string;
  /** El estado de la caja de la venta; `null` si la venta no tiene caja. */
  cajaEstado: string | null;
  /** Día de Lima (`aaaa-mm-dd`) en que se vendió, y el de hoy: `anular_venta` solo anula el mismo día (PL-29). */
  diaVenta: string;
  hoy: string;
  tieneCambioODevolucion: boolean;
  /** `fn_ve_modulo('devoluciones')` de la cuenta: lo exige `anular_venta`. */
  veDevoluciones: boolean;
};

const A_DEVOLUCION = "usa Devolución: sale con su nota de crédito y la prenda vuelve al stock.";

/**
 * `null` si la venta se puede anular junto con la baja (o ya está anulada: la baja va sola). Si no, la respuesta de la ruta, SIN haber
 * llamado a Lucode: repite las guardas de `anular_venta` (caja abierta, mismo día, sin cambio ni devolución, módulo Devoluciones), porque
 * lo que llega a SUNAT no se deshace y una baja pedida con la venta sin anular es justo el estado que esto cierra.
 */
export function motivoParaNoAnularLaVenta(v: VentaDelComprobante): RechazoDeBaja | null {
  if (v.estado === "anulada") return null;
  if (!v.veDevoluciones) {
    return { status: 403, error: "Dar de baja este comprobante anula su venta, y anular una venta necesita el módulo Devoluciones." };
  }
  if (v.cajaEstado !== "abierta") {
    return { status: 409, error: `La caja de esta venta ya cerró, así que la venta no se puede anular y el comprobante no se da de baja: ${A_DEVOLUCION}` };
  }
  if (v.diaVenta !== v.hoy) {
    return { status: 409, error: `Esta venta es de otro día y solo se anula el mismo día, así que el comprobante no se da de baja: ${A_DEVOLUCION}` };
  }
  if (v.tieneCambioODevolucion) {
    return { status: 409, error: "Esta venta ya tiene un cambio o una devolución: resuelve sus prendas por separado en vez de dar de baja el comprobante." };
  }
  return null;
}

/** El motivo con que queda anulada la venta: dice qué comprobante se dio de baja y por qué (queda en `ventas.motivo_anulacion`). */
export function motivoDeAnulacionDeVenta(serie: string, numero: number, motivo: string): string {
  return `Comprobante ${serie}-${String(numero).padStart(6, "0")} dado de baja: ${motivo.trim()}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Chaos del PR #1094 (2026-10-27): el motivo de la baja no tenía tope (5000 letras se guardaban completas en el comprobante y en la
// venta y viajaban a Lucode) y el aviso de «la baja quedó guardada pero la venta no se anuló» mandaba a Historial, que con la caja
// cerrada también la rechaza. Esto es solo texto y largo; la ventana real (la caja que cierra mientras Lucode responde) es de la base.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que cabe en el motivo de la baja. Es el mismo tope de las demás notas libres del ERP (`cuadrar_piso`: 300). */
export const MAX_MOTIVO_BAJA = 300;

/** `null` si el motivo sirve; si no, el aviso que ve quien anula (la ruta lo devuelve como 400, antes de llamar a Lucode). */
export function motivoDeBajaInvalido(motivo: string): string | null {
  const limpio = motivo.trim();
  if (limpio.length < 3) return "La anulación necesita un motivo — queda registrado en el comprobante.";
  if (limpio.length > MAX_MOTIVO_BAJA) return `El motivo admite hasta ${MAX_MOTIVO_BAJA} letras (llevas ${limpio.length}).`;
  return null;
}

/**
 * El aviso cuando la baja ya se pidió a SUNAT y quedó guardada, pero `anular_venta` no pudo anular la venta. Nunca se pide la baja otra
 * vez. Si la causa es que la venta YA estaba anulada (una segunda petición llegó antes), no es una falla: se dice así.
 */
export function mensajeBajaSinAnularLaVenta(estadoSunat: string, causa: string): string {
  const ya = /ya est[aá] anulada/i.test(causa);
  if (ya) {
    return `La baja se pidió a SUNAT (${estadoSunat}) y la venta ya estaba anulada: otra petición llegó antes. Revisa el estado del comprobante en la fila; no vuelvas a pedir la baja.`;
  }
  return `La baja se pidió a SUNAT (${estadoSunat}) y quedó guardada, pero la venta no se pudo anular: ${causa}. Si la caja ya cerró, la salida es una Devolución de esa venta; si no, avisa a quien administra el sistema o a quien ve Devoluciones. No vuelvas a pedir la baja.`;
}
