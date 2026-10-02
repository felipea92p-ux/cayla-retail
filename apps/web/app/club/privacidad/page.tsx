import type { Metadata } from "next";
import { connection } from "next/server";
import { PaginaLegalClub } from "@/components/clientas/PaginaLegalClub";

// PÚBLICA (ADR-0288 act. g): sin sesión, como el registro del club (`lib/rutas-publicas.ts`). `?t=<tienda>` dice de qué
// registro viene; sin él muestra el mismo texto (no depende de la tienda). El texto, su versión y su fecha: `PaginaLegalClub`.

export const metadata: Metadata = {
  title: "Política de privacidad — Club CAYLA",
  description: "Cómo trata CAYLA S.A.C. los datos de las socias del Club CAYLA.",
};

export default async function PaginaPrivacidadClub({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  // Cada visita lee el texto vigente: el que se publica al cambiar algo que nombra es el que vale desde ese momento.
  await connection();
  const { t } = await searchParams;
  return <PaginaLegalClub cual="privacidad" t={typeof t === "string" ? t : null} />;
}
