import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDe, rangoMes } from "@/lib/gastos-reglas";
import { leerSemanas, proyectar, rangoDelMes } from "@/lib/flujo-caja-reglas";
import { getFlujoReal, getProyeccion } from "@/lib/flujo-caja";
import { getEstadoResultados } from "@/lib/resultados";
import { mesAnterior } from "@/lib/resultados-reglas";
import { hrefTelar, mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { filaDeLaSede, formaDe, mesDeLosEstados, paramsDe } from "@/lib/estados-financieros-reglas";
import { fraseDeLaPlata, recomendacionesPlata } from "@/lib/plata-reglas";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { PlataPanel } from "@/components/finanzas/estados/PlataPanel";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";
import { SoloLiderFlujo } from "@/components/finanzas/SoloLiderFlujo";

// Finanzas ▸ Estados financieros ▸ ¿Dónde está la plata? (flujo de efectivo; ADR-0195 F6, ADR-0585). Lee en el servidor, a la vez: lo que
// entró y salió en el mes de la barra (`?mes=`, hasta hoy en el mes en curso), lo que viene (`?semanas=4|6|8`), la ganancia del mes (para
// decir por qué la plata no la siguió) y el último mes completo (lo que usa «¿Y si…?», que es Escenarios). Es de CAYLA entera: lo ve quien
// tiene el módulo (`fn_exigir_estados_financieros_de_todo`); una terminal no, y la pantalla lo explica en lugar de fallar.
export default async function FlujoPage({ searchParams }: { searchParams: Promise<{ mes?: string; semanas?: string; sede?: string; ver?: string; forma?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  if (!veEstadosFinancierosDeTodoDe(persona)) return <SoloLiderFlujo pestana="flujo" />;
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = mesDeLosEstados(sp.mes, hoy);
  const enCurso = mes === mesDe(hoy);
  const semanas = leerSemanas(sp.semanas);
  const { desde, hasta } = rangoDelMes(mes, hoy);
  const mesBase = mesAnterior(mesDe(hoy));
  const base = rangoMes(mesBase);

  const [real, proyeccion, er, erBase] = await Promise.all([
    getFlujoReal(desde, hasta),
    getProyeccion(semanas),
    getEstadoResultados(desde, hasta),
    getEstadoResultados(base.desde, base.hasta),
  ]);
  const params = paramsDe(sp);
  const href = (ruta: string) => hrefTelar(ruta, params, {}, { mismaPantalla: false, mesDeHoy: mesDelDia(hoy) });
  // La plata es de CAYLA entera: la ganancia con que se compara es la de CAYLA (el consolidado), mire la sede que mire la barra.
  const ganancia = er.falla ? null : (filaDeLaSede(er.datos, "todas")?.resultado ?? null);
  const recomendaciones = recomendacionesPlata({
    real: real.datos,
    proyeccion: proyeccion.datos,
    semanas: proyeccion.datos ? proyectar(proyeccion.datos) : [],
    ganancia,
    href,
  });

  return (
    <div className="space-y-6">
      <CabeceraEstados activa="plata" mes={mes} sede={sedeDeLaUrl(sp)} hoy={hoy} params={params} forma={formaDe(sp.forma)} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <PlataPanel
          real={real.datos}
          proyeccion={proyeccion.datos}
          frase={real.datos ? fraseDeLaPlata(real.datos, ganancia) : null}
          fallas={[real.falla, proyeccion.falla].filter((f): f is string => !!f)}
          semanas={semanas}
          enCurso={enCurso}
          hoy={hoy}
          escenarios={{ resultados: erBase.falla ? null : erBase.datos, mesBase }}
          mes={mes}
          forma={formaDe(sp.forma)}
        />
        <Recomendaciones recomendaciones={recomendaciones} />
      </div>
    </div>
  );
}
