import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getPlanCompra } from "@/lib/plan-compra";
import { PlanCampana } from "@/components/plan-compra/PlanCampana";

// Compras ▸ Plan de campaña (ADR-0349): cuánto comprar por categoría para diciembre 2026, con tres escenarios, y en enero, lo que
// se vendió de verdad. Solo lee aquí; cada categoría se guarda desde su ventana. Toda la empresa: el plan es de CAYLA, no de una sede.
export default async function PlanCompraPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("plan_compra");
  const { plan } = await searchParams;
  const { datos, falla, familias, preparacion, campanas, planPedidoNoExiste, propuesta, pedido, historia } = await getPlanCompra(plan);
  return (
    <PlanCampana
      datos={datos}
      falla={falla}
      familias={familias}
      preparacion={preparacion}
      campanas={campanas}
      puedeContar={veModulo(persona, "conteos")}
      veAnalisis={veModulo(persona, "analisis")}
      // Solo para «Fijar un mínimo» por tienda: `guardar_plan_compra_minimo` (de main, 20261012164000) todavía pide ser líder en la base.
      // El tope y el % de lo que sobra ya son de quien tiene el módulo (ADR-0387).
      esLider={persona.rol === "lider"}
      planPedidoNoExiste={planPedidoNoExiste}
      propuesta={propuesta}
      pedido={pedido}
      historia={historia}
    />
  );
}
