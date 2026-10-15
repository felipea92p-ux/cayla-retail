import "server-only";
import { leerGuardadosEnBase } from "./club-servidor";
import { leerSesion } from "./sesion-servidor";

// Lo que la cabecera con cuenta lee de la persona (ADR-0408; maqueta v4, `cabT`): cuántos favoritos guardó, para el globo del corazón.
// La bolsa la cuenta su propio botón (`components/bolsa/BotonBolsa.tsx`, con la cookie y sin la base). La sesión y los favoritos se leen
// una vez por petición: la página y las tarjetas de la misma página comparten la misma lectura.

/** Cuántos modelos guardó con el corazón. null sin sesión o si la base no contestó: el corazón va sin globo (nunca un 0 inventado). */
export async function cuantosFavoritos(): Promise<number | null> {
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return null;
  const guardados = await leerGuardadosEnBase(sesion.usuarioId);
  return guardados ? guardados.favoritos.size : null;
}
