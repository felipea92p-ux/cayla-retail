import { exigirModulo } from "@/lib/persona-actual";
import { esMes, mesDe } from "@/lib/gastos-reglas";
import { getPanelCierre } from "@/lib/cierre";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { hoyLima } from "@/lib/apartados-reglas";
import { avisoAntesDelCorte, mesAntesDelCorte } from "@/lib/finanzas-arranque-reglas";
import { mesAnterior } from "@/lib/resultados-reglas";
import { CierreMes } from "@/components/finanzas/CierreMes";

// Finanzas ▸ Cierre de mes (ADR-0195 F9, ADR-0198). Lee en el servidor, en una sola función (`fn_cierre_panel`), y deja a
// una pieza cliente cerrar y reabrir. `?mes=2026-08` elige el mes (por defecto, el anterior: el mes en curso nunca se
// cierra); `?u=` abre una unidad (el id de la tienda o «empresa»).
//
// ADR-0332: si Finanzas cuenta desde un día posterior al mes que se pide (por defecto, el anterior), no hay nada que cerrar
// todavía: se dice desde cuándo se mide, en vez de abrir un mes vacío. La fecha se lee con `fn_parametros_finanzas`; quien
// entra solo con el módulo Cierre y no puede leerla ve el comportamiento de siempre (la base igual no cuenta lo anterior).
export default async function CierrePage({ searchParams }: { searchParams: Promise<{ mes?: string; u?: string }> }) {
  await exigirModulo("cierre_mes");
  const sp = await searchParams;
  const inicio = (await getParametrosFinanzas())?.inicioFinanzas ?? null;
  const pedido = esMes(sp.mes) ? sp.mes : mesAnterior(mesDe(hoyLima()));
  if (inicio && mesAntesDelCorte(pedido, inicio)) {
    return <CierreMes panel={null} falla={null} unidadPedida={null} avisoCorte={avisoAntesDelCorte(inicio)} />;
  }
  const panel = await getPanelCierre(esMes(sp.mes) ? sp.mes : undefined);
  return <CierreMes panel={panel.datos} falla={panel.falla} unidadPedida={sp.u ?? null} inicioFinanzas={inicio} />;
}
