import { exigirModulo } from "@/lib/persona-actual";
import { esMes, mesDe } from "@/lib/gastos-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { getPanelImpuestos } from "@/lib/impuestos";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { sedeDeLaUrl, sedeElegida } from "@/lib/finanzas-telar-reglas";
import { ImpuestosPanel } from "@/components/ImpuestosPanel";

// Finanzas ▸ Impuestos (ADR-0195 F8, en «El telar» desde ADR-0493). Lee en el servidor, en una sola función (`fn_impuestos_panel`), y
// deja a una pieza cliente las descargas para el contador. El mes y la sede vienen de la mesa de mando: `?mes=2026-08` (sin él, el mes
// de hoy, como toda la barra) y `?sede=`. El IGV se declara junto, por el RUC de CAYLA: la sede elegida se nombra y la balanza dice
// que el reparto por sede todavía no existe (decisión de Felipe, «IGV del mes por lugar»).
export default async function ImpuestosPage({ searchParams }: { searchParams: Promise<{ mes?: string; sede?: string; ver?: string }> }) {
  await exigirModulo("impuestos");
  const sp = await searchParams;
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoyLima());
  const [panel, telar] = await Promise.all([getPanelImpuestos(mes), getSedesDelTelar()]);
  const sede = sedeElegida(sedeDeLaUrl(sp), telar.sedes, telar.veTodo, telar.propia);
  return <ImpuestosPanel panel={panel.datos} falla={panel.falla} sede={sede} sedes={telar.sedes} />;
}
