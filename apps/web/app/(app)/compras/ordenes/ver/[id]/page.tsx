import { FileX } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDetalleOrden, getEmpresaParaOrden } from "@/lib/ordenes-compra";
import { numeroOrdenCompra } from "@/lib/ordenes-compra-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { DetalleOrdenCompra } from "@/components/ordenes-compra/DetalleOrdenCompra";
import { AccionesOrden } from "@/components/ordenes-compra/AccionesOrden";

// Una orden de compra en página completa (ADR-0362, fase 1 · actividad 3): lo que se ve al recargar o compartir el enlace de la ventana
// que se abre desde la lista (`@modal/(.)ordenes/ver/[id]`). Vive en `/compras/ordenes/ver/<id>` y no en `/compras/ordenes/<id>` a
// propósito: Next modela una ruta interceptada como una reescritura que va ANTES que las páginas (`beforeFiles`), así que una
// interceptada `ordenes/[id]` se tragaba `/compras/ordenes/nueva` (la abría como ventana vacía sobre la lista). Con «ver» delante no
// la toca, y como cuelga de `/compras/ordenes` el menú marca «Órdenes de compra» (en `/compras/orden/<id>` marcaba «Facturas de
// proveedor», cuya ruta es `/compras`). La puerta del módulo la pone `ordenes/layout.tsx`; aquí se pide la persona para la cabecera.
export default async function OrdenCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await exigirModulo("ordenes_compra");
  const { id } = await params;
  const [{ detalle, falla }, empresa] = await Promise.all([getDetalleOrden(id), getEmpresaParaOrden()]);
  const volver = <Volver href="/compras/ordenes" a="Órdenes de compra" />;

  if (falla || !detalle) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Orden de compra" subtitulo="Lo que se le pidió a un proveedor." volver={volver} />
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
                <BotonEnlace href="/compras/ordenes" peso="primario">{/* unificar-fijo: la acción de un vacío (ronda 5): ahí, ir a otra pantalla es el paso principal */}
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

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo={numeroOrdenCompra(detalle.numero)}
        // Qué es, no lo que dice debajo: el proveedor y a dónde llega están en la orden misma (Formidable, 2026-10-10, ley 8).
        subtitulo="Lo que se le pidió a un proveedor."
        volver={volver}
        acciones={<AccionesOrden lugar="cabecera" orden={detalle} empresa={empresa} />}
      />
      <div className="card-cayla p-5">
        <DetalleOrdenCompra orden={detalle} />
      </div>
    </div>
  );
}
