import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { leerConRespaldo } from "./base";
import { hoyLima } from "./cuentas";
import { avisosDelClub, claveDeCookie, type AvisoClub } from "./inicio-aviso";

// El aviso al entrar en el servidor (ADR-0408; Felipe, 2026-10-14): qué tiene la persona a su favor en el Club, por la puerta angosta
// (`retail.tienda_mis_avisos_del_club`, 20261015045000: no escribe nada, ni la visita de «Mi cuenta»), y qué avisos ya cerró en este
// aparato (sus cookies). Si la base no contesta, no sale ningún aviso: el Inicio se ve igual y «Mi cuenta» los sigue mostrando.

/** Lo que está a favor de esa cuenta, en palabras. null si la base no contestó o no hay cuenta: no sale aviso. Una sola lectura por
 *  petición (`cache` de React): el aviso del Inicio y la campanita de la cabecera comparten la misma. */
export const leerAvisosDelClub = cache(
  (usuarioWebId: string): Promise<AvisoClub[] | null> =>
    leerConRespaldo(
      "tienda_mis_avisos_del_club_fallo",
      async (db) => {
        const [fila] = await db`select retail.tienda_mis_avisos_del_club(${usuarioWebId}::uuid) as r`;
        return fila?.r ? avisosDelClub(fila.r, usuarioWebId, hoyLima()) : null;
      },
      null,
    ),
);

/** Los avisos que la persona ya cerró con «Entendido» en este aparato (una cookie por aviso). */
export async function avisosVistos(): Promise<Set<string>> {
  const almacen = await cookies();
  return new Set(almacen.getAll().flatMap((c) => claveDeCookie(c.name) ?? []));
}
