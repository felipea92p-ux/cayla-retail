import { exigirModulo } from "@/lib/persona-actual";
import { getDatosNuevaOrdenInsumo } from "@/lib/ordenes-insumo";
import { hoyLima } from "@/lib/fechas-lima";
import { NuevaOrdenInsumo } from "@/components/ordenes-insumo/NuevaOrdenInsumo";

// Nueva orden de insumos del Taller (ADR-0362, fase 7 · actividad 2). La página junta lo que el formulario necesita leer
// (`fn_orden_insumo_opciones` y la vista previa del número); las reglas viven en `crear_orden_insumo` (y su espejo para la guía,
// `lib/orden-insumo-alta.ts`). «Llega a» arranca en el único taller, o en el taller donde se trabaja; con varios talleres y parado en una
// tienda, arranca vacío y se elige.
export default async function NuevaOrdenInsumoPage() {
  const persona = await exigirModulo("ordenes_insumos");
  const datos = await getDatosNuevaOrdenInsumo();
  const destinoInicial =
    datos.talleres.length === 1 ? datos.talleres[0]!.id : datos.talleres.some((t) => t.id === persona.ubicacionId) ? persona.ubicacionId : "";
  return <NuevaOrdenInsumo datos={datos} sede={persona.ubicacionEtiqueta} hoy={hoyLima()} destinoInicial={destinoInicial} />;
}
