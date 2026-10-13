/**
 * El saludo de la entrada y la salida (Felipe 2026-10-13, diseño B de la maqueta `docs/maquetas/login-entrada-2026-10/`): mientras el colibrí flota en el centro, «Bienvenido(a)» y el
 * nombre de la persona al entrar, «Hasta luego» y el nombre al salir. Aquí vive solo el texto (lógica pura, con su prueba); lo dibuja `components/login/EntradaColibri.tsx`.
 *
 * El nombre: una PERSONA se saluda por su nombre de pila; una TERMINAL (ADR-0162, un aparato sin persona), por el nombre completo del aparato («Terminal Ventas TRU»). Sin nombre
 * (la base no contestó a tiempo) solo va la frase. «Bienvenido(a)» es el texto que pidió Felipe; no se adivina el género a partir del nombre.
 */

export type SaludoDeLaEntrada = { frase: string; nombre: string | null };

export const FRASE_DE_ENTRADA = "Bienvenido(a)";
export const FRASE_DE_SALIDA = "Hasta luego";

/** Lo que se dice del nombre: el de pila para una persona, el del aparato completo para una terminal; null si no hay. */
export function nombreParaSaludar(nombre: unknown, terminal: boolean): string | null {
  if (typeof nombre !== "string") return null;
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (limpio === "") return null;
  return terminal ? limpio : limpio.split(" ")[0];
}

export function saludoDe(modo: "entrar" | "salir", nombre: unknown, terminal: boolean): SaludoDeLaEntrada {
  return { frase: modo === "entrar" ? FRASE_DE_ENTRADA : FRASE_DE_SALIDA, nombre: nombreParaSaludar(nombre, terminal) };
}

/**
 * De lo que contestan `fn_persona_actual_resumen()` (su fila: `nombre` es el de la persona o, en una terminal, el del aparato) y `fn_mi_terminal()` (el nombre del aparato; vacío si es una
 * persona), saca a quién saludar. Cualquier forma rara es «no sé»: se saluda sin nombre.
 */
export function cuentaParaSaludar(resumen: unknown, miTerminal: unknown): { nombre: string; terminal: boolean } | null {
  const fila = Array.isArray(resumen) ? resumen[0] : resumen;
  const nombre = fila && typeof fila === "object" ? (fila as { nombre?: unknown }).nombre : undefined;
  if (typeof nombre !== "string" || nombre.trim() === "") return null;
  return { nombre, terminal: typeof miTerminal === "string" && miTerminal.trim() !== "" };
}
