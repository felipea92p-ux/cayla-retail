import "server-only";
import { leerConRespaldo } from "./base";
import { leerAnotacion, leerUsuariosPorBorrar, type Anotacion } from "./entrada";

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
