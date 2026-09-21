import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { getTaller, getOrdenesProduccion, getModelosProducibles } from "@/lib/produccion";
import { getInsumosDelTaller } from "@/lib/insumos";
import { getLineasPorRecibir } from "@/lib/recibir-produccion";
import { getComprobantesProduccion } from "@/lib/comprobantes-produccion";
import { getDecisionProduccion } from "@/lib/decision-produccion";
import { hoyLima } from "@/lib/fechas-lima";
import { cifrasResumen, decisionesDeProduccion, demandaDeInsumos, filasDeTela, filasPorModelo, type InsumoParaDecidir, type OrdenParaDecidir } from "@/lib/produccion-decisiones";
import { ResumenProduccionPanel } from "@/components/ResumenProduccionPanel";

// `/produccion` es el módulo padre (ADR-0133) y, desde F6, su Resumen: «¿qué necesita mi decisión hoy?». Solo líder (ventas de la red y dinero) y, como el resto
// de Producción, solo parado en el Taller. Quien trabaja en el Taller va directo a Órdenes. El enlace `/produccion` que ya usa el Resumen de Inventario
// (`lib/resumen-acciones.ts`) sigue resolviendo. Todo se calcula acá, en el servidor, con reglas puras (`lib/produccion-decisiones.ts`).
export default async function ProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }
  if (persona.rol !== "lider") redirect("/produccion/ordenes");

  const taller = await getTaller();
  if (!taller) redirect("/produccion/ordenes");

  const hoy = hoyLima();
  const [ordenes, modelos, datosInsumos, lineas, comprobantes] = await Promise.all([
    getOrdenesProduccion(taller.id, { conCostos: true }),
    getModelosProducibles(),
    getInsumosDelTaller(taller.id, { conCostos: true, hoy }),
    getLineasPorRecibir(taller.id),
    getComprobantesProduccion(),
  ]);
  const decision = await getDecisionProduccion({ modelos, ordenes, insumos: datosInsumos.insumos, consumosPorOrden: datosInsumos.consumosPorOrden, lineasPorRecibir: lineas });

  const ordenesParaDecidir: (OrdenParaDecidir & { costoTela: number; costoAvios: number })[] = ordenes.map((o) => ({
    id: o.id,
    referencia: o.referencia,
    productoId: o.productoId,
    estado: o.estado,
    esMuestra: o.esMuestra,
    fechaEntrega: o.fechaEntrega,
    cantidadPlan: o.cantidadPlan,
    etapas: o.etapas,
    costoTela: o.costoTela,
    costoAvios: o.costoAvios,
  }));
  const insumos: InsumoParaDecidir[] = datosInsumos.insumos.map((i) => ({ id: i.id, nombre: i.nombre, unidad: i.unidad, tipo: i.tipo, saldo: i.saldo, minimo: i.minimo, tono: i.estado.tono }));
  const llegadas = lineas.filter((l) => l.pendiente > 0).map((l) => ({ insumoId: l.insumoId, documento: `${l.serie}-${l.numero}`, proveedor: l.proveedor, pendiente: l.pendiente }));
  const consumoNeto: Record<string, Record<string, number>> = {};
  for (const [ordenId, cs] of Object.entries(datosInsumos.consumosPorOrden)) {
    for (const c of cs) (consumoNeto[ordenId] ??= {})[c.insumoId] = (consumoNeto[ordenId][c.insumoId] ?? 0) + c.cantidad;
  }

  const datos = decision.datos;
  const demandaInsumos = demandaDeInsumos(ordenesParaDecidir, datos?.rendimientoPorModelo ?? {}, consumoNeto);
  const filasModelo = datos
    ? filasPorModelo(datos.demanda, modelos.map((m) => ({ productoId: m.productoId, referencia: m.referencia, variantesIds: m.variantes.map((v) => v.varianteId) })), datos.enProduccion)
    : [];

  const decisiones = decisionesDeProduccion({ hoy, ordenes: ordenesParaDecidir, insumos, llegadas, demanda: demandaInsumos, comprobantes, modelos: filasModelo });
  const cifras = cifrasResumen({ hoy, ordenes: ordenesParaDecidir, insumos, capitalInsumos: datosInsumos.capital, comprobantes });
  const telas = filasDeTela(insumos, demandaInsumos, llegadas);

  return (
    <div className="space-y-6">
      <ResumenProduccionPanel decisiones={decisiones} cifras={cifras} modelos={filasModelo} telas={telas} falloRed={decision.fallo} />
    </div>
  );
}
