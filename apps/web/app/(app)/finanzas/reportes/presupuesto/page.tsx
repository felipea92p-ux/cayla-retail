import { redirect } from "next/navigation";
import { hrefTelar, mesDelDia } from "@/lib/finanzas-telar-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { paramsDe } from "@/lib/estados-financieros-reglas";

// El presupuesto ya no tiene pantalla aparte (Felipe 2026-10-30, ADR-0585): vive dentro de ¿Ganamos?, como la raya de lo planeado sobre
// cada gasto y, al abrirlo, lo real contra lo planeado de cada parte. Esta dirección queda para no romper un enlace guardado: lleva ahí,
// con la sede y el mes. Los topes se siguen poniendo en Configuración ▸ Presupuesto.
export default async function PresupuestoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  redirect(hrefTelar("/finanzas/reportes", paramsDe(sp), {}, { mismaPantalla: false, mesDeHoy: mesDelDia(hoyLima()) }));
}
