import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getPlanCompra } from "@/lib/plan-compra";
import { PlanCampana } from "@/components/plan-compra/PlanCampana";

// Compras ▸ Plan de campaña (ADR-0349): cuánto comprar por categoría para diciembre 2026, con tres escenarios, y en enero, lo que
// se vendió de verdad. Solo lee aquí; cada categoría se guarda desde su ventana. Toda la empresa: el plan es de CAYLA, no de una sede.
export default async function PlanCompraPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("plan_compra");
  const { plan } = await searchParams;
  const { datos, falla, familias, preparacion, campanas, planPedidoNoExiste } = await getPlanCompra(plan);
  return (
    <PlanCampana
      datos={datos}
      falla={falla}
      familias={familias}
      preparacion={preparacion}
      campanas={campanas}
      puedeContar={veModulo(persona, "conteos")}
      // ADR-0387 (Felipe 2026-10-12): crear, editar, quitar y restaurar una campaña y fijar su tope son de quien tiene el módulo, sea
      // líder o no (la base ya no pide más). La prop conserva su nombre por ahora: hay un PR abierto sobre PlanCampana (#977).
      esLider={veModulo(persona, "plan_compra")}
      planPedidoNoExiste={planPedidoNoExiste}
    />
  );
}
