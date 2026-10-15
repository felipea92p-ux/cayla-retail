import { cookies } from "next/headers";
import { COOKIE_ENTRADA, debeAnotarEntrada } from "@/lib/entrada";
import { leerSesion } from "@/lib/sesion-servidor";
import { AnotarEntrada } from "./AnotarEntrada";

/**
 * En el marco de las páginas con cuenta: si hoy todavía no se anotó la entrada de esta sesión, la anota (una vez al día, nunca en
 * cada petición: la marca vive en una cookie de este aparato). La sesión ya la leyó la página: `leerSesion` es una sola por petición.
 */
export async function EntradaDelDia() {
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return null;
  const marca = (await cookies()).get(COOKIE_ENTRADA)?.value;
  return debeAnotarEntrada(marca, sesion.usuarioId) ? <AnotarEntrada /> : null;
}
