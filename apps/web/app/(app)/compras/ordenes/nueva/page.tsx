import { exigirModulo, puede } from "@/lib/persona-actual";
import { getDatosNuevaOrden } from "@/lib/ordenes-compra";
import { getRubrosEnUso } from "@/lib/proveedores";
import { hoyLima } from "@/lib/fechas-lima";
import { NuevaOrdenCompra } from "@/components/ordenes-compra/NuevaOrdenCompra";

// Nueva orden de compra (ADR-0362, fase 1 · actividad 2). La página junta lo que el formulario necesita leer; las reglas viven en
// `crear_orden_compra` (y su espejo para la guía, `lib/orden-compra-alta.ts`). «Llega a» arranca en la sede donde se trabaja si es una
// tienda o un almacén; parado en el Taller (o en CAYLA Global) arranca vacío y se elige.
//
// «+ Agregar proveedor» (2026-10-21): quien tiene el módulo Proveedores (`editarCuentasProveedor` = `fn_puede_gestionar_proveedores`, lo
// que la base exige en `registrar_proveedor`) da de alta uno sin salir de la orden; para los demás el combo dice a quién pedírselo.
// Los rubros en uso son los botones de ese formulario: secundarios, si no responden se abre igual con el rubro escrito a mano.
export default async function NuevaOrdenCompraPage() {
  const persona = await exigirModulo("ordenes_compra");
  const puedeAgregarProveedor = puede(persona, "editarCuentasProveedor");
  const [datos, rubrosEnUso] = await Promise.all([getDatosNuevaOrden(), puedeAgregarProveedor ? getRubrosEnUso() : Promise.resolve([] as string[])]);
  const destinoInicial = datos.destinos.some((d) => d.id === persona.ubicacionId) ? persona.ubicacionId : "";
  return (
    <NuevaOrdenCompra
      datos={datos}
      sede={persona.ubicacionEtiqueta}
      hoy={hoyLima()}
      destinoInicial={destinoInicial}
      puedeAgregarProveedor={puedeAgregarProveedor}
      rubrosEnUso={rubrosEnUso}
    />
  );
}
