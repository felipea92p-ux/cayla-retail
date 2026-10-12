import { FileX } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDatosEditarOrden } from "@/lib/ordenes-compra";
import { numeroOrdenCompra } from "@/lib/ordenes-compra-reglas";
import { borradorDeDetalle } from "@/lib/orden-compra-alta";
import { hoyLima } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { NuevaOrdenCompra } from "@/components/ordenes-compra/NuevaOrdenCompra";

// Editar una orden de compra (ADR-0362, fase 1 · actividad 4): el mismo formulario que «Nueva orden de compra», con la orden como está.
// Solo se edita una orden «generada»; una anulada lo dice y lleva a verla. Las reglas viven en `editar_orden_compra` (las mismas que
// crear, y lo que no se toca no se vuelve a juzgar).
//
// El formulario se monta con `key` = la versión de la orden: si otra persona la guardó mientras se editaba, «Recargar» vuelve a pedir
// esta página, llega la versión nueva y el formulario empieza de cero con lo que la orden dice ahora.
export default async function EditarOrdenCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await exigirModulo("ordenes_compra");
  const { id } = await params;
  const { datos, detalle, falla } = await getDatosEditarOrden(id);
  const volver = <Volver href="/compras/ordenes" a="Órdenes de compra" />;

  if (falla || !detalle) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Editar orden de compra" subtitulo="Corrige lo que le pediste a un proveedor." volver={volver} />
        {falla ? (
          <Aviso tono="error" titulo="No se pudo leer la orden">
            {falla}
          </Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio
              icono={<FileX />}
              titulo="No encontramos esa orden"
              acciones={
                <BotonEnlace href="/compras/ordenes" peso="primario">
                  Ver las órdenes de compra
                </BotonEnlace>
              }
            >
              El enlace no corresponde a ninguna orden de compra.
            </Vacio>
          </div>
        )}
      </div>
    );
  }

  if (detalle.estado !== "generada") {
    return (
      <div className="space-y-6">
        <EncabezadoPagina
          sede={persona.ubicacionEtiqueta}
          titulo={`Editar ${numeroOrdenCompra(detalle.numero)}`}
          subtitulo="Corrige lo que le pediste a un proveedor."
          volver={volver}
        />
        <Aviso
          tono="atencion"
          guia="orden-form.anulada"
          titulo="Esta orden está anulada: ya no se puede editar"
          accion={<BotonEnlace href={`/compras/ordenes/ver/${detalle.id}`}>Ver la orden</BotonEnlace>}
        >
          Su número no vuelve a usarse. Si todavía hace falta pedir esto, crea una orden nueva.
        </Aviso>
      </div>
    );
  }

  return (
    <NuevaOrdenCompra
      key={detalle.version}
      datos={datos}
      sede={persona.ubicacionEtiqueta}
      hoy={hoyLima()}
      destinoInicial=""
      editar={{
        id: detalle.id,
        numero: detalle.numero,
        version: detalle.version,
        inicial: borradorDeDetalle(detalle),
        entregaOriginal: detalle.fechaEntregaEstimada ?? "",
      }}
    />
  );
}
