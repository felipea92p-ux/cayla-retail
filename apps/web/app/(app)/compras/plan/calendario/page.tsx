import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getCalendarioPlan } from "@/lib/plan-compra-calendario-servidor";
import { CalendarioPlan } from "@/components/plan-compra/CalendarioPlan";

// Compras ▸ Plan de campaña ▸ Calendario (Felipe 2026-10-26, spike ①, ADR-0525): con cuáles campañas te quedas el año, cuáles se repiten y cuáles descansan, con lo que dijo tu historia de cada
// una. Lee lo mismo que las demás pestañas del Plan (la misma campaña y los mismos avisos) y, además, la historia de ventas de la tienda con más años. Lo que se decide aquí es de TU plan de compra:
// se guarda por las funciones del calendario, que piden el módulo «Plan de campaña» (cualquiera que lo tenga puede decidir; la base lo vuelve a comprobar).
export default async function CalendarioPlanPage({ searchParams }: { searchParams: Promise<{ plan?: string; anio?: string; vista?: string; hoja?: string }> }) {
  // Se repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("plan_compra");
  const { plan, anio, vista, hoja } = await searchParams;
  const { datos, falla, preparacion, campanas, planPedidoNoExiste, propuesta, pedido, historia, descuentos, plazo, versiones, versionesFallo, calendarioFallo, evidencias, tienda, historiaFallo } = await getCalendarioPlan(plan);
  return (
    <CalendarioPlan
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
      calendarioFallo={calendarioFallo}
      evidencias={evidencias}
      tienda={tienda}
      historiaFallo={historiaFallo}
      anio={anio}
      vista={vista}
      hoja={hoja}
    />
  );
}
