import "server-only";
import { randomUUID } from "node:crypto";
import { cacheLife, unstable_cache } from "next/cache";
import { base, leerConRespaldo } from "./base";
import { estadoDeRechazo, leerConfigDePuntos, leerMisPuntos, leerRespuestaCanje, type ConfigPuntos, type EstadoCanje, type MisPuntos } from "./puntos";

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

// La configuración de los puntos es la misma para todos (la cambia el ERP, Clientes ▸ Beneficios del club): se comparte entre visitas unos
// minutos, como los beneficios de antes, en vez de preguntarle a la base en cada página. Se guarda el JSON crudo; un fallo NO se guarda.
const configCompartida = unstable_cache(
  async (): Promise<unknown> => {
    const [fila] = await base()`select retail.tienda_puntos_config() as r`;
    return fila?.r ?? null;
  },
  ["tienda-puntos-config-v1"],
  { revalidate: 300 },
);

async function configGuardada(): Promise<unknown> {
  "use cache";
  try {
    const cruda = await configCompartida();
    cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
    return cruda;
  } catch (error) {
    // Sin base: no se lanza (Next daría por rota la página que se arma por adelantado) y el respaldo dura segundos, no minutos.
    console.error(JSON.stringify({ evento: "tienda_puntos_config_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    cacheLife({ stale: 300, revalidate: 5, expire: 3600 });
    return null;
  }
}

/** Lo que valen los puntos hoy, para la portada y los Términos. null si la base no contesta: se dice sin cifras. */
export const leerConfigDePuntosDelClub = async (): Promise<ConfigPuntos | null> => {
  try {
    return leerConfigDePuntos(await configGuardada());
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_puntos_config_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
};
