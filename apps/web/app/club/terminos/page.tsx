import type { Metadata } from "next";
import { connection } from "next/server";
import { PaginaLegalClub } from "@/components/clientas/PaginaLegalClub";

// PÚBLICA (ADR-0288 act. g): sin sesión, como el registro del club (`lib/rutas-publicas.ts`). `?t=<tienda>` dice de qué
// registro viene; sin él muestra el mismo texto (no depende de la tienda). El texto, su versión y su fecha: `PaginaLegalClub`.

export const metadata: Metadata = {
  title: "Términos — Club CAYLA",
  description: "Las condiciones del Club CAYLA: quién puede ser socia, el cupón de cumpleaños y el vale de aniversario.",
};

export default async function PaginaTerminosClub({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  // Cada visita lee el texto vigente: el que se publica al cambiar algo que nombra es el que vale desde ese momento.
  await connection();
  const { t } = await searchParams;
  return <PaginaLegalClub cual="terminos" t={typeof t === "string" ? t : null} />;
}
