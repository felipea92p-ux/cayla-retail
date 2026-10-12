import { exigirModulo } from "@/lib/persona-actual";
import { getResultadosPlan } from "@/lib/plan-compra";
import { ResultadosCampana } from "@/components/plan-compra/ResultadosCampana";

// Compras ▸ Plan de campaña ▸ Resultados (ADR-0372, C6): lo que se vendió de verdad en una campaña, por tienda, prenda y color. Solo lee.
export default async function ResultadosPlanPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  await exigirModulo("plan_compra");
  const { plan } = await searchParams;
  const datos = await getResultadosPlan(plan);
  return <ResultadosCampana {...datos} />;
}
