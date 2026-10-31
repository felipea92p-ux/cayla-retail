import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDe, rangoMes } from "@/lib/gastos-reglas";
import { mesAnterior } from "@/lib/resultados-reglas";
import { getProyeccion } from "@/lib/flujo-caja";
import { getEstadoResultados } from "@/lib/resultados";
import { EscenariosPanel } from "@/components/finanzas/EscenariosPanel";
import { SoloLiderFlujo } from "@/components/finanzas/SoloLiderFlujo";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";

// Finanzas ▸ Estados financieros ▸ Escenarios (ADR-0195 F6; spike «¿Qué pasa si…?»). Lee dos cosas en el servidor —la proyección de la
// caja (`fn_flujo_caja_proyeccion`, 6 semanas) y el estado de resultados del último mes completo (F5)— y deja a la pieza
// cliente mover las palancas. No escribe nada. Es de CAYLA entera: quien tiene el módulo, salvo una terminal (como el flujo, ADR-0585).
export default async function EscenariosPage() {
  const persona = await exigirModulo("reportes_financieros");
  if (!veEstadosFinancierosDeTodoDe(persona)) return <SoloLiderFlujo pestana="escenarios" />;
  const hoy = hoyLima();
  const mesBase = mesAnterior(mesDe(hoy));
  const { desde, hasta } = rangoMes(mesBase);

  const [proyeccion, resultados] = await Promise.all([getProyeccion(6), getEstadoResultados(desde, hasta)]);
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Estados financieros"
        titulo="Escenarios"
        subtitulo="Qué pasa con la plata si cambias algo."
        volver={<Volver href="/finanzas/reportes" a="Estados financieros" />}
      />
      <EscenariosPanel
        proyeccion={proyeccion.datos}
        resultados={resultados.falla ? null : resultados.datos}
        mesBase={mesBase}
        fallas={[proyeccion.falla].filter((f): f is string => !!f)}
        hoy={hoy}
      />
    </div>
  );
}
