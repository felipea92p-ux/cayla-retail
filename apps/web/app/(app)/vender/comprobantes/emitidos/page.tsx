import { exigirPermiso } from "@/lib/persona-actual";
import { opcional } from "@/lib/resultado";
import { getComprobantesMes, getExtrasDeComprobantes, getResumenPorEnviar } from "@/lib/comprobantes";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { mesDeParametro, periodoDelMes, tiendasOperativas } from "@/lib/facturacion-reglas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { ComprobantesTarjetas } from "@/components/ComprobantesTarjetas";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";
import { SelectorMesFacturacion } from "@/components/SelectorMesFacturacion";
import { PeriodoComprobantes } from "@/components/PeriodoComprobantes";
import { diasDelMes, montosPorTramo } from "@/lib/comprobantes-graficos-reglas";

// «Este mes» de la pestaña Hoy (2026-09-26): la vieja «Emitidos», en la misma ruta para no romper enlaces.
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
  // Lo que conecta cada comprobante con su venta, la clienta y Posventa. Nunca tumba la vista (`tolerar` adentro).
  const extras = await getExtrasDeComprobantes(comprobantes);
  const periodo = periodoDelMes(mes, actual);

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorMesFacturacion ruta="/vender/comprobantes/emitidos" mes={mes} actual={actual} />
        <PeriodoComprobantes activo="mes" />
      </div>
      <ComprobantesTarjetas
        comprobantes={comprobantes}
        porEnviar={porEnviar}
        periodo={periodo}
        ahora={ahora}
        tramos={montosPorTramo(comprobantes, "dia", { diasDelMes: diasDelMes(mes.anio, mes.mes) })}
      />
      <ComprobantesPanel
        comprobantes={comprobantes}
        periodo={periodo}
        esLider={persona.rol === "lider"}
        extras={extras}
        tiendas={tiendasOperativas(ubicaciones).map(({ id, nombre }) => ({ id, nombre }))}
      />
    </div>
  );
}
