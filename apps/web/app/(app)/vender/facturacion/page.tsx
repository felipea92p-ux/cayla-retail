import { exigirLider } from "@/lib/persona-actual";
import { getVentasDeHoy } from "@/lib/comprobantes";
import { VentasDelDiaPanel } from "@/components/VentasDelDiaPanel";

// Resumen = hoy. En R1 muestra el panel de ventas de hoy tal cual; R2 lo reemplaza por las
// tarjetas de vidrio y la actividad de hoy (con el hilo del comprobante).
export default async function ResumenPage() {
  await exigirLider();
  // Sin ubicación: un líder ve las ventas de todas las tiendas del día, que es justo lo que
  // pidió ("todo lo que se vendió hoy") — un integrante vería solo la suya igual, aunque acá
  // nunca entra (la pantalla entera es líder-only).
  const ventasHoy = await getVentasDeHoy();
  return <VentasDelDiaPanel ventas={ventasHoy} />;
}
