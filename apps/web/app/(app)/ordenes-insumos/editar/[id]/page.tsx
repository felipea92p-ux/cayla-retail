import { FileX } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDatosEditarOrdenInsumo } from "@/lib/ordenes-insumo";
import { RUTA_ORDENES_INSUMO, numeroOrdenInsumo } from "@/lib/ordenes-insumo-reglas";
import { borradorDeDetalleInsumo } from "@/lib/orden-insumo-alta";
import { hoyLima } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { NuevaOrdenInsumo } from "@/components/ordenes-insumo/NuevaOrdenInsumo";

// Editar una orden de insumos (ADR-0362, fase 7 · actividad 2): el mismo formulario que «Nueva orden de insumos», con la orden como está.
// Solo se edita una orden «generada»; una anulada lo dice y lleva a verla. Las reglas viven en `editar_orden_insumo` (las de crear, y lo
// que no se toca no se vuelve a juzgar).
//
// El formulario se monta con `key` = la versión de la orden: si otra persona la guardó mientras se editaba, «Recargar» vuelve a pedir
// esta página, llega la versión nueva y el formulario empieza de cero con lo que la orden dice ahora.
export default async function EditarOrdenInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await exigirModulo("ordenes_insumos");
  const { id } = await params;
  const { datos, detalle, falla } = await getDatosEditarOrdenInsumo(id);
  const volver = <Volver href={RUTA_ORDENES_INSUMO} a="Órdenes de insumos" />;

  if (falla || !detalle) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Editar orden de insumos" subtitulo="Corrige lo que le pediste a un proveedor del Taller." volver={volver} />
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
                <BotonEnlace href={RUTA_ORDENES_INSUMO} peso="primario">
                  Ver las órdenes de insumos
                </BotonEnlace>
              }
            >
              El enlace no corresponde a ninguna orden de insumos.
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
          titulo={`Editar ${numeroOrdenInsumo(detalle.numero)}`}
          subtitulo="Corrige lo que le pediste a un proveedor del Taller."
          volver={volver}
        />
        <Aviso
          tono="atencion"
          guia="oi-form.anulada"
          titulo="Esta orden está anulada: ya no se puede editar"
          accion={<BotonEnlace href={`${RUTA_ORDENES_INSUMO}/ver/${detalle.id}`}>Ver la orden</BotonEnlace>}
        >
          Su número no vuelve a usarse. Si todavía hace falta pedir esto, crea una orden nueva.
        </Aviso>
      </div>
    );
  }

  return (
    <NuevaOrdenInsumo
      key={detalle.version}
      datos={datos}
      sede={persona.ubicacionEtiqueta}
      hoy={hoyLima()}
      destinoInicial={detalle.destino.id}
      editar={{
        id: detalle.id,
        numero: detalle.numero,
        version: detalle.version,
        inicial: borradorDeDetalleInsumo(detalle),
        entregaOriginal: detalle.fechaEntregaEstimada ?? "",
      }}
    />
  );
}
