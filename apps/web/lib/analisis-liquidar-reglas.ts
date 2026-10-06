// Análisis v4 (ADR-0356): «Liquidar desde», uno para todas las tiendas y todas las personas (Felipe, 2026-10-06). Lógica pura de
// la hoja que lo guarda (`components/analisis/HojaLiquidarDesde.tsx`) y de su lectura en el servidor (`analisis-liquidar.ts`):
// qué cambia, cuántas prendas de mi tienda caen en «Liquidar» con el umbral nuevo y con el que rige, qué se avisa al guardar y
// el error en tres líneas (ADR-0350, ley 9: qué pasó, qué se conservó, qué sigue).
//
// La base es la que manda (20261006216000): `guardar_liquidar_desde` rechaza lo que está fuera de 30–85 días y a quien no ve
// Análisis. Aquí no se agrega ninguna regla: solo se dice, en palabras de tienda, lo que la base ya decide.

import type { PrendaAnalisis } from "./analisis-tipos";
import { LIQUIDAR_DEFECTO, liquidarDesdeValido, plural, prendasDe } from "./analisis-reglas";
import { esRespuestaIncierta, traducirError, type ErrorEscritura } from "./error-escritura";
import { mensajeErrorResponsable } from "./responsable-reglas";

/** La lectura (toda cuenta de retail) y el guardado (quien ve Análisis), en la base. */
export const RPC_LEER_LIQUIDAR = "fn_liquidar_desde";
export const RPC_GUARDAR_LIQUIDAR = "guardar_liquidar_desde";

/** La nota de Análisis cuando la base no respondió: la pantalla sigue con el valor de fábrica y lo dice (principio 9). */
export const FALLA_LEER_LIQUIDAR = `No se pudo leer desde cuándo se liquida: va con ${LIQUIDAR_DEFECTO} días`;

/** Lo que la hoja pone a la vista antes de guardar. */
export type EfectoLiquidar = {
  /** El umbral que se va a guardar (30 a 85). */
  dias: number;
  /** El que rige hoy para todas las tiendas (lo guardado). */
  guardado: number;
  /** ¿Hay algo que guardar? */
  cambia: boolean;
  /** Prendas de mi tienda que caen en «Liquidar» con el umbral nuevo… */
  enLiquidar: number;
  /** …y con el que rige hoy. */
  enLiquidarHoy: number;
};

/**
 * Qué cambia al guardar `dias` cuando hoy rige `guardado`, contado sobre TODAS las prendas de mi tienda (no las del buscador:
 * el umbral vale para la red entera, y la cuenta tiene que ser la misma que la de la pestaña). Fuera de sus topes, se lleva al
 * borde (la misma regla que la lectura).
 */
export function efectoDeLiquidar(prendas: readonly PrendaAnalisis[], dias: number, guardado: number): EfectoLiquidar {
  const nuevo = liquidarDesdeValido(dias);
  const hoy = liquidarDesdeValido(guardado);
  return {
    dias: nuevo,
    guardado: hoy,
    cambia: nuevo !== hoy,
    enLiquidar: prendasDe(prendas, ["liquidar"], nuevo).length,
    enLiquidarHoy: prendasDe(prendas, ["liquidar"], hoy).length,
  };
}

/** La cifra de la tarjeta: «Ninguna», «1 prenda», «12 prendas». */
export function cifraPrendas(n: number): string {
  return n <= 0 ? "Ninguna" : `${n} ${plural(n, "prenda", "prendas")}`;
}

/** El aviso de éxito (esquina superior derecha, ADR-0149): corto, con el alcance aparte. */
export function avisoLiquidarGuardado(dias: number): { texto: string; detalle: string } {
  return { texto: `Liquidar desde ${liquidarDesdeValido(dias)} días`, detalle: "Para todas las tiendas" };
}

/** Un error en tres líneas: qué pasó, qué se conservó y qué sigue. */
export type ErrorEnTresLineas = { que: string; queda: string; sigue: string };

/**
 * El error al guardar, en tres líneas. Si la respuesta no llegó (corte de red, tope de espera) no se sabe si se guardó: se dice
 * así y se ofrece volver a tocar el botón (guardar el mismo valor dos veces no cambia nada: la base no escribe si ya era ese).
 * Si la base dijo que no, todo sigue como estaba, y la tercera línea es su motivo (fuera de rango, sin Análisis, el responsable).
 */
export function errorAlGuardarLiquidar(error: ErrorEscritura, efecto: Pick<EfectoLiquidar, "dias" | "guardado">): ErrorEnTresLineas {
  if (esRespuestaIncierta(error)) {
    return {
      que: "No se pudo confirmar si se guardó.",
      queda: `Tu cambio sigue aquí: ${efecto.dias} días.`,
      sigue: "Revisa la conexión y vuelve a tocar «Guardar para todos».",
    };
  }
  const queda = `Todas las tiendas siguen con ${efecto.guardado} días.`;
  // PGRST202: la función todavía no está en la base (la migración 20261006216000 no se pegó).
  if (error?.code === "PGRST202") {
    return { que: "No se guardó.", queda, sigue: "Guardar para todos todavía no está listo: avisa a Felipe." };
  }
  // El responsable (no está de turno, falta elegirlo): su frase sola, sin repetir «No se pudo…» de la primera línea.
  return { que: "No se guardó.", queda, sigue: mensajeErrorResponsable(error) ?? traducirError(error, "guardar desde cuándo se liquida") };
}
