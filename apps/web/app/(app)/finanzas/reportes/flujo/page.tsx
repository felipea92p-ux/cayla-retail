import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDe, rangoMes } from "@/lib/gastos-reglas";
import { leerSemanas, proyectar } from "@/lib/flujo-caja-reglas";
import { etiquetaDelPeriodo, leerPeriodo, periodosAnteriores } from "@/lib/estados-periodo";
import { columnasDeCascada, comparadaDelFlujo, informeDelFlujo, lecturaDelFlujo, partesDelEstadoFlujo } from "@/lib/estados-flujo";
import { textoDeVerMas } from "@/lib/estados-partes";
import { getFlujoReal, getProyeccion } from "@/lib/flujo-caja";
import { getEstadoResultados } from "@/lib/resultados";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { mesAnterior } from "@/lib/resultados-reglas";
import { hrefTelar, mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { filaDeLaSede, paramsDe } from "@/lib/estados-financieros-reglas";
import { recomendacionesPlata } from "@/lib/plata-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { CalendarX } from "lucide-react";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { CascadaDeColumnas } from "@/components/finanzas/estados/CascadaDeColumnas";
import { EstadoEnInforme } from "@/components/finanzas/estados/EstadoEnInforme";
import { MasDelEstado } from "@/components/finanzas/estados/MasDelEstado";
import { MasDelFlujo, NoCubre, NoCuadra } from "@/components/finanzas/estados/PlataPanel";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";
import { SoloLiderFlujo } from "@/components/finanzas/SoloLiderFlujo";

// Finanzas ▸ Estados financieros ▸ Flujo de efectivo (ADR-0195 F6, ADR-0585, ADR-0611). Lee en el servidor, a la vez: lo que entró y salió en las fechas del calendario y en los dos
// períodos de antes, lo que viene (`?semanas=4|6|8`), la ganancia de esas fechas (para decir por qué la plata no la siguió) y el último mes completo (lo que usa «¿Y si…?»). Es de CAYLA
// entera: lo ve quien tiene el módulo (`fn_exigir_estados_financieros_de_todo`); una terminal no, y la pantalla lo explica en lugar de fallar.
export default async function FlujoPage({ searchParams }: { searchParams: Promise<{ mes?: string; desde?: string; hasta?: string; semanas?: string; sede?: string; ver?: string; forma?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  if (!veEstadosFinancierosDeTodoDe(persona)) return <SoloLiderFlujo pestana="flujo" />;
  const sp = await searchParams;
  const hoy = hoyLima();
  const periodo = leerPeriodo(sp, hoy);
  const { desde, hasta, mes } = periodo;
  const semanas = leerSemanas(sp.semanas);
  const mesBase = mesAnterior(mesDe(hoy));
  const base = rangoMes(mesBase);
  const parametros = await getParametrosFinanzas();
  const anteriores = periodosAnteriores(periodo, hoy, parametros?.inicioFinanzas ?? null);

  const [real, comparadas, proyeccion, er, erBase] = await Promise.all([
    getFlujoReal(desde, hasta),
    Promise.all(anteriores.map(async (c) => ({ etiqueta: c.etiqueta, lectura: await getFlujoReal(c.desde, c.hasta) }))),
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
  const leidas = comparadas.map((c) => comparadaDelFlujo(c.etiqueta, c.lectura));
  const noSeComparan = leidas.flatMap((c) => (c.motivo ? [c.motivo] : []));
  const partes = real.datos ? partesDelEstadoFlujo({ real: real.datos, comparadas: leidas, etiquetaActual: etiquetaDelPeriodo(periodo), periodo }) : [];

  return (
    <div className="space-y-4">
      <CabeceraEstados pantalla="plata" mes={mes} sede={sedeDeLaUrl(sp)} hoy={hoy} params={params} />
      {real.falla ? (
        <Aviso tono="error">{real.falla}</Aviso>
      ) : !real.datos ? (
        <Vacio tamano="chico" icono={<CalendarX />}>
          No entró ni salió plata en estas fechas.
        </Vacio>
      ) : (
        <EstadoEnInforme
          nombre={`Tu plata · ${periodo.titulo}`}
          lectura={lecturaDelFlujo(real.datos, ganancia, periodo)}
          grafico={<CascadaDeColumnas columnas={columnasDeCascada(partes)} etiqueta="Por qué cambió tu plata" />}
          guiaRespuesta="fin-plata.respuesta"
          guiaInforme="fin-plata.partes"
          guiaContador="fin-plata.libro"
          aviso={
            <>
              <NoCuadra real={real.datos} />
              <NoCubre real={real.datos} />
              {noSeComparan.map((m) => (
                <Aviso key={m} tono="info" chico>
                  {m}
                </Aviso>
              ))}
            </>
          }
          informe={informeDelFlujo({ real: real.datos, partes, comparadas: leidas, etiquetaActual: etiquetaDelPeriodo(periodo) })}
        />
      )}
      <Recomendaciones recomendaciones={recomendaciones} />
      <MasDelEstado texto={textoDeVerMas(["lo que viene", "qué pasa si cambias algo", "semana a semana"])!} guia="fin-plata.mas">
        <MasDelFlujo real={real.datos} proyeccion={proyeccion.datos} falla={proyeccion.falla} semanas={semanas} hoy={hoy} escenarios={{ resultados: erBase.falla ? null : erBase.datos, mesBase }} />
      </MasDelEstado>
    </div>
  );
}
