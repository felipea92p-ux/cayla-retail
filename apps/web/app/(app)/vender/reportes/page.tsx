import { BarChart3 } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getReporteMes } from "@/lib/reportes-ventas";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDeParametro, type Mes } from "@/lib/facturacion-reglas";
import { nombreDelMes } from "@/lib/historial-cierres-reglas";
import { tiendaDeUrl } from "@/lib/reportes-ventas-reglas";
import { CabeceraReportes } from "@/components/reportes-ventas/CabeceraReportes";
import { FiltrosReporteMes } from "@/components/reportes-ventas/FiltrosReporteMes";
import { CifrasReporteMes } from "@/components/reportes-ventas/CifrasReporteMes";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";

// Ventas ▸ Reportes ▸ Ventas del mes (maqueta docs/maquetas/reportes-ventas-2026-11/). Actividad 2: el mes, la tienda y las cinco cifras contra el
// mismo tramo del mes anterior; los gráficos y la tabla llegan en las actividades 3 y 4. Lee en el servidor con `fn_reporte_ventas_mes`: el líder ve
// todas las tiendas y elige una; quien tiene el módulo en su rol ve solo la suya (lo decide la base, no esta pantalla).
export default async function ReportesVentasPage({ searchParams }: { searchParams: Promise<{ m?: string; tienda?: string }> }) {
  const persona = await requirePersonaActualV2();
  const sp = await searchParams;
  const hoy = hoyLima();
  const actual: Mes = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
  const mes = mesDeParametro(sp.m, actual);

  const esLider = persona.rol === "lider";
  const tiendas = esLider ? (await getUbicaciones()).filter((u) => u.tipo === "tienda" && u.activo).map((u) => ({ id: u.id, nombre: u.nombre })) : null;
  const pedida = esLider ? tiendaDeUrl(sp.tienda) : null;
  const tienda = pedida && tiendas?.some((t) => t.id === pedida) ? pedida : null;
  const sede = esLider ? (tiendas?.find((t) => t.id === tienda)?.nombre ?? "Todas las tiendas") : persona.ubicacionEtiqueta;

  const lectura = await getReporteMes(mes, tienda);
  const r = lectura.datos;

  return (
    <div className="space-y-6">
      <CabeceraReportes sede={sede} activa="mes" />
      <FiltrosReporteMes mes={mes} actual={actual} tiendas={tiendas} tiendaId={tienda} />
      {lectura.falla ? (
        <Aviso tono={lectura.sinAcceso ? "atencion" : "error"} titulo={lectura.sinAcceso ? "Tu rol no ve los Reportes de ventas" : "No se pudo leer el reporte"}>
          {lectura.sinAcceso ? "Pídele a quien administra los accesos que te lo active." : `${lectura.falla} Vuelve a intentarlo en un momento.`}
        </Aviso>
      ) : r && r.actual.tickets === 0 ? (
        <Vacio icono={<BarChart3 />} titulo={`No hay ventas en ${nombreDelMes(mes).toLowerCase()}`}>
          {tienda ? "En esa tienda no se registró ninguna venta en ese mes." : "No se registró ninguna venta en ese mes."} Elige otro mes con las flechas.
        </Vacio>
      ) : r ? (
        <CifrasReporteMes r={r} />
      ) : null}
    </div>
  );
}
