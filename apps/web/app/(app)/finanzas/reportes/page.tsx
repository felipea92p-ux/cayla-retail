import { exigirModulo, veDiarioDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDe, rangoMes } from "@/lib/gastos-reglas";
import { mesAnterior } from "@/lib/resultados-reglas";
import { getCampanas, getEstadoResultados, getUnidadesCerradas } from "@/lib/resultados";
import { getPresupuestoVsReal } from "@/lib/presupuesto";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { getVentasClaure } from "@/lib/cuenta-claure";
import { avisoAntesDelCorte, mesAntesDelCorte } from "@/lib/finanzas-arranque-reglas";
import { rangoDelMes } from "@/lib/flujo-caja-reglas";
import { verDeLaVista } from "@/lib/vista-global";
import { hrefTelar, mesDelDia, sedeDeLaUrl, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { filaDeLaSede, formaDe, mesDeLosEstados, paramsDe } from "@/lib/estados-financieros-reglas";
import { campanasDelMes, cascadaGanamos, filasDeSedes, metaDeVentas, porSede, pptoDeLaSede, recomendacionesGanamos } from "@/lib/ganamos-reglas";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { GanamosPanel } from "@/components/finanzas/estados/GanamosPanel";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";

// Finanzas ▸ Estados financieros ▸ ¿Ganamos? (ganancias y pérdidas; ADR-0195 F5, ADR-0585). Lee en el servidor, a la vez: el Estado de
// resultados del mes (a la fecha en el mes en curso), el presupuesto contra lo real (la raya de lo planeado: el presupuesto ya no tiene
// pantalla aparte) y las campañas. La sede y el mes son los de la barra del telar (`?sede=`, `?mes=`); `?comparar=1` pone en el formato
// formal cuánto cambió cada total contra el mes anterior. Quien ve todo (el líder, Configuración, Cierre de mes, CAYLA Global o este
// módulo, ADR-0585) elige la sede; una terminal mira la suya (lo decide la base).
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string; sede?: string; comparar?: string; forma?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = mesDeLosEstados(sp.mes, hoy);
  const enCurso = mes === mesDe(hoy);
  const previo = mesAnterior(mes);
  const comparar = sp.comparar === "1";
  const { desde, hasta } = rangoDelMes(mes, hoy);
  const antes = rangoMes(previo);
  const veTodo = veDiarioDeTodoDe(persona);
  const sede: ClaveSede = veTodo ? sedeDeLaUrl(sp) : (persona.ubicacionId ?? SEDE_TODAS);

  const [actual, anterior, parametros, cerradas, claure, ppto, campanas] = await Promise.all([
    getEstadoResultados(desde, hasta),
    comparar ? getEstadoResultados(antes.desde, antes.hasta) : Promise.resolve(null),
    getParametrosFinanzas(),
    // El mes en curso no se cierra: no hay nada que preguntar.
    enCurso ? Promise.resolve([] as string[]) : getUnidadesCerradas(mes),
    // Lo vendido de CLAURE no suma a nada de esta pantalla: la nota dice cuánto se dejó fuera (apoyo; sin permiso o sin CLAURE llega `null`).
    getVentasClaure(desde, hasta),
    // Apoyo: si el presupuesto o las campañas no se pueden leer, la cascada sale sin la raya de lo planeado y sin campañas.
    getPresupuestoVsReal(mes),
    getCampanas(),
  ]);
  // ADR-0332: un mes anterior a la fecha desde la que cuenta Finanzas sale vacío; se dice por qué en vez de dejar ceros mudos.
  const inicio = parametros?.inicioFinanzas ?? null;
  const avisoCorte = inicio && mesAntesDelCorte(mes, inicio) ? avisoAntesDelCorte(inicio) : null;

  const params = paramsDe(sp);
  const forma = formaDe(sp.forma);
  const mesDeHoy = mesDelDia(hoy);
  const href = (ruta: string, otra?: ClaveSede) => hrefTelar(ruta, params, otra ? { sede: otra } : {}, { mismaPantalla: false, mesDeHoy });

  const fila = filaDeLaSede(actual.datos, sede);
  const pptoSede = pptoDeLaSede(ppto.datos, sede);
  const tramos = fila ? cascadaGanamos(fila, pptoSede) : [];
  const meta = metaDeVentas(pptoSede);
  const deCadaSede = sede === SEDE_TODAS && veTodo ? porSede(actual.datos) : null;
  const delMes = campanasDelMes(campanas.datos, mes);
  const sedesCascada = deCadaSede ? filasDeSedes(deCadaSede, (c) => href("/finanzas/reportes", c)) : null;
  const recomendaciones = recomendacionesGanamos({ fila, sedes: deCadaSede, tramos, meta, campanas: delMes, enCurso, href });

  return (
    <div className="space-y-6">
      <CabeceraEstados pantalla="ganamos" mes={mes} sede={sede} hoy={hoy} params={params} forma={forma} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <GanamosPanel
          fila={fila}
          tramos={tramos}
          meta={meta}
          sedes={sedesCascada}
          campanas={delMes}
          hrefCampanas={href("/finanzas/reportes/campanas")}
          mes={mes}
          enCurso={enCurso}
          forma={forma}
          formal={{
            filas: actual.datos,
            anteriores: anterior?.datos ?? null,
            veTodo,
            cerradas,
            sedeActual: persona.ubicacionId,
            verParam: verDeLaVista(persona.vista, sedeDeLaUrl(sp)),
            mes,
            mesPrevio: previo,
            hoy,
            comparar,
            claure,
            fallas: [avisoCorte, actual.falla, anterior?.falla ?? null].filter((f): f is string => !!f),
          }}
        />
        <Recomendaciones recomendaciones={recomendaciones} />
      </div>
    </div>
  );
}
