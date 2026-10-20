import type { Metadata } from "next";
import { connection } from "next/server";
import { PaginaLegalClub } from "@/components/clientas/PaginaLegalClub";
import { leerPuntosDelClub } from "@/lib/club-pagina";
import { descripcionTerminos } from "@/lib/club-registro-reglas";

// PÚBLICA (ADR-0288 act. g): sin sesión, como el registro del club (`lib/rutas-publicas.ts`). `?t=<tienda>` dice de qué
// registro viene; sin él muestra el mismo texto (no depende de la tienda). El texto, su versión y su fecha: `PaginaLegalClub`.

// La descripción (la que muestra un buscador o un enlace compartido) habla de puntos con las cifras vigentes de la base, nunca escritas
// aquí; sin respuesta, lo mismo sin cifras. La página la lee una sola vez por visita (`leerPuntosDelClub` es `cache`).
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: "Términos — Club CAYLA", description: descripcionTerminos(await leerPuntosDelClub()) };
}

export default async function PaginaTerminosClub({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  // Cada visita lee el texto vigente: el que se publica al cambiar algo que nombra es el que vale desde ese momento.
  await connection();
  const { t } = await searchParams;
  return <PaginaLegalClub cual="terminos" t={typeof t === "string" ? t : null} />;
}
