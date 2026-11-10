import { Suspense } from "react";
import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { hrefTelar, mesDelDia, nombreCortoSede, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { paramsDe } from "@/lib/estados-financieros-reglas";
import { etiquetaDelPeriodo, leerPeriodo, periodoDe, periodosAnteriores } from "@/lib/estados-periodo";
import { getPatrimonioCambios, getPatrimonioEnFechas } from "@/lib/estados-financieros";
import { informeDelPatrimonio, lecturaDelPatrimonio, partesDelPatrimonio } from "@/lib/estados-patrimonio";
import { textoDeVerMas } from "@/lib/estados-partes";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { getEstadoResultados } from "@/lib/resultados";
import { getConciliacion } from "@/lib/balance";
import { avisoBalanceSinCuadrar } from "@/lib/balance-reglas";
import { recomendacionesTuyo, tieneExtremos } from "@/lib/patrimonio-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { EstadoEnInforme } from "@/components/finanzas/estados/EstadoEnInforme";
import { LineaDePatrimonio } from "@/components/finanzas/estados/LineaDePatrimonio";
import { LineaEsperando } from "@/components/finanzas/estados/LineaDeGanancias";
import { MasDelEstado } from "@/components/finanzas/estados/MasDelEstado";
import { PatrimonioFormal, PatrimonioSinArranque } from "@/components/finanzas/estados/PatrimonioPanel";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";
import { SoloLiderFlujo } from "@/components/finanzas/SoloLiderFlujo";

/** Un mes entero se lee con la función de siempre; otras fechas, con la que las recibe. */
function leerPatrimonio(desde: string, hasta: string, hoy: string) {
  const p = periodoDe(desde, hasta, hoy);
  return p.unMes ? getPatrimonioCambios(p.mes) : getPatrimonioEnFechas(desde, hasta);
}

// Finanzas ▸ Estados financieros ▸ Cambios en el patrimonio (ADR-0585, ADR-0611). Lee lo tuyo en las fechas del calendario y en los dos períodos de antes, y la ganancia de esas fechas (para
// abrirla por sede). La línea de los meses llega aparte, con su `Suspense`. Es de CAYLA entera, como el Balance entero: lo ve quien ve los Estados financieros de todo; una terminal, no.
export default async function PatrimonioPage({ searchParams }: { searchParams: Promise<{ mes?: string; desde?: string; hasta?: string; sede?: string; ver?: string; forma?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  if (!veEstadosFinancierosDeTodoDe(persona)) return <SoloLiderFlujo pestana="patrimonio" />;
  const sp = await searchParams;
  const hoy = hoyLima();
  const periodo = leerPeriodo(sp, hoy);
  const { desde, hasta, mes } = periodo;
  const params = paramsDe(sp);
  const href = (ruta: string) => hrefTelar(ruta, params, {}, { mismaPantalla: false, mesDeHoy: mesDelDia(hoy) });
  const parametros = await getParametrosFinanzas();
  const anteriores = periodosAnteriores(periodo, hoy, parametros?.inicioFinanzas ?? null);

  const [patrimonio, comparadas, er, chequeos] = await Promise.all([
    leerPatrimonio(desde, hasta, hoy),
    Promise.all(anteriores.map(async (c) => ({ etiqueta: c.etiqueta, lectura: await leerPatrimonio(c.desde, c.hasta, hoy) }))),
    getEstadoResultados(desde, hasta),
    // ¿Lo tuyo? sale del mismo diario que el Balance: si el Balance no cuadra, su cifra tampoco es firme (tarea 28).
    getConciliacion(hasta),
  ]);
  const datos = patrimonio.datos;
  const noCuadra = chequeos.falla ? "No se pudo comprobar si el Balance cuadra: esta cifra puede cambiar." : avisoBalanceSinCuadrar(chequeos.datos);
  // «Ganaste» sale del diario y aún no resta los sueldos que Dynamic no paga: las filas por sede lo mismo, para sumar lo que dice arriba (cada una, sin su estimado).
  const sueldosEstimados = er.falla ? 0 : (er.datos.find((f) => f.unidad === "consolidado")?.planillaEstimada ?? 0);
  const recomendaciones = recomendacionesTuyo({ datos, href, sueldosEstimados });
  const porSede = er.falla
    ? []
    : er.datos.filter((f) => f.unidad !== "consolidado").map((f) => ({ nombre: f.unidad === "empresa" ? "Empresa" : nombreCortoSede(f.nombre), valor: f.resultado + f.planillaEstimada }));

  return (
    <div className="space-y-4">
      <CabeceraEstados pantalla="tuyo" mes={mes} sede={sedeDeLaUrl(sp)} hoy={hoy} params={params} />
      {patrimonio.falla ? (
        <Aviso tono="error" titulo="No se pudo leer lo tuyo">
          {patrimonio.falla}
        </Aviso>
      ) : !tieneExtremos(datos) ? (
        <PatrimonioSinArranque />
      ) : (
        <>
        {noCuadra && (
          <Aviso
            tono={chequeos.falla ? "info" : "atencion"}
            titulo={noCuadra}
            accion={
              <BotonVer href={href("/finanzas/reportes/balance")} chico>
                Ver el Balance
              </BotonVer>
            }
          />
        )}
        {(() => {
          const comparadasLeidas = comparadas.map((c) => ({ etiqueta: c.etiqueta, datos: c.lectura.falla ? null : c.lectura.datos }));
          const etiquetaActual = etiquetaDelPeriodo(periodo);
          const partes = partesDelPatrimonio({ datos, comparadas: comparadasLeidas, etiquetaActual, periodo, porSede });
          return (
            <EstadoEnInforme
              nombre={`Lo tuyo · ${periodo.titulo}`}
              lectura={lecturaDelPatrimonio(datos, sueldosEstimados)}
              grafico={
                <Suspense fallback={<LineaEsperando />}>
                  <LineaDePatrimonio hoy={hoy} periodo={periodo} final={datos.fin.total} />
                </Suspense>
              }
              guiaRespuesta="fin-patrimonio.respuesta"
              guiaInforme="fin-patrimonio.partes"
              guiaContador="fin-patrimonio.libro"
              informe={informeDelPatrimonio({ datos, partes, comparadas: comparadasLeidas, etiquetaActual })}
            />
          );
        })()}
        </>
      )}
      {recomendaciones.length > 0 && <Recomendaciones recomendaciones={recomendaciones} />}
      {tieneExtremos(datos) && (
        <MasDelEstado texto={textoDeVerMas(["el cuadro por columna"])!} guia="fin-patrimonio.mas">
          <PatrimonioFormal datos={datos} titulo={periodo.titulo} />
        </MasDelEstado>
      )}
    </div>
  );
}
