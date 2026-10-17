import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getDatosNuevaOrden, getModelosParaOrden } from "@/lib/ordenes-compra";
import { armarOrdenDeAnalisis, leerPedidoDeLaUrl, volverDeNuevaOrden } from "@/lib/orden-compra-desde-analisis";
import { hoyLima } from "@/lib/fechas-lima";
import { NuevaOrdenCompra } from "@/components/ordenes-compra/NuevaOrdenCompra";

// Nueva orden de compra (ADR-0362, fase 1 · actividad 2). La página junta lo que el formulario necesita leer; las reglas viven en
// `crear_orden_compra` (y su espejo para la guía, `lib/orden-compra-alta.ts`). «Llega a» arranca en la sede donde se trabaja si es una
// tienda o un almacén; parado en el Taller (o en CAYLA Global) arranca vacío y se elige.
//
// Desde Análisis (ADR-0357, «Actualización 2026-10-16», A9; decisión D8): «Comprar» y «Pedir a X» llegan con `?prov=&destino=&modelos=&desde=analisis`.
// La página lee esos ids como dato de afuera (`lib/orden-compra-desde-analisis.ts`: ids con forma de id, sin repetir, y solo los que existen y están
// activos) y arma un BORRADOR con una línea por modelo, sin cantidad ni precio: no guarda nada, y la cantidad la pone quien compra. «Volver» regresa a
// Análisis solo si vino de ahí y quien mira ve ese módulo.
export default async function NuevaOrdenCompraPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const persona = await exigirModulo("ordenes_compra");
  const params = await searchParams;
  const pedido = leerPedidoDeLaUrl(params);
  const [datos, modelos] = await Promise.all([getDatosNuevaOrden(), getModelosParaOrden(pedido.productoIds)]);
  const destinoInicial = datos.destinos.some((d) => d.id === persona.ubicacionId) ? persona.ubicacionId : "";
  const deAnalisis = pedido.productoIds.length > 0 ? armarOrdenDeAnalisis(pedido, datos, modelos, destinoInicial) : null;
  return (
    <NuevaOrdenCompra
      datos={datos}
      sede={persona.ubicacionEtiqueta}
      hoy={hoyLima()}
      destinoInicial={destinoInicial}
      deAnalisis={deAnalisis ?? undefined}
      volver={volverDeNuevaOrden(pedido.desdeAnalisis, veModulo(persona, "analisis"))}
    />
  );
}
