// El correo de CONTACTO de un cliente, en su ficha de /clientas (Felipe 2026-10-15: «Sí, antes de abrir la tienda»). Lógica pura, sin
// React ni red: la usa la hoja de la ficha (lo que se ve y «Editar») y la prueban `correo-clienta-reglas.test.ts`.
//
// Las reglas son las MISMAS que la base (`editar_clienta` y el candado `clientas_correo_formato`, migración 20261015123000): la
// pantalla avisa antes de guardar y la base es la que manda. Si una cambia, cambian las dos.
//
// NO es el correo con que la persona ENTRA a la tienda online (`cuentas_web.correo`): ese es la llave de su cuenta y no cambia desde el
// ERP (cabecera de 20261015123000).

import type { ErrorEscritura } from "./error-escritura";

/** Como lo guarda la base: en minúsculas y sin espacios alrededor. */
export function normalizarCorreo(texto: string): string {
  return texto.trim().toLowerCase();
}

/** algo@algo.algo, sin espacios: la expresión del candado `clientas_correo_formato` (y del cartel del Club). */
const FORMATO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** El tope del candado (el largo de un correo según su norma). */
const LARGO_MAXIMO = 254;

/** Lo que dice la caja cuando el correo está mal escrito: el mismo texto que la base (`correo_invalido`). */
export const CORREO_MAL_ESCRITO = "Revisa el correo: parece incompleto. Si no lo tiene, déjalo vacío.";

/** Qué está mal del correo, o null si está bien. Vacío vale: el correo es opcional. */
export function problemaCorreo(texto: string): string | null {
  const c = normalizarCorreo(texto);
  if (c === "") return null;
  return c.length > LARGO_MAXIMO || !FORMATO.test(c) ? CORREO_MAL_ESCRITO : null;
}

/**
 * El correo a medias para quien no es líder, como el DNI y el celular (Felipe 2026-10-13, auditoría de 20 puntos, punto 18): las dos
 * primeras letras de lo que va antes de la @ y el dominio entero («an•••@gmail.com»; el dominio no dice quién es). Uno que no tiene
 * la forma de un correo sale «•••».
 */
export function correoEnmascarado(correo: string): string {
  const c = normalizarCorreo(correo);
  const arroba = c.lastIndexOf("@");
  if (arroba < 1 || arroba === c.length - 1) return "•••";
  return `${c.slice(0, Math.min(2, arroba))}•••${c.slice(arroba)}`;
}

/** El correo como se lee en la ficha: completo para el líder, a medias para los demás; null si no tiene. */
export function correoVisible(correo: string | null, verCompleto: boolean): string | null {
  if (!correo || normalizarCorreo(correo) === "") return null;
  return verCompleto ? normalizarCorreo(correo) : correoEnmascarado(correo);
}

/**
 * ¿La base rechazó el CORREO? (20261015123000 y 20261015054000): mal escrito (`correo_invalido`), de otra ficha o con el que entra a
 * la tienda online la cuenta de otra (`correo_de_otra_ficha`, que dice de cuál), o el disparador sin nombre (`correo_repetido`). Ese
 * error va bajo la caja del correo, no en un aviso suelto (ADR-0358: el error de UN dato, bajo su campo).
 */
export function esRechazoDelCorreo(error: ErrorEscritura): boolean {
  return !!error && (error.hint === "correo_invalido" || error.hint === "correo_de_otra_ficha" || error.hint === "correo_repetido");
}

/** Lo que la base rechazó del correo, con el correo que se mandó: vale mientras la caja diga lo mismo. */
export type RechazoCorreo = { valor: string; mensaje: string };

/** El mensaje de la base si la caja todavía dice el correo que rechazó; null si ya escribió otro (o lo borró). */
export function rechazoVigente(rechazo: RechazoCorreo | null, correo: string): string | null {
  return rechazo && normalizarCorreo(correo) === rechazo.valor ? rechazo.mensaje : null;
}
