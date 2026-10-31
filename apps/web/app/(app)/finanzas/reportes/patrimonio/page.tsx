import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { mesDeLosEstados, paramsDe } from "@/lib/estados-financieros-reglas";
import { getPatrimonioCambios } from "@/lib/estados-financieros";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { PatrimonioPanel } from "@/components/finanzas/estados/PatrimonioPanel";
import { SoloLiderFlujo } from "@/components/finanzas/SoloLiderFlujo";

// Finanzas ▸ Estados financieros ▸ ¿Lo tuyo creció? (cambios en el patrimonio; ADR-0585). Lee `fn_patrimonio_cambios` del mes de la barra
// (`?mes=`). Es de CAYLA entera, como el Balance entero: lo ve quien ve los Estados financieros de todo; una terminal, no.
export default async function PatrimonioPage({ searchParams }: { searchParams: Promise<{ mes?: string; sede?: string; ver?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  if (!veEstadosFinancierosDeTodoDe(persona)) return <SoloLiderFlujo pestana="patrimonio" />;
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = mesDeLosEstados(sp.mes, hoy);
  const patrimonio = await getPatrimonioCambios(mes);
  return (
    <div className="space-y-6">
      <CabeceraEstados activa="tuyo" mes={mes} sede={sedeDeLaUrl(sp)} hoy={hoy} params={paramsDe(sp)} />
      <PatrimonioPanel datos={patrimonio.datos} falla={patrimonio.falla} mes={mes} />
    </div>
  );
}
