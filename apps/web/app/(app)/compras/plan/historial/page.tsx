import { exigirModulo } from "@/lib/persona-actual";
import { getHistorialPlan } from "@/lib/plan-compra";
import { HistorialCampanas } from "@/components/plan-compra/HistorialCampanas";

// Compras ▸ Plan de campaña ▸ Historial (ADR-0372, C3): lo que vendió cada tienda en cada campaña, un año a la vez. Solo lee.
export default async function HistorialPlanPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  await exigirModulo("plan_compra");
  const { anio } = await searchParams;
  const datos = await getHistorialPlan(anio);
  return <HistorialCampanas {...datos} />;
}
