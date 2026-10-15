import "server-only";
import { cache } from "react";
import { leerGuardadosEnBase } from "./club-servidor";
import { leerMiCuentaEnBase } from "./cuentas-servidor";
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

/** El nombre corto de la cuenta («María»), para el saludo del menú de la persona (Felipe 2026-10-15). null sin sesión o si la base no
 *  contestó: el menú sale sin saludo. Una vez por petición (`tienda_mi_cuenta`, ~13 ms en producción). */
export const nombreDeLaCuenta = cache(async (): Promise<string | null> => {
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return null;
  const lectura = await leerMiCuentaEnBase(sesion.usuarioId);
  return lectura.estado === "cuenta" ? lectura.cuenta.nombreCorto : null;
});
