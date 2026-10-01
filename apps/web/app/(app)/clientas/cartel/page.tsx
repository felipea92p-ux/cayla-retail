import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTiendasConWhatsapp } from "@/lib/clientas";
import { Volver } from "@/components/ui/Volver";
import { CartelClub } from "@/components/clientas/CartelClub";

// El cartel del club para el mostrador (ADR-0288 act. g, G-1): una hoja A4 por tienda activa con UN QR, el de la página de
// registro de esa tienda (`/club/<uuid>`). La clienta lo escanea y se une sola desde su celular; el ticket impreso lleva el
// mismo. El QR ya no depende del WhatsApp de la tienda: una tienda sin número igual tiene cartel (lo que no tiene es el
// saludo al final de la página, y la pantalla lo avisa).
//
// Hereda la puerta del módulo de `clientas/layout.tsx` (`exigirModulo("clientas")`). La dirección del QR la arma el navegador
// con su propio origen (`CartelClub`): es el mismo dominio donde vive la página.
export default async function CartelClubPage() {
  await requirePersonaActualV2();
  const { tiendas, falla } = await getTiendasConWhatsapp();
  return <CartelClub tiendas={tiendas} falla={falla} volver={<Volver href="/clientas" a="Clientas" forma="boton" />} />;
}
