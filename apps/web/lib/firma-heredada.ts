/**
 * El nombre se pide UNA vez por operación (ADR-0328, actividad 15; Felipe, 2026-10-04: «si ya se colocó un nombre en el manejo de
 * una operación no creo necesario estar pidiéndolo varias veces»). Sin red ni React: lo usan Confirmar conteo y la recepción de un
 * traslado, y se prueba en `firma-heredada.test.ts`.
 *
 * CONTRATO
 *   PROMETE: dado quién usa la pantalla (una persona o una terminal compartida), la firma vigente de la operación (quién abrió el
 *            conteo o quién firmó la recepción, si fue hoy y si sigue de turno) y lo que el aparato ya sabe (a quién eligieron en
 *            este conteo o esta recepción), qué hace la pantalla con el nombre: nada (firma la persona de la sesión), decir a nombre
 *            de quién va y dejar que la base lo ponga, mandar el nombre que el aparato ya conoce, o preguntarlo una vez.
 *   ASUME:   la regla que MANDA es la de la base (`retail.fn_firma_heredada`: terminal sin nombre → la firma de la operación si es
 *            del mismo día en Lima y esa persona sigue de turno; si no, `responsable_requerido`). Esto solo la anticipa para no
 *            mostrar un error: si la base igual pide el nombre (pasó la medianoche, otra persona firmó desde otro aparato), la
 *            pantalla pregunta (`esPedidoDeNombre`). «Hoy» y «de turno» los dice la base (`abierto_hoy`/`de_hoy`,
 *            `abierto_por_presente`/`presente`), no el reloj del aparato.
 *   NO HACE: no valida asistencia ni permisos (eso es de la base, también para el nombre que se manda) ni guarda nada: lo que el
 *            aparato recuerda lo guarda `useResponsable` con `recordarEn`.
 */

import type { CampoDeGuia } from "./guia-campos";

/**
 * La firma vigente de la operación, como la leyó el servidor. `null` = no se pudo leer (la función falta en la base o falló).
 * `presente`: si esa persona sigue de turno en la sede; `null` = la base no lo dijo (se asume que sí y, si no, la base pregunta).
 */
export type FirmaVigente = { personaId: string | null; nombre: string | null; deHoy: boolean; presente?: boolean | null } | null;

export type FirmaDelPaso =
  /** Sesión de una persona: firma ella misma, como siempre. */
  | { tipo: "propia" }
  /** Terminal y alguien firmó esta operación hoy y sigue de turno: la base pone su nombre. */
  | { tipo: "heredada"; nombre: string }
  /** Terminal y la operación es de otro día, quien la firmó ya marcó su salida, o nadie la firmó: hay que elegir quién, una vez. */
  | { tipo: "preguntar"; motivo: "otro_dia" | "salio" | "nadie"; nombre?: string }
  /** Terminal y no se pudo leer la firma: se manda sin nombre y, si la base lo pide, se pregunta. */
  | { tipo: "desconocida" };

export function firmaDelPaso({ terminal, firma }: { terminal: boolean; firma: FirmaVigente }): FirmaDelPaso {
  if (!terminal) return { tipo: "propia" };
  if (firma === null) return { tipo: "desconocida" };
  if (!firma.personaId) return { tipo: "preguntar", motivo: "nadie" };
  if (!firma.deHoy) return { tipo: "preguntar", motivo: "otro_dia" };
  const nombre = firma.nombre?.trim() || null;
  // La base no hereda la firma de quien ya marcó su salida (otro turno, ADR-0328 decisión 7): se pregunta desde ya.
  if (firma.presente === false) return nombre ? { tipo: "preguntar", motivo: "salio", nombre } : { tipo: "preguntar", motivo: "salio" };
  return { tipo: "heredada", nombre: nombre ?? "quien la empezó" };
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
      if (paso.motivo === "salio") {
        if (conteo) {
          return paso.nombre
            ? `${paso.nombre} abrió este conteo hoy, pero ya no está de turno: elige quién lo cierra. Se pregunta una sola vez.`
            : "Quien abrió este conteo ya no está de turno: elige quién lo cierra. Se pregunta una sola vez.";
        }
        return paso.nombre
          ? `${paso.nombre} empezó esta recepción hoy, pero ya no está de turno: elige quién la sigue. Se pregunta una sola vez.`
          : "Quien empezó esta recepción ya no está de turno: elige quién la sigue. Se pregunta una sola vez.";
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

/**
 * Lo que la pantalla hace con el nombre, ya sumado lo que sabe el aparato.
 *   · `propia`: firma la persona de la sesión; se manda la clave omitida, como siempre.
 *   · `base`: la base pone el nombre (heredado de hoy) o todavía no se sabe; se manda la clave omitida. `cambiar` es el enlace
 *     «¿No es Rosa? Elige quién cierra» (o `null` si no hay a quién nombrar).
 *   · `recordada`: el aparato ya sabe quién (lo eligieron en este conteo o en esta recepción y sigue de turno): se manda SU nombre,
 *     también si la operación es de otro día. Es lo que evita volver a preguntar lo que el aparato ya sabe (revisión adversarial).
 *   · `elegir`: el combo a la vista; se manda el nombre elegido.
 * Mandar un nombre (recordada o elegir) pasa por el candado de asistencia de la base, igual que en cualquier otra acción.
 */
export type FirmaEnPantalla =
  | { modo: "propia" }
  | { modo: "base"; texto: string | null; cambiar: string | null }
  | { modo: "recordada"; texto: string; cambiar: string }
  | { modo: "elegir"; texto: string };

/**
 * @param aparato.recordado — el nombre de quien está elegido en el combo de este aparato para esta operación y sigue de turno, o
 *   `null`. @param aparato.aMano — la persona pidió elegir (tocó «Elige quién…» o el combo): el combo se queda a la vista, aunque
 *   ya haya alguien elegido. @param aparato.laBaseLoPidio — la base respondió `responsable_requerido`.
 */
export function firmaEnPantalla(
  paso: FirmaDelPaso,
  aparato: { recordado: string | null; aMano: boolean; laBaseLoPidio: boolean },
  operacion: OperacionFirmada
): FirmaEnPantalla {
  if (paso.tipo === "propia") return { modo: "propia" };
  const conteo = operacion === "cierre_conteo";
  // Si la base pidió el nombre sin que la pantalla lo esperara, no se afirma por qué («otro día»): se dice lo que siempre es cierto.
  if (aparato.laBaseLoPidio) return { modo: "elegir", texto: textoFirma({ tipo: "preguntar", motivo: "nadie" }, operacion)! };
  if (aparato.aMano) return { modo: "elegir", texto: conteo ? "Elige quién cierra este conteo." : "Elige quién recibe este traslado: lo demás de la recepción va a su nombre." };
  if (aparato.recordado) {
    return {
      modo: "recordada",
      texto: conteo
        ? `Se cierra a nombre de ${aparato.recordado}, a quien eligieron en este aparato para este conteo.`
        : `Se recibe a nombre de ${aparato.recordado}, a quien eligieron en este aparato para esta recepción.`,
      cambiar: textoCambiarFirma(aparato.recordado, operacion),
    };
  }
  if (paso.tipo === "heredada") return { modo: "base", texto: textoFirma(paso, operacion), cambiar: textoCambiarFirma(paso.nombre, operacion) };
  if (paso.tipo === "preguntar") return { modo: "elegir", texto: textoFirma(paso, operacion)! };
  return { modo: "base", texto: null, cambiar: null };
}

/** «¿No es Rosa? Elige quién cierra»: para que quien está frente a la terminal corrija el nombre que la pantalla puso por su cuenta. */
export function textoCambiarFirma(nombre: string, operacion: OperacionFirmada): string {
  return `¿No es ${nombre}? Elige quién ${operacion === "cierre_conteo" ? "cierra" : "recibe"}`;
}

/** ¿Se manda el nombre del combo? En `recordada` y `elegir`; en `propia` y `base` se manda la clave omitida y decide la base. */
export function mandaNombre(f: FirmaEnPantalla): boolean {
  return f.modo === "recordada" || f.modo === "elegir";
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
