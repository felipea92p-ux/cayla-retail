import { exigirModulo } from "@/lib/persona-actual";
import { getDatosNuevaOrdenInsumo } from "@/lib/ordenes-insumo";
import { hoyLima } from "@/lib/fechas-lima";
import { leerPrecargaDePedido } from "@/lib/pedir-insumo-reglas";
import { NuevaOrdenInsumo } from "@/components/ordenes-insumo/NuevaOrdenInsumo";

// Nueva orden de insumos del Taller (ADR-0362, fase 7 · actividad 2). La página junta lo que el formulario necesita leer
// (`fn_orden_insumo_opciones` y la vista previa del número); las reglas viven en `crear_orden_insumo` (y su espejo para la guía,
// `lib/orden-insumo-alta.ts`). «Llega a» arranca en el único taller, o en el taller donde se trabaja; con varios talleres y parado en una
// tienda, arranca vacío y se elige.
//
// «Pedir N m» (el Resumen, la página de una orden y «Qué hacer hoy») llega con `?insumo=<id>&cantidad=<n>`: la primera línea abre con ese
// insumo y esa cantidad en su unidad (`lib/pedir-insumo-reglas.ts`). Un id que la lista no tiene o una cantidad que la caja no aceptaría se
// descartan sin romper la hoja; no se lee nada más de la URL y el formulario solo la toma al abrir (lo que la persona escriba no se pisa).
export default async function NuevaOrdenInsumoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const persona = await exigirModulo("ordenes_insumos");
  const [datos, params] = await Promise.all([getDatosNuevaOrdenInsumo(), searchParams]);
  const precarga = leerPrecargaDePedido(params, new Set(datos.insumos.map((i) => i.id)));
  const destinoInicial =
    datos.talleres.length === 1 ? datos.talleres[0]!.id : datos.talleres.some((t) => t.id === persona.ubicacionId) ? persona.ubicacionId : "";
  return <NuevaOrdenInsumo datos={datos} sede={persona.ubicacionEtiqueta} hoy={hoyLima()} destinoInicial={destinoInicial} precarga={precarga} />;
}
