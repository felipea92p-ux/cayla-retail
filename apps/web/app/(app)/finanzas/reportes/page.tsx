import { Suspense } from "react";
import { exigirModulo, veDiarioDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDe } from "@/lib/gastos-reglas";
import { mesAnterior, mesNombre } from "@/lib/resultados-reglas";
import { getCampanas, getEstadoResultados, getUnidadesCerradas } from "@/lib/resultados";
import { getPresupuestoVsReal } from "@/lib/presupuesto";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { getVentasClaure } from "@/lib/cuenta-claure";
import { getCuadreVentas } from "@/lib/cuadre-ventas";
import { cuadroVentas } from "@/lib/cuadre-ventas-reglas";
import { avisoAntesDelCorte, mesAntesDelCorte } from "@/lib/finanzas-arranque-reglas";
import { etiquetaDelPeriodo, leerPeriodo, periodoAnterior, periodosAnteriores } from "@/lib/estados-periodo";
import { lecturaDeGanancias, libroDeGanancias, partesDeGanancias, tituloDeLasPartes } from "@/lib/estados-ganancias";
import { textoDeVerMas } from "@/lib/estados-partes";
import { verDeLaVista } from "@/lib/vista-global";
import { hrefTelar, mesDelDia, sedeDeLaUrl, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { filaDeLaSede, formaDe, paramsDe } from "@/lib/estados-financieros-reglas";
import { campanasDelMes, cascadaGanamos, filasDeSedes, metaDeVentas, porSede, pptoDeLaSede, recomendacionesGanamos } from "@/lib/ganamos-reglas";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { CuadreVentas } from "@/components/finanzas/estados/CuadreVentas";
import { Aviso } from "@/components/ui/Aviso";
import { EstadoResultadosPanel } from "@/components/finanzas/EstadoResultadosPanel";
import { EstadoVidrio } from "@/components/finanzas/estados/EstadoVidrio";
import { LineaDeGanancias, LineaEsperando } from "@/components/finanzas/estados/LineaDeGanancias";
import { MasDeGanancias } from "@/components/finanzas/estados/MasDeGanancias";
import { MasDelEstado } from "@/components/finanzas/estados/MasDelEstado";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";

// Finanzas ▸ Estados financieros ▸ Ganancias y pérdidas (ADR-0195 F5, ADR-0585, ADR-0611). Lee en el servidor, a la vez: el Estado de resultados de las fechas del
// calendario y de los dos períodos de antes, el presupuesto contra lo real y las campañas (estos dos, si se mira un mes). La línea de los meses llega aparte, con su
// `Suspense`. La sede es la de la barra del telar (`?sede=`); `?comparar=1` pone en el formato formal cuánto cambió cada total contra el mes anterior. Quien ve todo (el líder, Configuración, Cierre de mes, CAYLA Global o este
// módulo, ADR-0585) elige la sede; una terminal mira la suya (lo decide la base).
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ mes?: string; desde?: string; hasta?: string; ver?: string; sede?: string; comparar?: string; forma?: string }> }) {
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

  const [actual, anterior, comparadas, cerradas, claure, ppto, campanas, cuadre] = await Promise.all([
    getEstadoResultados(desde, hasta),
    comparar && antes ? getEstadoResultados(antes.desde, antes.hasta) : Promise.resolve(null),
    Promise.all(anteriores.map(async (c) => ({ etiqueta: c.etiqueta, lectura: await getEstadoResultados(c.desde, c.hasta) }))),
    // El mes en curso no se cierra: no hay nada que preguntar.
    enCurso ? Promise.resolve([] as string[]) : getUnidadesCerradas(mes),
    // Lo vendido de CLAURE no suma a nada de esta pantalla: la nota dice cuánto se dejó fuera (apoyo; sin permiso o sin CLAURE llega `null`).
    getVentasClaure(desde, hasta),
    // Apoyo: si el presupuesto o las campañas no se pueden leer, la cascada sale sin la raya de lo planeado y sin campañas.
    unMes ? getPresupuestoVsReal(mes) : Promise.resolve({ datos: [], falla: null }),
    getCampanas(),
    // De Ventas a Finanzas (ADR-0609): si falla, la tarjeta lo dice y el resto de la pantalla se dibuja igual.
    getCuadreVentas(desde, hasta),
  ]);
  // ADR-0332: un mes anterior a la fecha desde la que cuenta Finanzas sale vacío; se dice por qué en vez de dejar ceros mudos.
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
  const delMes = unMes ? campanasDelMes(campanas.datos, mes) : [];
  const sedesCascada = deCadaSede ? filasDeSedes(deCadaSede, (c) => href("/finanzas/reportes", c)) : null;
  const cuadro = cuadroVentas(cuadre.datos, sede);
  const recomendaciones = recomendacionesGanamos({ fila, sedes: deCadaSede, tramos, meta, campanas: delMes, enCurso, href });
  const hayCuadre = cuadre.falla || cuadro;
  const textoMas = textoDeVerMas([
    ...(tramos.some((t) => t.plan !== undefined) ? ["lo planeado"] : []),
    ...(sedesCascada && sedesCascada.length > 1 ? ["las sedes"] : []),
    ...(unMes ? ["las campañas"] : []),
    ...(hayCuadre ? ["lo que cuadra con Ventas"] : []),
  ]);
  const leidas = comparadas.map((c) => ({ etiqueta: c.etiqueta, fila: c.lectura.falla ? null : filaDeLaSede(c.lectura.datos, sede) }));

  return (
    <div className="space-y-4">
      <CabeceraEstados pantalla="ganamos" mes={mes} sede={sede} hoy={hoy} params={params} forma={forma} />
      {forma === "formal" ? (
        <div className="min-w-0 space-y-4" data-guia="fin-ganamos.formal">
          <EstadoResultadosPanel
            filas={actual.datos}
            anteriores={anterior?.datos ?? null}
            veTodo={veTodo}
            cerradas={cerradas}
            sedeActual={persona.ubicacionId}
            verParam={verDeLaVista(persona.vista, sedeDeLaUrl(sp))}
            mes={mes}
            mesPrevio={previo}
            hoy={hoy}
            comparar={comparar}
            claure={claure}
            fallas={[avisoCorte, actual.falla, anterior?.falla ?? null].filter((f): f is string => !!f)}
          />
        </div>
      ) : (
        <>
          {avisoCorte && <Aviso tono="info">{avisoCorte}</Aviso>}
          {/* Si no se pudo leer se dice: nunca una cifra en cero que no es. */}
          {actual.falla ? (
            <Aviso tono="error">{actual.falla}</Aviso>
          ) : (
            <EstadoVidrio
              nombre={`Ganancias y pérdidas · ${periodo.titulo}`}
              lectura={lecturaDeGanancias(fila, leidas.at(-1)?.fila ?? null, periodo)}
              grafico={
                <Suspense fallback={<LineaEsperando />}>
                  <LineaDeGanancias hoy={hoy} minimo={inicio} sede={sede} periodo={periodo} resultado={fila?.resultado ?? 0} />
                </Suspense>
              }
              guiaRespuesta="fin-ganamos.respuesta"
              guiaPartes="fin-ganamos.partes"
              guiaLibro="fin-ganamos.libro"
              titulo={fila ? tituloDeLasPartes(fila, tramos) : ""}
              conTubo
              partes={fila ? partesDeGanancias({ fila, ppto: pptoSede, datos: actual.datos, veCadaSede: !!deCadaSede, comparadas: leidas, etiquetaActual: etiquetaDelPeriodo(periodo), periodo }) : []}
              tituloColumnas={unMes ? "Mes a mes" : "Período a período"}
              libro={{ titulo: "Ganancias y pérdidas", detalle: `${periodo.titulo} · en soles · formato del contador`, filas: fila ? libroDeGanancias(fila, tramos) : [] }}
            />
          )}
        </>
      )}
      <Recomendaciones recomendaciones={recomendaciones} enFila />
      {textoMas && (
        <MasDelEstado texto={textoMas} guia="fin-ganamos.mas">
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
          />
        </MasDelEstado>
      )}
    </div>
  );
}
