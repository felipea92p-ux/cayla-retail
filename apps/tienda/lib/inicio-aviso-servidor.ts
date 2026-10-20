import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { leerConRespaldo } from "./base";
import { hoyLima } from "./cuentas";
import { avisosDelClub, avisosDeRespuestas, claveDeCookie, claveDeCookiePanelVisto, type AvisoClub } from "./inicio-aviso";
import { leerMisRecomendaciones } from "./recomendaciones-servidor";

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

/** «CAYLA te respondió»: las respuestas del equipo a sus recomendaciones de los últimos 30 días, como avisos (el mismo aviso del Inicio).
 *  Lista vacía si la base no contestó o no tiene respuestas: la campanita las suma sin romper nada. Una lectura por petición. */
export const leerRespuestasDelClub = cache(async (usuarioWebId: string): Promise<AvisoClub[]> => {
  const mias = await leerMisRecomendaciones(usuarioWebId);
  return mias.estado === "ok" ? avisosDeRespuestas(mias.mias.recomendaciones, usuarioWebId, hoyLima()) : [];
});

/** Los avisos que la persona ya cerró con «Entendido» en este aparato (una cookie por aviso). */
export async function avisosVistos(): Promise<Set<string>> {
  const almacen = await cookies();
  return new Set(almacen.getAll().flatMap((c) => claveDeCookie(c.name) ?? []));
}

/** Los avisos que la persona ya vio al abrir el panel de la campanita («Entendido»): ocultan el globo, no el punto ni el número. */
export async function avisosEnPanel(): Promise<Set<string>> {
  const almacen = await cookies();
  return new Set(almacen.getAll().flatMap((c) => claveDeCookiePanelVisto(c.name) ?? []));
}

