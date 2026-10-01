import type { Metadata } from "next";
import { connection } from "next/server";
import { PaginaClubPublica } from "@/components/clientas/PaginaClubPublica";
import { leerInvitacionClub } from "@/lib/club-pagina";

// La página PÚBLICA del QR personal de una socia (ADR-0288 act. c, «camino B»). Vive fuera de `app/(app)` a propósito:
// no hereda su `layout.tsx` (sesión, persona, menú lateral, cabecera del ERP); solo el raíz (tipografías, avisos, el
// loader general y `PaginaEstable`, ninguno pide sesión). `proxy.ts` la deja pasar sin sesión (`esRutaPublica`).
//
// Qué expone: el nombre de pila de la socia, su código y su celular a medias, y solo mientras la invitación está
// vigente (lo decide `fn_invitacion_club`, como `anon`). El token son ~96 bits aleatorios y sirve una sola vez.

export const metadata: Metadata = {
  // Raya larga con espacios, como «Retail — CAYLA»: la pestaña de ella dice de quién es, no el nombre del sistema interno.
  title: "Club — CAYLA",
  description: "Confirma si quieres recibir novedades de CAYLA por WhatsApp.",
  // Un enlace personal: ningún buscador lo indexa ni lo sigue, y el token no viaja como «Referer» a ninguna parte.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PaginaClub({ params }: { params: Promise<{ token: string }> }) {
  // Cada visita pregunta a la base: el enlace pasa de vigente a usado o vencido, y la página nunca se sirve de caché.
  await connection();
  const { token } = await params;
  const vista = await leerInvitacionClub(token);
  return <PaginaClubPublica token={token} vistaInicial={vista} />;
}
