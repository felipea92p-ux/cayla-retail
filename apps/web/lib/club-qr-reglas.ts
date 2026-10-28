// El QR del Club CAYLA desde la tanda 1g (ADR-0288 act. g, G-1): UNO solo por tienda, el del cartel del mostrador. Reemplaza al QR
// personal de la caja (camino B) y al del WhatsApp de la tienda (camino A). El ticket impreso ya no lleva QR del club (Felipe
// 2026-10-01, ADR-0288 act. j).
//
// Desde el 2026-10-16 el Club empieza al crear la cuenta en la tienda online (Felipe: «al escanear el cartel lleva al link
// tienda.cayla.pe»; 20261016154000): el QR abre la tienda, la misma para todas las tiendas. Los carteles impresos antes llevan a
// `/club/<uuid>` del ERP, que ahora redirige ahí (`app/club/[tienda]/page.tsx`), así no hay que reimprimirlos.
//
// Lógica pura: la usan el cartel (`components/clientas/CartelClub.tsx`) y esa página vieja del cartel. El WhatsApp de cada tienda
// sigue en la vista previa del cartel, para que el líder vea cuál le falta cargar.

import { celularValido } from "./club-reglas";

/** La tienda online, donde se crea la cuenta y se entra al Club: la abren el QR del cartel y la página vieja del cartel. */
export const DIRECCION_TIENDA_ONLINE = "https://tienda.cayla.pe";

/**
 * Lo que abre el QR del cartel (y la página vieja del cartel): la tienda online con su marca de camino (ADR-0495). Sin ella, quien escanea
 * cuenta como «Directo» en Tienda web ▸ Tráfico, porque un QR no dice de dónde viene; con ella, como «QR en tienda». La tienda conserva la
 * marca al llevar de la portada al inicio (`redireccionDelProxy`).
 */
export const ENLACE_DEL_CARTEL = `${DIRECCION_TIENDA_ONLINE}/?utm_source=qr`;

/* ------------------------------------------------------------------ El cartel del mostrador */

/** Un cartel por tienda activa. `numero`: su WhatsApp (9 dígitos) para la vista previa, o null si no lo tiene cargado. */
export type CartelDeTienda = { id: string; tienda: string; numero: string | null; enlace: string };

/** Los carteles de las tiendas activas: cada QR abre la tienda online, marcado como «QR en tienda». */
export function cartelesDelClub(tiendas: readonly { id: string; nombre: string; whatsappNumero: string | null }[]): CartelDeTienda[] {
  return tiendas.map((t) => {
    const numero = (t.whatsappNumero ?? "").replace(/\s/g, "");
    return { id: t.id, tienda: t.nombre, numero: celularValido(numero) ? numero : null, enlace: ENLACE_DEL_CARTEL };
  });
}
