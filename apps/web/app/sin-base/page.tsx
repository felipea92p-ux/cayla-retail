import type { Metadata } from "next";
import { SinBase } from "@/components/SinBase";
import { rutaDeVuelta } from "@/lib/base-caida-reglas";

export const metadata: Metadata = { title: "Sin conexión con la base · CAYLA" };
// Nunca se guarda: lo que dice depende de si la base responde ahora.
export const dynamic = "force-dynamic";

// «Sin conexión con la base» (ADR-0450): a dónde va quien tiene la sesión abierta cuando la base no responde, en lugar del login con un
// «pide que te den de alta» que no era cierto. No pide sesión ni la toca (`lib/rutas-publicas.ts`), así que se abre igual con la sesión
// vencida o sin ella; `SinBase` pregunta cada tanto y, cuando la base contesta, vuelve a la pantalla de la que se salió.
export default async function SinBasePage({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const { desde } = await searchParams;
  return <SinBase desde={rutaDeVuelta(desde)} />;
}
