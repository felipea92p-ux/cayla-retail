import { exigirLider } from "@/lib/persona-actual";
import { opcional } from "@/lib/resultado";
import { getComprobantesMes, getResumenPorEnviar, getVentasDeHoy } from "@/lib/comprobantes";
import { getVentasDeReferencia } from "@/lib/ventas-comparativo";
import { ventanaDelDiaLima } from "@/lib/facturacion-resumen-reglas";
import { enlazarVentasConComprobantes } from "@/lib/facturacion-actividad";
import { ResumenTarjetas } from "@/components/ResumenTarjetas";
import { ActividadDeHoy } from "@/components/ActividadDeHoy";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";

// Resumen = hoy: las cuatro tarjetas de vidrio y, debajo, la actividad del día con el camino de
// cada comprobante hasta SUNAT.
export default async function ResumenPage() {
  await exigirLider();
  const ahora = new Date();
  const hoy = ventanaDelDiaLima(ahora);

  // Las ventas y los comprobantes de hoy son plata: sin ellos la pantalla no se dibuja
  // (`exigir`, dentro de cada lectura). La cola de SUNAT y la referencia de la semana pasada son
  // secundarias: si fallan (o lanzan, `opcional`) llegan `null` y su tarjeta lo dice, nunca una cifra inventada.
  //
  // Sin ubicación: un líder ve las ventas de todas las tiendas del día, que es justo lo que
  // pidió ("todo lo que se vendió hoy") — un integrante vería solo la suya igual, aunque acá
  // nunca entra (la pantalla entera es líder-only).
  const [ventasHoy, comprobantesHoy, porEnviar, referencia] = await Promise.all([
    getVentasDeHoy(),
    getComprobantesMes(hoy.desde, hoy.hasta),
    opcional(getResumenPorEnviar(), "la cola de SUNAT (Resumen)"),
    opcional(getVentasDeReferencia(ahora), "las ventas de la semana pasada (Resumen)"),
  ]);

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <ResumenTarjetas ventas={ventasHoy} porEnviar={porEnviar} comprobantesDeHoy={comprobantesHoy} referencia={referencia} ahora={ahora} />
      <ActividadDeHoy filas={enlazarVentasConComprobantes(ventasHoy, comprobantesHoy)} ahora={ahora} />
    </div>
  );
}
