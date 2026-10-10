import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getPlanCompra } from "@/lib/plan-compra";
import { PlanCampana } from "@/components/plan-compra/PlanCampana";

// Compras ▸ Plan de campaña (ADR-0349): cuánto comprar por categoría para diciembre 2026, con tres escenarios, y en enero, lo que
// se vendió de verdad. Solo lee aquí; cada categoría se guarda desde su ventana. Toda la empresa: el plan es de CAYLA, no de una sede.
export default async function PlanCompraPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("plan_compra");
  const { plan } = await searchParams;
  const { datos, falla, familias, preparacion } = await getPlanCompra(plan);
  return <PlanCampana datos={datos} falla={falla} familias={familias} preparacion={preparacion} puedeContar={veModulo(persona, "conteos")} />;
}
