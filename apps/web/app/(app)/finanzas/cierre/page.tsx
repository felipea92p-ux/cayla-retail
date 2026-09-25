import { exigirModulo } from "@/lib/persona-actual";
import { esMes } from "@/lib/gastos-reglas";
import { getPanelCierre } from "@/lib/cierre";
import { CierreMes } from "@/components/finanzas/CierreMes";

// Finanzas ▸ Cierre de mes (ADR-0195 F9, ADR-0198). Lee en el servidor, en una sola función (`fn_cierre_panel`), y deja a
// una pieza cliente cerrar y reabrir. `?mes=2026-08` elige el mes (por defecto, el anterior: el mes en curso nunca se
// cierra); `?u=` abre una unidad (el id de la tienda o «empresa»).
export default async function CierrePage({ searchParams }: { searchParams: Promise<{ mes?: string; u?: string }> }) {
  await exigirModulo("cierre_mes");
  const sp = await searchParams;
  const panel = await getPanelCierre(esMes(sp.mes) ? sp.mes : undefined);
  return <CierreMes panel={panel.datos} falla={panel.falla} unidadPedida={sp.u ?? null} />;
}
