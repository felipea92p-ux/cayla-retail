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
  // Arranca en la sede de la cabecera (Felipe 2026-10-12); en CAYLA Global, toda CAYLA. La key remonta al cambiar de sede.
  const sede = persona.vista === "sede" ? persona.ubicacionId : null;
  return <ResultadosCampana key={sede ?? "global"} {...datos} veAnalisis={veModulo(persona, "analisis")} sedeDeLaCabecera={sede} />;
}
