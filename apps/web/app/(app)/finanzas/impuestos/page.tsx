import { exigirModulo } from "@/lib/persona-actual";
import { esMes } from "@/lib/gastos-reglas";
import { getPanelImpuestos } from "@/lib/impuestos";
import { ImpuestosPanel } from "@/components/ImpuestosPanel";

// Finanzas ▸ Impuestos (ADR-0195 F8). Lee en el servidor, en una sola función (`fn_impuestos_panel`), y deja a una pieza
// cliente las descargas para el contador. `?mes=2026-08` elige el mes; sin él, el anterior (el que se declara ahora).
export default async function ImpuestosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirModulo("impuestos");
  const { mes } = await searchParams;
  const panel = await getPanelImpuestos(esMes(mes) ? mes : undefined);
  return <ImpuestosPanel panel={panel.datos} falla={panel.falla} />;
}
