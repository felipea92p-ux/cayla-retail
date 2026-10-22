import { exigirModulo } from "@/lib/persona-actual";
import { getDatosNuevaOrden } from "@/lib/ordenes-compra";
import { hoyLima } from "@/lib/fechas-lima";
import { NuevaOrdenCompra } from "@/components/ordenes-compra/NuevaOrdenCompra";

// Nueva orden de compra (ADR-0362, fase 1 · actividad 2). La página junta lo que el formulario necesita leer; las reglas viven en
// `crear_orden_compra` (y su espejo para la guía, `lib/orden-compra-alta.ts`). «Llega a» arranca en la sede donde se trabaja si es una
// tienda o un almacén; parado en el Taller (o en CAYLA Global) arranca vacío y se elige.
export default async function NuevaOrdenCompraPage() {
  const persona = await exigirModulo("ordenes_compra");
  const datos = await getDatosNuevaOrden();
  const destinoInicial = datos.destinos.some((d) => d.id === persona.ubicacionId) ? persona.ubicacionId : "";
  return <NuevaOrdenCompra datos={datos} sede={persona.ubicacionEtiqueta} hoy={hoyLima()} destinoInicial={destinoInicial} />;
}
