import { exigirLider } from "@/lib/persona-actual";
import { getComprobantesMes, getSeriesComprobantes } from "@/lib/comprobantes";
import { getUbicaciones } from "@/lib/ubicaciones";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { mesDeParametro, tiendasOperativas, ubicacionActualDe } from "@/lib/facturacion-reglas";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { SelectorMesFacturacion } from "@/components/SelectorMesFacturacion";

export default async function ComprobantesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await exigirLider();
  const { m } = await searchParams;
  const actual = mesActualLima();
  const mes = mesDeParametro(m, actual);
  const { desde, hasta } = mesLimaUTC(mes.anio, mes.mes);

  // `getSeriesComprobantes` y `getUbicaciones` van con `cache`: en una carga completa (o tras
  // `router.refresh()`) el layout ya las pidió en esta misma petición y acá no se leen otra
  // vez; al navegar entre vistas el layout no se vuelve a ejecutar y se leen aquí.
  const [comprobantes, series, ubicaciones] = await Promise.all([getComprobantesMes(desde, hasta), getSeriesComprobantes(), getUbicaciones()]);
  const tiendas = tiendasOperativas(ubicaciones);

  return (
    <div className="space-y-6">
      <SelectorMesFacturacion ruta="/vender/facturacion/comprobantes" mes={mes} actual={actual} />
      <ComprobantesPanel comprobantes={comprobantes} series={series} ubicaciones={tiendas} ubicacionActualId={ubicacionActualDe(tiendas, persona.ubicacionId)} />
    </div>
  );
}
