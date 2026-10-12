import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getResultadosPlan } from "@/lib/plan-compra";
import { ResultadosCampana } from "@/components/plan-compra/ResultadosCampana";

// Compras ▸ Plan de campaña ▸ Resultados (ADR-0372, C6): lo que se vendió de verdad en una campaña, por tienda, prenda y color. Solo lee.
export default async function ResultadosPlanPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("plan_compra");
  const { plan } = await searchParams;
  const datos = await getResultadosPlan(plan);
  // Los accesos a Análisis (la prenda exacta que se acaba o no se vende) solo se ofrecen a quien ve ese módulo.
  return <ResultadosCampana {...datos} veAnalisis={veModulo(persona, "analisis")} />;
}
