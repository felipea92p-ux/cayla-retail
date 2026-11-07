import { Suspense } from "react";
import { exigirModulo, veDiarioDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDe } from "@/lib/gastos-reglas";
import { avisosER, columnasER, leerVerER, mesAnterior, mesNombre } from "@/lib/resultados-reglas";
import { getCampanas, getEstadoResultados, getEstadoResultadosAEstaFecha, getFaltaDelMes, getUnidadesCerradas } from "@/lib/resultados";
import { ventaParaElMesEntero } from "@/lib/equilibrio-mes-reglas";
import { getPresupuestoVsReal } from "@/lib/presupuesto";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { getVentasClaure } from "@/lib/cuenta-claure";
import { getCuadreVentas } from "@/lib/cuadre-ventas";
import { cuadroVentas } from "@/lib/cuadre-ventas-reglas";
import { avisoAntesDelCorte, mesAntesDelCorte } from "@/lib/finanzas-arranque-reglas";
import { etiquetaDelPeriodo, leerPeriodo, periodoAnterior, periodosAnteriores } from "@/lib/estados-periodo";
import { informeDeGanancias, lecturaDeGanancias, partesDeGanancias } from "@/lib/estados-ganancias";
import { textoDeVerMas } from "@/lib/estados-partes";
import { verDeLaVista } from "@/lib/vista-global";
import { hrefTelar, mesDelDia, SEDE_EMPRESA, sedeDeLaUrl, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { filaDeLaSede, paramsDe } from "@/lib/estados-financieros-reglas";
import { campanasDelMes, cascadaGanamos, filasDeSedes, metaDeVentas, porSede, pptoDeLaSede, recomendacionesGanamos } from "@/lib/ganamos-reglas";
import { conIgvDeLasVentasDe } from "@/lib/igv-ventas";
import { getCostoEstimado } from "@/lib/costo-estimado";
import { notaCostoEstimado } from "@/lib/costo-estimado-reglas";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { CuadreVentas } from "@/components/finanzas/estados/CuadreVentas";
import { Aviso } from "@/components/ui/Aviso";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { EstadoResultadosPanel } from "@/components/finanzas/EstadoResultadosPanel";
import { EstadoEnInforme } from "@/components/finanzas/estados/EstadoEnInforme";
import { LineaDeGanancias, LineaEsperando } from "@/components/finanzas/estados/LineaDeGanancias";
import { MasDeGanancias } from "@/components/finanzas/estados/MasDeGanancias";
import { MasDelEstado } from "@/components/finanzas/estados/MasDelEstado";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";

// Finanzas ▸ Estados financieros ▸ Ganancias y pérdidas (ADR-0195 F5, ADR-0585, ADR-0611). Lee en el servidor, a la vez: el Estado de resultados de las fechas del
// calendario y de los dos períodos de antes, el presupuesto contra lo real y las campañas (estos dos, si se mira un mes). La línea de los meses llega aparte, con su
// `Suspense`. La sede es la de la barra del telar (`?sede=`); `?comparar=1` pone en el cuadro por sede cuánto cambió cada total contra el mes anterior. Quien ve todo (el líder, Configuración, Cierre de mes, CAYLA Global o este
// módulo, ADR-0585) elige la sede; una terminal mira la suya (lo decide la base).
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ mes?: string; desde?: string; hasta?: string; ver?: string; sede?: string; comparar?: string; forma?: string; cuadre?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const periodo = leerPeriodo(sp, hoy);
  const { desde, hasta, mes, unMes } = periodo;
  const enCurso = mes === mesDe(hoy);
  const previo = mesAnterior(mes);
  const veTodo = veDiarioDeTodoDe(persona);
  const sede: ClaveSede = veTodo ? sedeDeLaUrl(sp) : (persona.ubicacionId ?? SEDE_TODAS);

  const parametros = await getParametrosFinanzas();
  const inicio = parametros?.inicioFinanzas ?? null;
  // Comparar, el presupuesto y las campañas van por mes: con otras fechas no hay con qué medirlos, y no se dibujan a medias.
  const antes = unMes ? periodoAnterior(periodo, inicio) : null;
  const comparar = sp.comparar === "1" && unMes;

  // Los dos períodos de antes: de ahí salen «contra qué se compara» y las columnas del detalle. Si no se pueden leer, la pantalla sale sin comparar.
  const anteriores = periodosAnteriores(periodo, hoy, inicio);

  // Una sede suelta pregunta por la suya; CAYLA entera (o «De la empresa»), por todas las que la cuenta ve.
  const ubicacionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sede) ? sede : null;
  // En el mes en curso se compara con los mismos días de los meses pasados: esos días también llevan su parte de sueldos, como hoy (`getEstadoResultadosAEstaFecha`).
  const leerAnterior = enCurso && unMes ? getEstadoResultadosAEstaFecha : getEstadoResultados;
  // Cada lectura de arriba lleva el IGV de sus ventas (ADR-0624): solo para presentar «Vendiste con IGV» e «IGV de tus ventas» sobre «Lo que vendiste». No cambia ninguna cifra.
  const [actual, anterior, comparadas, cerradas, claure, ppto, campanas, cuadre, costoEst, faltaDelMes] = await Promise.all([
    getEstadoResultados(desde, hasta).then((l) => conIgvDeLasVentasDe(desde, hasta, l)),
    comparar && antes ? leerAnterior(antes.desde, antes.hasta) : Promise.resolve(null),
    Promise.all(anteriores.map(async (c) => ({ etiqueta: c.etiqueta, lectura: await conIgvDeLasVentasDe(c.desde, c.hasta, await leerAnterior(c.desde, c.hasta)) }))),
    // El mes en curso no se cierra: no hay nada que preguntar.
    enCurso ? Promise.resolve([] as string[]) : getUnidadesCerradas(mes),
    // Lo vendido de CLAURE no suma a nada de esta pantalla: la nota dice cuánto se dejó fuera (apoyo; sin permiso o sin CLAURE llega `null`).
    getVentasClaure(desde, hasta),
    // Apoyo: si el presupuesto o las campañas no se pueden leer, la cascada sale sin la raya de lo planeado y sin campañas.
    unMes ? getPresupuestoVsReal(mes) : Promise.resolve({ datos: [], falla: null }),
    getCampanas(),
    // De Ventas a Finanzas (ADR-0609): si falla, la tarjeta lo dice y el resto de la pantalla se dibuja igual.
    getCuadreVentas(desde, hasta),
    // Cuánto de lo vendido lleva costo estimado: si no se lee, la ganancia no se presenta como 100 % real sin decirlo (principio 9).
    getCostoEstimado(desde, hasta, ubicacionId),
    // Lo que el mes en curso todavía va a gastar: sin esto, «cuánto hay que vender» saldría con los gastos de los días que van. Si no se lee, no se da cifra.
    enCurso && unMes ? getFaltaDelMes(mes) : Promise.resolve(null),
  ]);
  // ADR-0332: un mes anterior a la fecha desde la que cuenta Finanzas sale vacío; se dice por qué en vez de dejar ceros mudos.
  const avisoCorte = inicio && mesAntesDelCorte(mes, inicio) ? avisoAntesDelCorte(inicio) : null;

  const params = paramsDe(sp);
  const mesDeHoy = mesDelDia(hoy);
  const href = (ruta: string, otra?: ClaveSede) => hrefTelar(ruta, params, otra ? { sede: otra } : {}, { mismaPantalla: false, mesDeHoy });

  const fila = filaDeLaSede(actual.datos, sede);
  const pptoSede = pptoDeLaSede(ppto.datos, sede);
  const tramos = fila ? cascadaGanamos(fila, pptoSede) : [];
  const meta = metaDeVentas(pptoSede);
  const deCadaSede = sede === SEDE_TODAS && veTodo ? porSede(actual.datos) : null;
  const delMes = unMes ? campanasDelMes(campanas.datos, mes) : [];
  const sedesCascada = deCadaSede ? filasDeSedes(deCadaSede, (c) => href("/finanzas/reportes", c)) : null;
  const cuadro = cuadroVentas(cuadre.datos, sede);
  const ventaDelMes = (clave: ClaveSede) => {
    const f = clave ? actual.datos.find((x) => (x.unidad === "empresa" ? SEDE_EMPRESA : x.ubicacionId) === clave) : fila;
    return f ? ventaParaElMesEntero(f, faltaDelMes) : null;
  };
  const recomendaciones = recomendacionesGanamos({ fila, sedes: deCadaSede, tramos, meta, campanas: delMes, enCurso, unMes, ventaDelMes, href });
  const hayCuadre = cuadre.falla || cuadro;
  // Lo que no cuadra o se queda corto se dice a la vista: un número calculado sobre datos que no cuadran es peor que ninguno. Lo demás (las notas) va con el cuadro.
  const verParam = verDeLaVista(persona.vista, sedeDeLaUrl(sp));
  const avisosGraves = avisosER(columnasER(actual.datos, leerVerER(verParam, actual.datos, veTodo, persona.ubicacionId)), enCurso).filter((a) => a.tono !== "pizarra");
  const textoMas = textoDeVerMas([
    ...(tramos.some((t) => t.plan !== undefined) ? ["lo planeado"] : []),
    ...(sedesCascada && sedesCascada.length > 1 ? ["las sedes"] : []),
    ...(unMes ? ["las campañas"] : []),
    ...(hayCuadre ? ["lo que cuadra con Ventas"] : []),
    "el cuadro por sede",
  ])!;
  const leidas = comparadas.map((c) => ({ etiqueta: c.etiqueta, fila: c.lectura.falla ? null : filaDeLaSede(c.lectura.datos, sede) }));
  const notaCosto = notaCostoEstimado(costoEst.datos);

  return (
    <div className="space-y-4">
      <CabeceraEstados pantalla="ganamos" mes={mes} sede={sede} hoy={hoy} params={params} />
      {avisoCorte && <Aviso tono="info">{avisoCorte}</Aviso>}
      {/* Si no se pudo leer se dice: nunca una cifra en cero que no es. */}
      {actual.falla ? (
        <Aviso tono="error">{actual.falla}</Aviso>
      ) : (
        <EstadoEnInforme
          nombre={`Resultado · ${periodo.titulo}`}
          lectura={lecturaDeGanancias(fila, leidas.at(-1)?.fila ?? null, periodo, fila ? ventaParaElMesEntero(fila, faltaDelMes) : null)}
          grafico={
            <Suspense fallback={<LineaEsperando />}>
              <LineaDeGanancias hoy={hoy} minimo={inicio} sede={sede} periodo={periodo} resultado={fila?.resultado ?? 0} />
            </Suspense>
          }
          guiaRespuesta="fin-ganamos.respuesta"
          guiaInforme="fin-ganamos.partes"
          guiaContador="fin-ganamos.libro"
          aviso={
            <>
              {avisosGraves.map((a) => (
                <Aviso key={a.texto} tono={a.tono === "rojo" ? "error" : "atencion"}>
                  {a.texto}
                </Aviso>
              ))}
              {/* Si parte del costo es un promedio, la ganancia es una estimación y se dice aquí, junto a la cifra (tarea 28 de «Las 36 de Finanzas»). */}
              {notaCosto ? (
                <Aviso
                  tono={notaCosto.tono === "rojo" ? "error" : "atencion"}
                  titulo={notaCosto.texto}
                  guia="fin-ganamos.costo-estimado"
                  accion={
                    <BotonVer href={notaCosto.href} chico>
                      Registrar el costo real
                    </BotonVer>
                  }
                >
                  {notaCosto.detalle}
                </Aviso>
              ) : costoEst.falla ? (
                <Aviso tono="info" chico>
                  {costoEst.falla}
                </Aviso>
              ) : null}
            </>
          }
          informe={
            fila
              ? informeDeGanancias({ fila, partes: partesDeGanancias({ fila, ppto: pptoSede, datos: actual.datos, veCadaSede: !!deCadaSede, comparadas: leidas, etiquetaActual: etiquetaDelPeriodo(periodo), periodo }), comparadas: leidas, etiquetaActual: etiquetaDelPeriodo(periodo), verImpuestos: href("/finanzas/impuestos") })
              : { titulo: "Ganancias y pérdidas", columnas: [], pesoDe: null, filas: [] }
          }
        />
      )}
      <Recomendaciones recomendaciones={recomendaciones} />
      <MasDelEstado texto={textoMas} guia="fin-ganamos.mas" abierto={comparar || sp.cuadre === "1"}>
        <MasDeGanancias
          fila={fila}
          tramos={tramos}
          meta={meta}
          enCurso={enCurso}
          sedes={sedesCascada}
          campanas={unMes ? delMes : null}
          hrefCampanas={href("/finanzas/reportes/campanas")}
          nombreDelMes={mesNombre(mes)}
          cuadre={hayCuadre ? <CuadreVentas cuadro={cuadro} falla={cuadre.falla} /> : null}
          cuadro={
            <section className="min-w-0 space-y-3" data-guia="fin-ganamos.cuadro">
              <TituloSeccion>El cuadro por sede</TituloSeccion>
              <EstadoResultadosPanel
                filas={actual.datos}
                anteriores={anterior?.datos ?? null}
                veTodo={veTodo}
                cerradas={cerradas}
                sedeActual={persona.ubicacionId}
                verParam={verParam}
                mes={mes}
                desde={desde}
                hasta={hasta}
                titulo={periodo.titulo}
                mesPrevio={antes && unMes ? previo : null}
                hoy={hoy}
                comparar={comparar}
                claure={claure}
                fallas={anterior?.falla ? [anterior.falla] : []}
              />
            </section>
          }
        />
      </MasDelEstado>
    </div>
  );
}
