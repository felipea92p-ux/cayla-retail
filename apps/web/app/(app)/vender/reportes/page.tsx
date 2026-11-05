import { BarChart3 } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { alcanceDeReportes } from "@/lib/reportes-ventas-alcance";
import { getCortesMes, getReporteMes, getSeriesMes } from "@/lib/reportes-ventas";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDeParametro, type Mes } from "@/lib/facturacion-reglas";
import { nombreDelMes } from "@/lib/historial-cierres-reglas";
import { corteDeUrl, cortesOfrecidos, tiendaDeUrl } from "@/lib/reportes-ventas-reglas";
import { paramDeMes } from "@/lib/facturacion-reglas";
import { CabeceraReportes } from "@/components/reportes-ventas/CabeceraReportes";
import { FiltrosReporteMes } from "@/components/reportes-ventas/FiltrosReporteMes";
import { CifrasReporteMes } from "@/components/reportes-ventas/CifrasReporteMes";
import { GraficosReporteMes } from "@/components/reportes-ventas/GraficosReporteMes";
import { TablaCortes } from "@/components/reportes-ventas/TablaCortes";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { Vacio } from "@/components/ui/Vacio";

// Ventas ▸ Reportes ▸ Ventas del mes (maqueta docs/maquetas/reportes-ventas-2026-11/). Actividad 2: el mes, la tienda y las cuatro cifras contra el
// mismo tramo del mes anterior (actividad 2) y los tres gráficos (actividad 3: ventas por día, mes a mes, cómo se pagó) y la tabla por tienda y categoría (actividad 4). Lee en el servidor con `fn_reporte_ventas_mes`: el líder ve
// todas las tiendas y elige una; quien tiene el módulo en su rol ve solo la suya (lo decide la base, no esta pantalla).
export default async function ReportesVentasPage({ searchParams }: { searchParams: Promise<{ m?: string; tienda?: string; corte?: string }> }) {
  const persona = await requirePersonaActualV2();
  const sp = await searchParams;
  const hoy = hoyLima();
  const actual: Mes = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
  const mes = mesDeParametro(sp.m, actual);

  const { tiendas, tienda, sede } = await alcanceDeReportes(persona, tiendaDeUrl(sp.tienda));

  // Las cifras, los gráficos y el desglose se leen a la vez y por separado: si uno falla, los otros siguen a la vista (principio 9).
  const [lectura, series, cortes] = await Promise.all([getReporteMes(mes, tienda), getSeriesMes(mes, tienda), getCortesMes(mes, tienda)]);
  const r = lectura.datos;

  return (
    <div className="space-y-6">
      <CabeceraReportes
        sede={sede}
        activa="mes"
        acciones={
          r && r.actual.tickets > 0 && cortes.datos ? (
            <BotonDescargar guia="reportes.descargar" title="Baja la tabla del mes que miras (por tienda o por categoría), con su total" href={`/vender/reportes/descargar?m=${paramDeMes(mes)}${tienda ? `&tienda=${tienda}` : ""}&corte=${corteDeUrl(sp.corte, cortesOfrecidos(cortes.datos))}`}>Descargar el mes en Excel</BotonDescargar>
          ) : undefined
        }
      />
      <FiltrosReporteMes mes={mes} actual={actual} tiendas={tiendas} tiendaId={tienda} corte={sp.corte ?? null} />
      {lectura.falla ? (
        <Aviso tono={lectura.sinAcceso ? "atencion" : "error"} titulo={lectura.sinAcceso ? "Tu rol no ve los Reportes de ventas" : "No se pudo leer el reporte"}>
          {lectura.sinAcceso ? "Pídele a quien administra los accesos que te lo active." : `${lectura.falla} Vuelve a intentarlo en un momento.`}
        </Aviso>
      ) : r && r.actual.tickets === 0 ? (
        <Vacio icono={<BarChart3 />} titulo={`No hay ventas en ${nombreDelMes(mes).toLowerCase()}`}>
          {tienda ? "En esa tienda no se registró ninguna venta en ese mes." : "No se registró ninguna venta en ese mes."} Elige otro mes con las flechas.
        </Vacio>
      ) : r ? (
        <>
          <CifrasReporteMes r={r} />
          {series.datos ? (
            <GraficosReporteMes r={r} s={series.datos} tiendaId={tienda} corte={sp.corte ?? null} />
          ) : (
            <Aviso tono="atencion" titulo="No se pudieron leer los gráficos">
              Las cifras de arriba están bien. Vuelve a intentarlo en un momento.
            </Aviso>
          )}
          {cortes.datos ? (
            <TablaCortes
              r={r}
              cortes={cortes.datos}
              corte={corteDeUrl(sp.corte, cortesOfrecidos(cortes.datos))}
              hrefDe={(c) => `/vender/reportes?m=${paramDeMes(mes)}${tienda ? `&tienda=${tienda}` : ""}&corte=${c}`}
            />
          ) : (
            <Aviso tono="atencion" titulo="No se pudo leer el desglose">
              Las cifras y los gráficos están bien. Vuelve a intentarlo en un momento.
            </Aviso>
          )}
        </>
      ) : null}
    </div>
  );
}
