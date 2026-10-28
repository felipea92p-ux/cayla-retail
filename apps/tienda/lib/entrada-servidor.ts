import "server-only";
import { cookies } from "next/headers";
import { leerConRespaldo } from "./base";
import { COOKIE_ENTRADA, ENTRADA_DURA_S, leerAnotacion, leerUsuariosPorBorrar, marcaDeEntrada, type Anotacion } from "./entrada";

// La entrada a la tienda y las cuentas cerradas, en la base del ERP (ADR-0408, `20261015055000`), solo por sus funciones
// `retail.tienda_*`. Si la base no contesta, nada se anota ni se borra: la próxima entrada lo vuelve a intentar (principio 9).

/** Anota la entrada de ese usuario del proyecto de clientes. `cerrada`: es de una cuenta cerrada (hay que borrar el usuario). */
export const anotarEntradaEnBase = (usuarioWebId: string): Promise<Anotacion> =>
  leerConRespaldo<Anotacion>(
    "tienda_anotar_entrada_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_anotar_entrada(${usuarioWebId}::uuid) as r`;
      return leerAnotacion(fila?.r);
    },
    "sin_respuesta",
  );

/** Los usuarios de cuentas cerradas que todavía hay que borrar del proyecto de clientes (los más viejos primero). */
export const usuariosPorBorrarEnBase = (limite: number): Promise<string[] | null> =>
  leerConRespaldo<string[] | null>(
    "tienda_usuarios_por_borrar_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_usuarios_por_borrar(${limite}::integer) as r`;
      return leerUsuariosPorBorrar(fila?.r);
    },
    null,
  );

/** Anota que el usuario de una cuenta cerrada ya no está en el proyecto de clientes. null si la base no contestó. */
export const usuarioBorradoEnBase = (usuarioWebId: string): Promise<boolean | null> =>
  leerConRespaldo<boolean | null>(
    "tienda_usuario_borrado_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_usuario_borrado(${usuarioWebId}::uuid) as r`;
      return fila?.r === true;
    },
    null,
  );

/**
 * La marca de «hoy ya se anotó la entrada» de este aparato (la misma que deja `anotarEntrada`). Crear la cuenta o entrar con Google
 * también es entrar: se anota y se deja la marca, así el marco no vuelve a preguntar hoy. Solo desde una acción o una ruta.
 */
export async function marcarEntradaDeHoy(usuarioWebId: string): Promise<void> {
  (await cookies()).set(COOKIE_ENTRADA, marcaDeEntrada(usuarioWebId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ENTRADA_DURA_S,
  });
}
