import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getPlanCompra } from "@/lib/plan-compra";
import { PresupuestoPlan } from "@/components/plan-compra/PresupuestoPlan";

// Compras ▸ Plan de campaña ▸ Presupuesto (Felipe 2026-10-26, spike ④): cuánto cuesta lo que el plan pide comprar, si cabe en el tope, dónde se va la plata y
// qué rinde cada sol. Lee lo mismo que la pestaña Plan (`getPlanCompra`): las dos muestran la misma campaña. Solo lee aquí; el plan se arma en el Plan.
export default async function PresupuestoPlanPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("plan_compra");
  const { plan } = await searchParams;
  const { datos, falla, preparacion, campanas, planPedidoNoExiste, propuesta, pedido, historia, descuentos, plazo, versiones, versionesFallo } = await getPlanCompra(plan);
  return (
    <PresupuestoPlan
      datos={datos}
      falla={falla}
      preparacion={preparacion}
      campanas={campanas}
      puedeContar={veModulo(persona, "conteos")}
      veAnalisis={veModulo(persona, "analisis")}
      // Solo para «Campaña nueva»: escribe en Etiquetas y sigue pidiendo ser líder en la base (igual que en el Plan).
      esLider={persona.rol === "lider"}
      planPedidoNoExiste={planPedidoNoExiste}
      propuesta={propuesta}
      pedido={pedido}
      historia={historia}
      descuentos={descuentos}
      plazo={plazo}
      versiones={versiones}
      versionesFallo={versionesFallo}
    />
  );
}
