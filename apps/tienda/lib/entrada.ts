import { z } from "zod";
import { hoyLima } from "./cuentas";

// La entrada a la tienda online cuenta como actividad del Club (Felipe 2026-10-14): con 3 años sin comprar NI entrar, la ficha se
// anonimiza y su cuenta web se cierra (`20261015055000`). La base la anota con `retail.tienda_anotar_entrada`; aquí, lo que no
// necesita red: cuándo hace falta anotarla (al iniciar sesión y, como mucho, una vez al día por sesión, nunca en cada petición) y
// cómo se lee lo que contesta la base. Lógica pura: la usan la acción del servidor, el marco de las páginas y sus pruebas.

/**
 * La marca de «ya se anotó hoy» de este aparato. No es secreta ni identifica a nadie fuera de este aparato (el id del usuario ya
 * viaja en la cookie de la sesión); solo evita preguntarle a la base en cada página. Sin ella, se anota de nuevo: es inofensivo.
 */
export const COOKIE_ENTRADA = "tienda-entrada";
/** Dura dos días: al tercero ya no sirve igual (otro día de Lima). */
export const ENTRADA_DURA_S = 2 * 24 * 60 * 60;

const fechaLima = (ahora: Date) => {
  const { anio, mes, dia } = hoyLima(ahora);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
};

/** «2026-10-14.<usuario>»: el día de Lima y de quién es la sesión que ya se anotó. */
export const marcaDeEntrada = (usuarioId: string, ahora = new Date()) => `${fechaLima(ahora)}.${usuarioId}`;

/** ¿Hay que anotar la entrada de esta sesión? Sí, si la marca no es la de hoy y de este mismo usuario. */
export function debeAnotarEntrada(marca: string | null | undefined, usuarioId: string, ahora = new Date()): boolean {
  return marca !== marcaDeEntrada(usuarioId, ahora);
}

/**
 * Lo que contesta `tienda_anotar_entrada`. `cerrada`: su ficha se anonimizó (3 años sin comprar ni entrar, o lo pidió en tienda):
 * el servidor borra su usuario y cierra la sesión. `sin_cuenta`: el usuario existe pero la cuenta no terminó de crearse.
 */
export type Anotacion = "anotada" | "cerrada" | "sin_cuenta" | "sin_respuesta";

export function leerAnotacion(dato: unknown): Anotacion {
  const r = z.object({ estado: z.string() }).safeParse(dato);
  if (!r.success) return "sin_respuesta";
  return r.data.estado === "anotada" || r.data.estado === "cerrada" || r.data.estado === "sin_cuenta" ? r.data.estado : "sin_respuesta";
}

/** Lo que contesta `tienda_usuarios_por_borrar`: los usuarios de cuentas cerradas que todavía hay que borrar del proyecto de clientes. */
export function leerUsuariosPorBorrar(dato: unknown): string[] {
  const r = z.object({ usuarios: z.array(z.string().uuid()) }).safeParse(dato);
  return r.success ? r.data.usuarios : [];
}
