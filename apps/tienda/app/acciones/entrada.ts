"use server";

import { cookies } from "next/headers";
import { COOKIE_ENTRADA, ENTRADA_DURA_S, marcaDeEntrada, type Anotacion } from "@/lib/entrada";
import { anotarEntradaEnBase } from "@/lib/entrada-servidor";
import { borrarCookiesDeSesion, clienteAdmin, clienteSesion, leerSesion } from "@/lib/sesion-servidor";
import { borrarUsuarioDeCuentaCerrada } from "@/lib/usuarios-servidor";

// La entrada a la tienda (Felipe 2026-10-14: entrar a la web cuenta como actividad del Club; `20261015055000`). La llaman el
// formulario de «Entrar» al iniciar sesión y, como mucho una vez al día por sesión, el marco de las páginas con cuenta
// (`EntradaDelDia`): nunca en cada petición. Si la cuenta se cerró (su ficha se anonimizó: 3 años sin comprar ni entrar, o lo pidió
// en tienda), su usuario se borra del proyecto de clientes ahora mismo y la sesión se cierra. Nunca va a un registro un correo.

export type ResultadoEntrada = Anotacion | "sin_sesion";

export async function anotarEntrada(): Promise<ResultadoEntrada> {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") return "sin_sesion";
  if (sesion.estado === "sin_respuesta") return "sin_respuesta";

  const resultado = await anotarEntradaEnBase(sesion.usuarioId);
  const almacen = await cookies();
  if (resultado === "anotada") {
    // La marca de «hoy ya se anotó»: el marco no vuelve a preguntarle a la base hasta mañana (o hasta que entre otra cuenta).
    almacen.set(COOKIE_ENTRADA, marcaDeEntrada(sesion.usuarioId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ENTRADA_DURA_S,
    });
  } else if (resultado === "cerrada") {
    // La cuenta ya no existe para la base: su usuario no tiene que poder volver a entrar. Si el proyecto de clientes no contesta
    // ahora, la ruta programada de la madrugada lo vuelve a intentar.
    const admin = clienteAdmin();
    if (admin) await borrarUsuarioDeCuentaCerrada(admin, sesion.usuarioId);
    const cliente = await clienteSesion();
    if (cliente) await cliente.auth.signOut({ scope: "local" }).catch(() => undefined);
    await borrarCookiesDeSesion();
    almacen.delete(COOKIE_ENTRADA);
  }
  return resultado;
}
