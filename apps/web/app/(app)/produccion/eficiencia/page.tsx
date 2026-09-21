import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { getTaller, getOrdenesProduccion } from "@/lib/produccion";
import { getGastosDelTaller, getPlanillaDelTaller } from "@/lib/eficiencia";
import { eficienciaDePeriodo, fechaLimaDe, ventanasDePeriodos } from "@/lib/eficiencia-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { EficienciaTallerPanel } from "@/components/EficienciaTallerPanel";

// Eficiencia del Taller (ADR-0133, F7; D-31 y D-33). Solo líder (dinero, planilla) y, como el resto de Producción, solo parado en el Taller. Mide lo que cuesta
// cada prenda terminada: materiales (órdenes cerradas) + conversión (planilla de Dynamic + gastos generales, entre las prendas buenas). Todo se calcula acá con reglas puras.
export default async function EficienciaPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }
  if (persona.rol !== "lider") redirect("/produccion/ordenes");

  const taller = await getTaller();
  if (!taller) redirect("/produccion/ordenes");

  const [ordenes, planilla, gastos] = await Promise.all([getOrdenesProduccion(taller.id, { conCostos: true, limite: 400 }), getPlanillaDelTaller(), getGastosDelTaller(taller.id)]);
  const ordenesEf = ordenes.map((o) => ({
    id: o.id,
    referencia: o.referencia,
    estado: o.estado,
    esMuestra: o.esMuestra,
    cerradaEn: fechaLimaDe(o.inventariadoEn),
    fechaEntrega: o.fechaEntrega,
    cantidadPlan: o.cantidadPlan,
    cantidadBuenas: o.cantidadBuenas,
    costoTela: o.costoTela,
    costoAvios: o.costoAvios,
    costoMaquila: o.costoMaquila,
  }));
  const periodos = ventanasDePeriodos(planilla.periodos, hoyLima()).map((v) => eficienciaDePeriodo(v, ordenesEf, gastos));

  return (
    <div className="space-y-6">
      <EficienciaTallerPanel periodos={periodos} estadoPlanilla={planilla.estado} hayGastos={gastos.length > 0} />
    </div>
  );
}
