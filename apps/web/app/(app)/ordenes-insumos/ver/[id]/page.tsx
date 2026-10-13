import { FileX } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDetalleOrdenInsumo, getEmpresaParaOrden } from "@/lib/ordenes-insumo";
import { RUTA_ORDENES_INSUMO, numeroOrdenInsumo } from "@/lib/ordenes-insumo-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { DetalleOrdenInsumo } from "@/components/ordenes-insumo/DetalleOrdenInsumo";
import { AccionesOrdenInsumo } from "@/components/ordenes-insumo/AccionesOrdenInsumo";

// Una orden de insumos en página completa (ADR-0362, fase 7 · actividad 2): lo que se ve al recargar o compartir el enlace de la ventana
// que se abre desde la lista (`@modal/(.)ver/[id]`). Vive en `/ordenes-insumos/ver/<id>` y no en `/ordenes-insumos/<id>` por la misma
// razón que la orden de compra: una interceptada `[id]` se tragaría `/ordenes-insumos/nueva`. La puerta del módulo la pone el layout;
// aquí se pide la persona para la cabecera.
export default async function OrdenInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await exigirModulo("ordenes_insumos");
  const { id } = await params;
  const [{ detalle, falla }, empresa] = await Promise.all([getDetalleOrdenInsumo(id), getEmpresaParaOrden()]);
  const volver = <Volver href={RUTA_ORDENES_INSUMO} a="Órdenes de insumos" />;

  if (falla || !detalle) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Orden de insumos" subtitulo="Lo que se le pidió a un proveedor del Taller." volver={volver} />
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

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo={numeroOrdenInsumo(detalle.numero)}
        // Qué es, no lo que dice debajo: el proveedor y a dónde llega están en la orden misma.
        subtitulo="Lo que se le pidió a un proveedor del Taller."
        volver={volver}
        acciones={<AccionesOrdenInsumo lugar="cabecera" orden={detalle} empresa={empresa} />}
      />
      <div className="card-cayla p-5">
        <DetalleOrdenInsumo orden={detalle} />
      </div>
    </div>
  );
}
