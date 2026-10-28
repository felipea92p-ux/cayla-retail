import { exigirModulo } from "@/lib/persona-actual";
import { getHistorialPlan } from "@/lib/plan-compra";
import { HistorialCampanas } from "@/components/plan-compra/HistorialCampanas";

// Compras ▸ Plan de campaña ▸ Historial (ADR-0372, C3): lo que vendió cada tienda en cada campaña, un año a la vez. Solo lee.
export default async function HistorialPlanPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("plan_compra");
  const { anio } = await searchParams;
  const datos = await getHistorialPlan(anio);
  // La sede de la cabecera (Felipe 2026-10-12): su tienda va primero y su detalle abre en ella. La key remonta al cambiar de sede.
  const sede = persona.vista === "sede" ? persona.ubicacionId : null;
  return <HistorialCampanas key={sede ?? "global"} {...datos} sedeDeLaCabecera={sede} />;
}
