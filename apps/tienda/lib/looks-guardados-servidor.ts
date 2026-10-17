import "server-only";
import { cache } from "react";
import { leerConRespaldo } from "./base";
import { interpretarMisLooks, leerRespuestaGuardar, type LookGuardado, type RespuestaGuardarLook } from "./looks-guardados";

// Los looks guardados de «Arma el tuyo» (ADR-0434, actividad 8) en la base del ERP, solo por sus funciones `retail.tienda_*`
// (20261017044000). Son de UNA persona: nunca pasan por la caché compartida. Cada función busca la cuenta por el usuario del proyecto
// de clientes que le pasa el servidor (el que ya validó la sesión) y solo toca lo de esa cuenta. Si la base no contesta, cada lectura lo
// dice y la pantalla se degrada; en los registros no va nada de la persona.

/** Sus looks guardados vivos (lo más nuevo primero). `null` si la base no contesta o no hay cuenta. Una vez por petición. */
export const leerMisLooksEnBase = cache(
  (usuarioWebId: string): Promise<LookGuardado[] | null> =>
    leerConRespaldo(
      "tienda_mis_looks_fallo",
      async (db) => {
        const [fila] = await db`select retail.tienda_mis_looks(${usuarioWebId}::uuid) as r`;
        return interpretarMisLooks(fila?.r);
      },
      null,
    ),
);

/** Guarda el look (sus prendas, modelo y color, en su orden). */
export const guardarLookEnBase = (usuarioWebId: string, piezas: { producto_id: string; color: string }[], nombre: string | null): Promise<RespuestaGuardarLook> =>
  leerConRespaldo<RespuestaGuardarLook>(
    "tienda_guardar_look_fallo",
    async (db) => {
      // El JSON viaja como TEXTO y lo convierte la base (como en la bolsa): con `::jsonb` solo, el driver lo vuelve a codificar y llega
      // un texto, no una lista (la base respondía `invalido`).
      const [fila] = await db`select retail.tienda_guardar_look(${usuarioWebId}::uuid, ${JSON.stringify(piezas)}::text::jsonb, ${nombre}) as r`;
      return leerRespuestaGuardar(fila?.r);
    },
    { estado: "sin_respuesta", id: null, nombre: null },
  );

/** Quita uno de sus looks (no se borra). `true` si la base respondió. */
export const quitarLookEnBase = (usuarioWebId: string, lookId: string): Promise<boolean> =>
  leerConRespaldo(
    "tienda_quitar_look_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_quitar_look(${usuarioWebId}::uuid, ${lookId}::uuid) as r`;
      return (fila?.r as { estado?: string } | undefined)?.estado === "quitado";
    },
    false,
  );

/** Le cambia el nombre a uno de sus looks: el nombre que quedó, `null` si no sirve o ya no está, `"sin_respuesta"` si la base no contesta. */
export const renombrarLookEnBase = (usuarioWebId: string, lookId: string, nombre: string): Promise<string | null | "sin_respuesta"> =>
  leerConRespaldo<string | null | "sin_respuesta">(
    "tienda_renombrar_look_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_renombrar_look(${usuarioWebId}::uuid, ${lookId}::uuid, ${nombre}) as r`;
      const r = fila?.r as { estado?: string; nombre?: string } | undefined;
      return r?.estado === "renombrado" && typeof r.nombre === "string" ? r.nombre : null;
    },
    "sin_respuesta",
  );
