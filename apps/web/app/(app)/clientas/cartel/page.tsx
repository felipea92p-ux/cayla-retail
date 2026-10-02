import { EB_Garamond } from "next/font/google";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTextosDelCartel, getTiendasConWhatsapp } from "@/lib/clientas";
import { Volver } from "@/components/ui/Volver";
import { CartelClub } from "@/components/clientas/CartelClub";

// El cartel del club para el mostrador (ADR-0288 act. g, G-1; diseño C «Invitación», aprobado por Felipe el 2026-10-01): una
// hoja A4 por tienda activa con UN QR, el de la página de registro de esa tienda (`/club/<uuid>`). La clienta lo escanea y se
// une sola desde su celular; el ticket impreso lleva el mismo. El QR no depende del WhatsApp de la tienda: una tienda sin número
// igual tiene cartel (lo que no tiene es el saludo al final de la página, y la pantalla lo avisa).
//
// Dos lecturas: las tiendas y los beneficios del club (una sola, para todas: son de toda la empresa). Sin beneficios no hay
// cartel. Hereda la puerta del grupo de `clientas/layout.tsx` (Clientas o Avisos del club). La dirección del QR la arma el
// navegador con su propio origen (`CartelClub`): es el mismo dominio donde vive la página.

// La itálica de EB Garamond, solo para esta hoja: `app/layout.tsx` carga la familia en redonda (la de todo el ERP) y, sin el
// archivo itálico, el navegador inclina la redonda a la fuerza: «Estás invitada» no se vería como en el diseño aprobado. Se
// carga aquí y no en el layout para que el resto del ERP no descargue una fuente que no usa.
const garamondItalica = EB_Garamond({ subsets: ["latin"], style: "italic", weight: "400", variable: "--font-eb-garamond-italica", display: "swap" });

export default async function CartelClubPage() {
  await requirePersonaActualV2();
  const [{ tiendas, falla }, beneficios] = await Promise.all([getTiendasConWhatsapp(), getTextosDelCartel()]);
  return (
    <CartelClub
      tiendas={tiendas}
      falla={falla}
      textos={beneficios.textos}
      fallaTextos={beneficios.falla}
      fuente={garamondItalica.variable}
      volver={<Volver href="/clientas" a="Clientas" forma="boton" />}
    />
  );
}
