import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { hrefTelar, mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { mesDe } from "@/lib/gastos-reglas";
import { mesDeLosEstados, paramsDe } from "@/lib/estados-financieros-reglas";
import { getPatrimonioCambios } from "@/lib/estados-financieros";
import { recomendacionesTuyo } from "@/lib/patrimonio-reglas";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { PatrimonioPanel } from "@/components/finanzas/estados/PatrimonioPanel";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";
import { SoloLiderFlujo } from "@/components/finanzas/SoloLiderFlujo";

// Finanzas ▸ Estados financieros ▸ ¿Lo tuyo creció? (cambios en el patrimonio; ADR-0585). Lee `fn_patrimonio_cambios` del mes de la barra
// (`?mes=`). Es de CAYLA entera, como el Balance entero: lo ve quien ve los Estados financieros de todo; una terminal, no.
export default async function PatrimonioPage({ searchParams }: { searchParams: Promise<{ mes?: string; sede?: string; ver?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  if (!veEstadosFinancierosDeTodoDe(persona)) return <SoloLiderFlujo pestana="patrimonio" />;
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = mesDeLosEstados(sp.mes, hoy);
  const params = paramsDe(sp);
  const href = (ruta: string) => hrefTelar(ruta, params, {}, { mismaPantalla: false, mesDeHoy: mesDelDia(hoy) });
  const patrimonio = await getPatrimonioCambios(mes);
  const recomendaciones = recomendacionesTuyo({ datos: patrimonio.datos, href });
  return (
    <div className="space-y-6">
      <CabeceraEstados activa="tuyo" mes={mes} sede={sedeDeLaUrl(sp)} hoy={hoy} params={params} />
      <div className={`grid items-start gap-6 ${recomendaciones.length ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        <PatrimonioPanel datos={patrimonio.datos} falla={patrimonio.falla} mes={mes} enCurso={mes === mesDe(hoy)} />
        {recomendaciones.length > 0 && <Recomendaciones recomendaciones={recomendaciones} />}
      </div>
    </div>
  );
}
