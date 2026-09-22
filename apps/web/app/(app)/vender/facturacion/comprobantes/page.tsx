import { exigirPermiso } from "@/lib/persona-actual";
import { opcional } from "@/lib/resultado";
import { getComprobantesMes, getResumenPorEnviar, getSeriesComprobantes } from "@/lib/comprobantes";
import { getUbicaciones } from "@/lib/ubicaciones";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { mesDeParametro, periodoDelMes, tiendasOperativas, ubicacionActualDe } from "@/lib/facturacion-reglas";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { ComprobantesTarjetas } from "@/components/ComprobantesTarjetas";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";
import { SelectorMesFacturacion } from "@/components/SelectorMesFacturacion";

export default async function ComprobantesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await exigirPermiso("facturar");
  const { m } = await searchParams;
  const ahora = new Date();
  const actual = mesActualLima();
  const mes = mesDeParametro(m, actual);
  const { desde, hasta } = mesLimaUTC(mes.anio, mes.mes);

  // `getSeriesComprobantes`, `getUbicaciones` y `getResumenPorEnviar` van con `cache`: en una carga
  // completa (o tras `router.refresh()`) el layout ya las pidió en esta misma petición y acá no se
  // leen otra vez; al navegar entre vistas el layout no se vuelve a ejecutar y se leen aquí.
  // Los comprobantes del mes son plata: sin ellos la pantalla no se dibuja (`exigir`). La cola de
  // SUNAT es secundaria: si falla (o lanza, `opcional`) llega `null` y sus tarjetas lo dicen.
  const [comprobantes, series, ubicaciones, porEnviar] = await Promise.all([
    getComprobantesMes(desde, hasta),
    getSeriesComprobantes(),
    getUbicaciones(),
    opcional(getResumenPorEnviar(), "la cola de SUNAT (Comprobantes)"),
  ]);
  const tiendas = tiendasOperativas(ubicaciones);
  const periodo = periodoDelMes(mes, actual);

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <SelectorMesFacturacion ruta="/vender/facturacion/comprobantes" mes={mes} actual={actual} />
      <ComprobantesTarjetas comprobantes={comprobantes} porEnviar={porEnviar} periodo={periodo} ahora={ahora} />
      <ComprobantesPanel
        comprobantes={comprobantes}
        series={series}
        ubicaciones={tiendas}
        ubicacionActualId={ubicacionActualDe(tiendas, persona.ubicacionId)}
        periodo={periodo}
        esLider={persona.rol === "lider"}
      />
    </div>
  );
}
