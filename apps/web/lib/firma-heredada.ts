/**
 * El nombre se pide UNA vez por operación (ADR-0328, actividad 15; Felipe, 2026-10-04: «si ya se colocó un nombre en el manejo de
 * una operación no creo necesario estar pidiéndolo varias veces»). Sin red ni React: lo usan Confirmar conteo y la recepción de un
 * traslado, y se prueba en `firma-heredada.test.ts`.
 *
 * CONTRATO
 *   PROMETE: dado quién usa la pantalla (una persona o una terminal compartida) y la firma vigente de la operación (quién abrió el
 *            conteo o quién firmó la recepción, y si fue hoy), qué hace la pantalla con el nombre: nada (firma la persona de la
 *            sesión), decir a nombre de quién va (la base lo hereda), o preguntarlo una vez (otro día o nadie todavía).
 *   ASUME:   la regla que MANDA es la de la base (`retail.fn_firma_heredada`: terminal sin nombre → la firma de la operación si es
 *            del mismo día en Lima; si no, `responsable_requerido`). Esto solo la anticipa para no mostrar un error: si la base
 *            igual pide el nombre (pasó la medianoche, otra persona firmó desde otro aparato), la pantalla pregunta
 *            (`esPedidoDeNombre`). «Hoy» lo dice la base (`abierto_hoy`, `de_hoy`), no el reloj del aparato.
 *   NO HACE: no valida asistencia ni permisos (eso es de la base) y no recuerda nada en el navegador.
 */

import type { CampoDeGuia } from "./guia-campos";

/** La firma vigente de la operación, como la leyó el servidor. `null` = no se pudo leer (la función falta en la base o falló). */
export type FirmaVigente = { personaId: string | null; nombre: string | null; deHoy: boolean } | null;

export type FirmaDelPaso =
  /** Sesión de una persona: firma ella misma, como siempre. */
  | { tipo: "propia" }
  /** Terminal y alguien firmó esta operación hoy: la base pone su nombre. */
  | { tipo: "heredada"; nombre: string }
  /** Terminal y la operación es de otro día, o nadie la firmó: hay que elegir quién, una vez. */
  | { tipo: "preguntar"; motivo: "otro_dia" | "nadie" }
  /** Terminal y no se pudo leer la firma: se manda sin nombre y, si la base lo pide, se pregunta. */
  | { tipo: "desconocida" };

export function firmaDelPaso({ terminal, firma }: { terminal: boolean; firma: FirmaVigente }): FirmaDelPaso {
  if (!terminal) return { tipo: "propia" };
  if (firma === null) return { tipo: "desconocida" };
  if (!firma.personaId) return { tipo: "preguntar", motivo: "nadie" };
  if (!firma.deHoy) return { tipo: "preguntar", motivo: "otro_dia" };
  return { tipo: "heredada", nombre: firma.nombre?.trim() || "quien la empezó" };
}

export type OperacionFirmada = "cierre_conteo" | "recepcion_traslado";

/**
 * Lo que la pantalla dice del nombre, en palabras de tienda. `null` cuando no hay nada que decir (firma la persona de la sesión, o
 * no se sabe todavía).
 */
export function textoFirma(paso: FirmaDelPaso, operacion: OperacionFirmada): string | null {
  const conteo = operacion === "cierre_conteo";
  switch (paso.tipo) {
    case "heredada":
      return conteo ? `Se cierra a nombre de ${paso.nombre}, que abrió este conteo hoy.` : `Se recibe a nombre de ${paso.nombre}, que empezó esta recepción hoy.`;
    case "preguntar":
      if (paso.motivo === "otro_dia") {
        return conteo
          ? "Este conteo se abrió otro día: elige quién lo cierra. Se pregunta una sola vez."
          : "Esta recepción se empezó otro día: elige quién la sigue. Se pregunta una sola vez.";
      }
      return conteo
        ? "Elige quién cierra este conteo. Se pregunta una sola vez."
        : "Elige quién recibe este traslado. Se pregunta una sola vez: lo demás de la recepción va a su nombre.";
    default:
      return null;
  }
}

/** La pregunta del combo cuando hay que elegir: «¿Quién cierra el conteo?» / «¿Quién recibe?». */
export function preguntaFirma(operacion: OperacionFirmada): string {
  return operacion === "cierre_conteo" ? "¿Quién cierra el conteo?" : "¿Quién recibe?";
}

/**
 * ¿La base pidió el nombre? (`fn_firma_heredada` o `fn_actor_persona_id`: hint `responsable_requerido`). Es la red de seguridad: la
 * pantalla pensaba que heredaba (o no lo sabía) y la base dijo que no; desde ahí, pregunta.
 */
export function esPedidoDeNombre(error: { hint?: string | null; message?: string | null } | null | undefined): boolean {
  return error?.hint === "responsable_requerido";
}

/** ¿Hay que mostrar el combo? Al preguntar, o después de que la base lo pidió. */
export function hayQuePreguntar(paso: FirmaDelPaso, laBaseLoPidio: boolean): boolean {
  return paso.tipo === "preguntar" || (laBaseLoPidio && paso.tipo !== "propia");
}

/**
 * La guía de foco del nombre (ADR-0284): cuando hay que preguntarlo es el ÚNICO campo del paso y bloquea el botón principal (lo mismo
 * que hace la base: sin nombre, `responsable_requerido`); cuando no, no hay nada que guiar. Sin reglas nuevas: «hecho» es que el combo
 * ya tenga a alguien de turno.
 */
export function camposDeFirma(operacion: OperacionFirmada, e: { preguntar: boolean; responsableListo: boolean }): CampoDeGuia[] {
  if (!e.preguntar) return [];
  const conteo = operacion === "cierre_conteo";
  return [
    {
      id: "firma",
      nombre: conteo ? "Quién cierra" : "Quién recibe",
      requerido: true,
      hecho: e.responsableListo,
      pendiente: conteo ? "Elige quién cierra el conteo." : "Elige quién recibe el traslado.",
    },
  ];
}
