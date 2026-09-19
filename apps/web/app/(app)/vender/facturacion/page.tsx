import { exigirLider } from "@/lib/persona-actual";
import { getComprobantesMes, getResumenPorEnviar, getVentasDeHoy } from "@/lib/comprobantes";
import { getVentasDeReferencia } from "@/lib/ventas-comparativo";
import { ventanaDelDiaLima } from "@/lib/facturacion-resumen-reglas";
import { ResumenTarjetas } from "@/components/ResumenTarjetas";
import { VentasDelDiaPanel } from "@/components/VentasDelDiaPanel";

// Resumen = hoy: las cuatro tarjetas de vidrio y, debajo, las ventas del día. La rebanada B
// reemplaza la lista por «Actividad de hoy» con el hilo del comprobante.
export default async function ResumenPage() {
  await exigirLider();
  const ahora = new Date();
  const hoy = ventanaDelDiaLima(ahora);

  // Las ventas y los comprobantes de hoy son plata: sin ellos la pantalla no se dibuja
  // (`exigir`, dentro de cada lectura). La cola de SUNAT y la referencia de la semana pasada son
  // secundarias: si fallan llegan `null` y su tarjeta lo dice, nunca una cifra inventada.
  //
  // Sin ubicación: un líder ve las ventas de todas las tiendas del día, que es justo lo que
  // pidió ("todo lo que se vendió hoy") — un integrante vería solo la suya igual, aunque acá
  // nunca entra (la pantalla entera es líder-only).
  const [ventasHoy, comprobantesHoy, porEnviar, referencia] = await Promise.all([
    getVentasDeHoy(),
    getComprobantesMes(hoy.desde, hoy.hasta),
    getResumenPorEnviar(),
    getVentasDeReferencia(ahora),
  ]);

  return (
    <div className="space-y-6">
      <ResumenTarjetas ventas={ventasHoy} porEnviar={porEnviar} comprobantesDeHoy={comprobantesHoy} referencia={referencia} ahora={ahora} />
      <VentasDelDiaPanel ventas={ventasHoy} />
    </div>
  );
}
