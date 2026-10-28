import type { EstadoComprobante } from "./comprobantes-reglas";
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
