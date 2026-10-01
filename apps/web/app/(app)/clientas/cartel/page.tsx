import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTextosClub, getTiendasConWhatsapp } from "@/lib/clientas";
import { enlaceQrClub, textoVigente } from "@/lib/club-reglas";
import { Volver } from "@/components/ui/Volver";
import { CartelClub, type CartelDeTienda } from "@/components/clientas/CartelClub";

// El cartel del club para el mostrador (ADR-0288 tanda 1b, «Actualización 2026-09-30»): una hoja A4 por tienda con su
// número de WhatsApp cargado, con el QR GENÉRICO — abre el WhatsApp de esa tienda con el mensaje «quiero unirme al Club
// CAYLA…» listo para que ELLA lo envíe (sin código: todavía no tiene ficha). Cuando llega, la tienda le pide su documento
// en ese chat y la registra con «Llegó un mensaje de WhatsApp» (Clientas).
//
// Hereda la puerta del módulo de `clientas/layout.tsx` (`exigirModulo("clientas")`). Sin número no hay QR (principio 9): la
// pantalla lo dice y manda a Configuración ▸ Tiendas y caja.
export default async function CartelClubPage() {
  await requirePersonaActualV2();
  const [{ tiendas, falla }, textos] = await Promise.all([getTiendasConWhatsapp(), getTextosClub()]);
  const mensaje = textoVigente(textos, "mensaje_generico");

  const carteles: CartelDeTienda[] = [];
  const sinNumero: string[] = [];
  for (const t of tiendas) {
    const enlace = mensaje ? enlaceQrClub(t.whatsappNumero, mensaje.texto) : null;
    if (enlace && t.whatsappNumero) carteles.push({ id: t.id, tienda: t.nombre, numero: t.whatsappNumero, enlace });
    else if (!enlaceQrClub(t.whatsappNumero, "")) sinNumero.push(t.nombre);
  }

  return (
    <CartelClub
      carteles={carteles}
      sinNumero={sinNumero}
      sinMensaje={mensaje === null}
      falla={falla}
      volver={<Volver href="/clientas" a="Clientas" forma="boton" />}
    />
  );
}
