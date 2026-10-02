// El QR del Club CAYLA desde la tanda 1g (ADR-0288 act. g, G-1): UNO solo por tienda, el del cartel del mostrador, que abre la
// página de registro de esa tienda (`/club/<uuid>`, `app/club/[tienda]/page.tsx`). Reemplaza al QR personal de la caja (camino B)
// y al del WhatsApp de la tienda (camino A). El ticket impreso ya no lleva QR del club (Felipe 2026-10-01, ADR-0288 act. j).
//
// Lógica pura: la usa el cartel (`components/clientas/CartelClub.tsx`). Un QR que lleva a la página no depende del WhatsApp de
// la tienda: una tienda sin número igual tiene cartel; lo que no tiene es el saludo final de la página.

import { celularValido, enlacePaginaClub } from "./club-reglas";
import { esUuid } from "./club-registro-reglas";

/** El origen tiene que ser una dirección web completa: un QR con una ruta suelta no abre nada en el celular de ella. */
const origenValido = (origen: string) => /^https?:\/\/[^/\s]+/.test(origen);

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
