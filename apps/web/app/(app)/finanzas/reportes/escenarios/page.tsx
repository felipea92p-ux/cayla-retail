import { redirect } from "next/navigation";
import { hrefTelar, mesDelDia } from "@/lib/finanzas-telar-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { paramsDe } from "@/lib/estados-financieros-reglas";

// Escenarios ya no tiene pantalla aparte (ADR-0585): es «¿Y si…?», dentro de ¿Dónde está la plata?, donde se mira la plata que viene.
// Esta dirección queda para no romper un enlace guardado (el Resumen la usaba): lleva ahí, con la sede y el mes.
export default async function EscenariosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  redirect(`${hrefTelar("/finanzas/reportes/flujo", paramsDe(sp), {}, { mismaPantalla: false, mesDeHoy: mesDelDia(hoyLima()) })}#y-si`);
}
