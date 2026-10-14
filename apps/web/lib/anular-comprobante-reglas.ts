import type { EstadoComprobante, TipoComprobante } from "./comprobantes-reglas";
import { anulacionEnTramite } from "./facturacion-actividad";

// ¿Se puede pedir la baja de este comprobante a SUNAT? Lo pregunta `/api/lucode/anular` ANTES de llamar a Lucode, porque
// lo que llega a SUNAT no se deshace: si la base rechazara recién al guardar (`anular_comprobante`), la baja quedaría
// pedida ante SUNAT y el ERP seguiría mostrando el comprobante como válido. Por eso repite, con los mismos criterios,
// lo que esa función exige (líder, aceptado, sin nota vigente) y lo que la pantalla ya muestra (una baja en trámite
// solo se consulta: `accionesDelComprobante`). La base sigue siendo la que decide al guardar; esto evita que llegue a
// SUNAT un pedido que la base después no va a registrar.

export type DatosParaPedirBaja = {
  esLider: boolean;
  estado: EstadoComprobante;
  anulacion_solicitada_at: string | null;
  /** Notas de crédito o débito del comprobante que no están anuladas (el criterio de `anular_comprobante`). */
  notasVigentes: number;
};

export type RechazoDeBaja = { status: 403 | 409; error: string };

/** `null` si se puede pedir la baja; si no, la respuesta que da la ruta, sin haber llamado a Lucode. */
export function motivoParaNoPedirBaja(d: DatosParaPedirBaja): RechazoDeBaja | null {
  if (!d.esLider) {
    return { status: 403, error: "Solo un líder puede anular un comprobante: la baja ante SUNAT no se deshace." };
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
