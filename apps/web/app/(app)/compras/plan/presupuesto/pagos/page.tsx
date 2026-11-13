import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getPlanCompra } from "@/lib/plan-compra";
import { PagosPlan } from "@/components/plan-compra/PagosPlan";

// Compras ▸ Plan de campaña ▸ Presupuesto ▸ Cuándo se paga (ADR-0527, Felipe 2026-10-26, spike ⑤): cuándo se pide y se paga lo que el plan todavía pide comprar, el IGV y si Finanzas ve la compra.
// Lee lo mismo que las demás pestañas del Plan y, además, cómo se paga la campaña (`conPagos`). Lo que guarda es la lista de pagos y la visibilidad: nada se compra ni se paga aquí.
export default async function PagosPlanPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("plan_compra");
  const { plan } = await searchParams;
  const { datos, falla, preparacion, campanas, planPedidoNoExiste, propuesta, pedido, historia, descuentos, plazo, versiones, versionesFallo, pagos, pagado, pagosFallo, flujo } = await getPlanCompra(plan, { conPagos: true });
  return (
    <PagosPlan
      datos={datos}
      falla={falla}
      preparacion={preparacion}
      campanas={campanas}
      puedeContar={veModulo(persona, "conteos")}
      planPedidoNoExiste={planPedidoNoExiste}
      propuesta={propuesta}
      pedido={pedido}
      historia={historia}
      descuentos={descuentos}
      plazo={plazo}
      versiones={versiones}
      versionesFallo={versionesFallo}
      pagos={pagos}
      pagado={pagado}
      pagosFallo={pagosFallo}
      flujo={flujo}
    />
  );
}
