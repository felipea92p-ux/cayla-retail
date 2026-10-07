// Reglas puras de la consulta a SUNAT de lo que quedó a medias (`lib/consultar-comprobante.ts`,
// `20261007200000_sunat_consulta_lo_que_quedo_en_tramite.sql`): sin Supabase ni Lucode, para probarlas sin red.
//
// Nació del 2026-10-07: las boletas B001-113…192 pasaron una semana «enviado» en el ERP mientras SUNAT las había
// RECHAZADO, y la baja de B001-1 quedó «en trámite» ocho días. El ERP preguntaba una sola vez, al enviar.
//
// La regla de fondo es la misma de la anulación (`interpretarEstadoAnulacion`): ante la duda NO se escribe.
// Equivocarse hacia «todavía no» cuesta una consulta más; equivocarse hacia «ya está» deja una venta sin
// comprobante marcada como declarada, o un comprobante vivo marcado como dado de baja.

import type { EstadoAnulacion } from "@/lib/lucode";

export type FilaPorConsultar = {
  estado: string;
  anulacion_solicitada_at: string | null;
  entorno_transmision: string | null;
};

/** Qué se le pregunta a Lucode por este comprobante: si su emisión terminó, si su baja terminó, o nada. */
export type QueConsultar = "emision" | "baja" | null;

export function queConsultar(f: FilaPorConsultar, entornoActual: "sandbox" | "produccion"): QueConsultar {
  // Un comprobante del sandbox no se consulta contra producción ni al revés: la respuesta sería de otro documento.
  if (!f.entorno_transmision || f.entorno_transmision !== entornoActual) return null;
  if (f.estado === "enviado") return "emision";
  if (f.estado === "aceptado" && f.anulacion_solicitada_at) return "baja";
  return null;
}

export type AccionConsulta =
  | { tipo: "actualizar"; estado: "aceptado" | "rechazado"; motivoRechazo: string | null }
  | { tipo: "confirmar_baja" }
  | { tipo: "nada" };

/** Qué hacer con un comprobante «enviado» según lo que SUNAT dice ahora de su emisión. PENDIENTE (o cualquier
 *  cosa que `traducirEstado` no reconoce, que llega como PENDIENTE) no escribe: se vuelve a preguntar. */
export function accionPorEmision(estado: "ACEPTADO" | "PENDIENTE" | "RECHAZADO", mensaje: string | null): AccionConsulta {
  if (estado === "ACEPTADO") return { tipo: "actualizar", estado: "aceptado", motivoRechazo: null };
  if (estado === "RECHAZADO") {
    return { tipo: "actualizar", estado: "rechazado", motivoRechazo: mensaje?.trim() || "SUNAT lo rechazó (visto al consultar su estado)." };
  }
  return { tipo: "nada" };
}

/** Qué hacer con un comprobante con baja pedida. Solo la baja CONFIRMADA escribe: «en trámite» se vuelve a
 *  preguntar, y «no anulado» tampoco se toca —puede ser que SUNAT todavía no procesó el resumen diario—; queda
 *  a la vista como «Anulación en trámite» para decidirlo a mano si no cambia en 15 días. */
export function accionPorBaja(anulacion: EstadoAnulacion): AccionConsulta {
  return anulacion === "confirmada" ? { tipo: "confirmar_baja" } : { tipo: "nada" };
}
