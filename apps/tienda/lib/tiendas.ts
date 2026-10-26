import { z } from "zod";
import { enlaceMapaValido } from "@cayla-retail/shared/tienda-web-sede";

// Las tiendas que la web muestra (ADR-0408, actividad 6). Las arma la base en `retail.tienda_sedes()`: solo las que el ERP
// encendió en Configuración ▸ Tienda web y tienen nombre, dirección y WhatsApp. Aquí solo se valida la forma y se preparan
// los textos.
const esquemaSede = z.object({
  id: z.string().uuid(),
  // El nombre que lee el cliente («Trujillo»), nunca el del sistema («Tienda TRU»).
  nombre: z.string().trim().min(1),
  direccion: z.string().trim().min(1),
  // Opcional: sin él (o si llega raro) la tarjeta no lo muestra, pero la tienda sí sale.
  horario: z.string().trim().min(1).nullable().catch(null),
  // El mismo celular del QR del club: 9 dígitos que empiezan en 9, sin +51.
  whatsapp: z.string().regex(/^9\d{8}$/),
  // El enlace de Google Maps que pegó el ERP (Conf. Tienda ▸ Mapa). Opcional: sin él, o si llega algo que no es de Google Maps (la base ya
  // lo impide, pero esto es un botón en la cara del cliente), «Cómo llegar» busca la dirección.
  mapa: z.string().refine(enlaceMapaValido).nullable().catch(null),
});

export type Sede = z.infer<typeof esquemaSede>;

/** Sin base no hay tiendas: la sección de la portada no sale y la página lo dice (principio 9: se degrada, no se cae). */
export const SEDES_SIN_DATOS: Sede[] = [];

/** Lo que devuelve `tienda_sedes()`. Una tienda que llega mal formada se deja fuera; las demás se muestran igual. */
export function interpretarSedes(dato: unknown): Sede[] {
  const lista = z.object({ sedes: z.array(z.unknown()) }).safeParse(dato);
  if (!lista.success) return SEDES_SIN_DATOS;
  return lista.data.sedes.flatMap((s) => {
    const sede = esquemaSede.safeParse(s);
    return sede.success ? [sede.data] : [];
  });
}

/** «+51 987 654 321»: como se lee un celular en el Perú. */
export const whatsappLegible = (numero: string) => `+51 ${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6)}`;

/** El enlace que abre un chat con la tienda, sin mensaje armado: el del pedido llega con «Separar» (actividad 7). */
export const enlaceWhatsapp = (numero: string) => `https://wa.me/51${numero}`;

/**
 * «Cómo llegar»: si la tienda pegó su enlace de Google Maps, ese lugar exacto; si no, la dirección de la tienda en Google Maps (en el celular
 * abre la app de mapas). El ERP guarda la dirección escrita, sin coordenadas, así que se busca tal cual, con el nombre web de la tienda
 * —que es su ciudad: «Trujillo», «Lima»— y el país, para que «Jr. Pizarro 512» no caiga en otra ciudad. Es el formato público y estable
 * de Google (`api=1`), sin llave.
 */
export const enlaceMapa = (sede: Pick<Sede, "nombre" | "direccion"> & { mapa?: string | null }) =>
  sede.mapa && enlaceMapaValido(sede.mapa)
    ? sede.mapa
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sede.direccion}, ${sede.nombre}, Perú`)}`;

/**
 * Cuántas tarjetas van por fila en «Nuestras tiendas» desde la tablet, para que la sección quede pareja con cualquier cantidad de
 * tiendas (revisión «a nivel mundial», 2026-10-16: con 2 tiendas en una grilla de 3 quedaba un tercio vacío): una sola ocupa todo el
 * ancho (y su tarjeta se acomoda a lo ancho), dos y cuatro van de a dos, tres y desde cinco, de a tres. Solo presentación: qué tiendas
 * salen lo decide la base (`tienda_sedes`).
 */
export function columnasDeTiendas(cuantas: number): 1 | 2 | 3 {
  if (cuantas <= 1) return 1;
  if (cuantas === 2 || cuantas === 4) return 2;
  return 3;
}
