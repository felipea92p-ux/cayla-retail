import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";

// La puerta de Finanzas (ADR-0195): quien ve el Resumen (F10, módulo «Reportes financieros») llega a él; si no, a Gastos,
// que es donde Finanzas nació (F2). Si tampoco ve Gastos, el layout de Gastos lo manda a «Sin acceso», como antes.
export default async function FinanzasPage() {
  const persona = await requirePersonaActualV2();
  redirect(puede(persona, "verReportesFinancieros") ? "/finanzas/resumen" : "/finanzas/gastos");
}
