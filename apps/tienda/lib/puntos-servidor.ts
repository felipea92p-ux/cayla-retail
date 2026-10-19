import "server-only";
import { randomUUID } from "node:crypto";
import { base, leerConRespaldo } from "./base";
import { estadoDeRechazo, leerMisPuntos, leerRespuestaCanje, type EstadoCanje, type MisPuntos } from "./puntos";

// Los puntos del Club en la cuenta (programa de puntos, actividad 6) en la base del ERP, solo por sus funciones `retail.tienda_*`
// (20261019203000 y 20261019213000). Cada una busca la cuenta por el usuario del proyecto de CLIENTES que le pasa el servidor (el que
// ya validó la sesión) y solo toca lo de esa cuenta. Si la base no contesta, la lectura lo dice y la pantalla se degrada: nunca se cae.
// En los registros del servidor no va ningún dato de la persona: solo el evento y el error de la base.

export type LecturaPuntos = { estado: "ok"; puntos: MisPuntos } | { estado: "sin_cuenta" } | { estado: "sin_respuesta" };

/** «Mi perfil»: sus puntos, sus cupones vivos y su historial (libera lo vencido antes de leer). */
export const leerMisPuntosEnBase = (usuarioWebId: string): Promise<LecturaPuntos> =>
  leerConRespaldo<LecturaPuntos>(
    "tienda_mis_puntos_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_mis_puntos(${usuarioWebId}::uuid) as r`;
      if (fila?.r === null || fila?.r === undefined) return { estado: "sin_cuenta" };
      const puntos = leerMisPuntos(fila.r);
      return puntos ? { estado: "ok", puntos } : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

/**
 * Canjea puntos por un cupón. La clave de la operación (`token`) la manda quien llama: el mismo doble toque o reintento devuelve el
 * MISMO cupón y no gasta dos veces. La base rechaza con un `hint` que aquí se vuelve un estado; nada más sale al navegador.
 */
export async function canjearPuntosEnBase(usuarioWebId: string, puntos: number, token: string = randomUUID()): Promise<EstadoCanje> {
  try {
    const [fila] = await base()`select retail.tienda_canjear_puntos(${usuarioWebId}::uuid, ${puntos}::integer, ${token}::uuid) as r`;
    return leerRespuestaCanje(fila?.r);
  } catch (error) {
    const hint = typeof error === "object" && error !== null && "hint" in error ? String((error as { hint?: unknown }).hint ?? "") : "";
    const estado = estadoDeRechazo(hint);
    if (estado === "sin_respuesta") console.error(JSON.stringify({ evento: "tienda_canjear_puntos_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return { estado };
  }
}
