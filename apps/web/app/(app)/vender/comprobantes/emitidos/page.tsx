import { exigirPermiso } from "@/lib/persona-actual";
import { opcional } from "@/lib/resultado";
import { getComprobantesMes, getResumenPorEnviar } from "@/lib/comprobantes";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { mesDeParametro, periodoDelMes, tiendasOperativas } from "@/lib/facturacion-reglas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { ComprobantesTarjetas } from "@/components/ComprobantesTarjetas";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";
import { SelectorMesFacturacion } from "@/components/SelectorMesFacturacion";

export default async function EmitidosPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await exigirPermiso("facturar");
  const { m } = await searchParams;
  const ahora = new Date();
  const actual = mesActualLima();
  const mes = mesDeParametro(m, actual);
  const { desde, hasta } = mesLimaUTC(mes.anio, mes.mes);

  // `getResumenPorEnviar` va con `cache`: en una carga
  // completa (o tras `router.refresh()`) el layout ya la pidió en esta misma petición y acá no se
  // lee otra vez; al navegar entre vistas el layout no se vuelve a ejecutar y se lee aquí.
  // Los comprobantes del mes son plata: sin ellos la pantalla no se dibuja (`exigir`). La cola de
  // SUNAT es secundaria: si falla (o lanza, `opcional`) llega `null` y sus tarjetas lo dicen.
  const [comprobantes, porEnviar, ubicaciones] = await Promise.all([
    getComprobantesMes(desde, hasta),
    opcional(getResumenPorEnviar(), "la cola de SUNAT (Emitidos)"),
    getUbicaciones(),
  ]);
  const periodo = periodoDelMes(mes, actual);

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <SelectorMesFacturacion ruta="/vender/comprobantes/emitidos" mes={mes} actual={actual} />
      <ComprobantesTarjetas comprobantes={comprobantes} porEnviar={porEnviar} periodo={periodo} ahora={ahora} />
      <ComprobantesPanel
        comprobantes={comprobantes}
        periodo={periodo}
        esLider={persona.rol === "lider"}
        tiendas={tiendasOperativas(ubicaciones).map(({ id, nombre }) => ({ id, nombre }))}
      />
    </div>
  );
}
