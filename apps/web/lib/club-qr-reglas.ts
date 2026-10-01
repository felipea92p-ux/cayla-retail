// El QR del Club CAYLA desde la tanda 1g (ADR-0288 act. g, G-1): UNO solo por tienda, el del cartel del mostrador, que abre la
// página de registro de esa tienda (`/club/<uuid>`, `app/club/[tienda]/page.tsx`). El ticket impreso lleva el mismo, el de la
// tienda de la venta. Reemplaza al QR personal de la caja (camino B) y al del WhatsApp de la tienda (camino A).
//
// Lógica pura: la usan el cartel (`components/clientas/CartelClub.tsx`) y Cobrar, al armar el ticket (`PuntoDeVenta` →
// `recibo.club` → `ReciboTermico`). Un QR que lleva a la página no depende del WhatsApp de la tienda: una tienda sin número
// igual tiene cartel; lo que no tiene es el saludo final de la página.

import { celularValido, codigoClubLegible, enlacePaginaClub } from "./club-reglas";
import { esUuid } from "./club-registro-reglas";
import type { ResumenClientaCaja } from "./club-acciones";

/** Lo que dice el ticket junto al QR, en una línea: «Únete al Club CAYLA: escanea y regístrate». El cartel del mostrador dice lo
 *  suyo (diseño C, «Estás invitada»): `club-cartel-reglas.ts`. */
export const UNETE_AL_CLUB = { titulo: "Únete al Club CAYLA", bajada: "Escanea y regístrate" } as const;

/** El origen tiene que ser una dirección web completa: un QR con una ruta suelta no abre nada en el celular de ella. */
const origenValido = (origen: string) => /^https?:\/\/[^/\s]+/.test(origen);

/* ------------------------------------------------------------------ El ticket impreso */

/** Lo que el ticket impreso lleva al pie para el club. */
export type ClubEnElTicket = { enlace: string; titulo: string; linea: string };

/**
 * El QR del club al pie del ticket: la página de registro de la tienda de la venta.
 *   · Venta sin clienta o a una que todavía no es socia: «Únete al Club CAYLA: escanea y regístrate».
 *   · Socia sin WhatsApp de promociones: con su código, para que lo active si quiere (en la página vuelve a poner su documento
 *     y queda «Actualizamos tus datos», con la casilla de WhatsApp).
 *   · Socia que ya recibe novedades: nada que pedirle, el ticket no lleva QR del club.
 * `origen`: `window.location.origin` de la caja; `resumen`: lo que la caja sabe de la clienta, o null sin clienta.
 */
export function clubEnElTicket(v: {
  origen: string;
  ubicacionId: string | null | undefined;
  resumen: Pick<ResumenClientaCaja, "esSocia" | "codigoClub" | "conPublicidad"> | null;
}): ClubEnElTicket | null {
  if (!v.ubicacionId || !esUuid(v.ubicacionId) || !origenValido(v.origen)) return null;
  if (v.resumen?.esSocia && v.resumen.conPublicidad) return null;
  const enlace = enlacePaginaClub(v.origen, v.ubicacionId);
  if (v.resumen?.esSocia) {
    const codigo = codigoClubLegible(v.resumen.codigoClub);
    return { enlace, titulo: codigo ? `Club CAYLA · Socia ${codigo}` : "Club CAYLA", linea: "¿Novedades por WhatsApp? Escanea y actívalas." };
  }
  return { enlace, titulo: "Club CAYLA", linea: `${UNETE_AL_CLUB.titulo}: ${UNETE_AL_CLUB.bajada.toLocaleLowerCase("es")}` };
}

/* ------------------------------------------------------------------ El cartel del mostrador */

/** Un cartel por tienda activa. `numero`: su WhatsApp (9 dígitos) para el pie, o null si no lo tiene cargado. */
export type CartelDeTienda = { id: string; tienda: string; numero: string | null; enlace: string };

/** Los carteles de las tiendas activas: cada QR abre el registro de SU tienda. Sin un origen completo, ninguno. */
export function cartelesDelClub(origen: string, tiendas: readonly { id: string; nombre: string; whatsappNumero: string | null }[]): CartelDeTienda[] {
  if (!origenValido(origen)) return [];
  return tiendas
    .filter((t) => esUuid(t.id))
    .map((t) => {
      const numero = (t.whatsappNumero ?? "").replace(/\s/g, "");
      return { id: t.id, tienda: t.nombre, numero: celularValido(numero) ? numero : null, enlace: enlacePaginaClub(origen, t.id) };
    });
}
