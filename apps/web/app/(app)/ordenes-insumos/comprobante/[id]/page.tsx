import { FileX } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDatosComprobanteOrdenInsumo } from "@/lib/ordenes-insumo";
import { RUTA_ORDENES_INSUMO, numeroOrdenInsumo } from "@/lib/ordenes-insumo-reglas";
import { baseConPapelDeInsumos } from "@/lib/comprobante-orden-insumo-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { RegistrarComprobanteOrdenInsumo } from "@/components/ordenes-insumo/RegistrarComprobanteOrdenInsumo";

// Registrar el comprobante de una orden de insumos (ADR-0362, fase 7 parte 2 · actividad 1): el papel (factura, boleta, nota de venta, o
// ninguno) que el proveedor del Taller entregó por lo que se le pidió. Hermana de `editar/[id]`: la puerta del módulo la pone el layout, y
// las reglas viven en `registrar_comprobante_orden_insumo` (la pantalla las espeja para decirlas antes de pulsar).
//
// Solo una orden «generada» registra papel (una anulada no). Si la base aún no conoce el papel de una orden de insumos (la web publicada
// antes que la migración), lo dice: nunca un formulario que falle al guardar.
export default async function RegistrarComprobanteOrdenInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await exigirModulo("ordenes_insumos");
  const { id } = await params;
  const { detalle, falla, insumos, fallaListas } = await getDatosComprobanteOrdenInsumo(id);
  const volver = <Volver href={RUTA_ORDENES_INSUMO} a="Órdenes de insumos" />;
  const subtitulo = "El papel que te dio el proveedor del Taller por lo que le pediste.";

  if (falla || !detalle) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Registrar comprobante" subtitulo={subtitulo} volver={volver} />
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
                <BotonEnlace href={RUTA_ORDENES_INSUMO} peso="primario" /* unificar-fijo: la acción de un vacío (ronda 5): ahí, ir a otra pantalla es el paso principal */>
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

  const cabecera = (
    <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo={`Comprobante de ${numeroOrdenInsumo(detalle.numero)}`} subtitulo={subtitulo} volver={volver} />
  );

  if (detalle.estado !== "generada") {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso
          tono="atencion"
          guia="oi-comprobante.anulada"
          titulo="Esta orden está anulada: no recibe comprobantes"
          accion={<BotonEnlace href={`${RUTA_ORDENES_INSUMO}/ver/${detalle.id}`}>Ver la orden</BotonEnlace>}
        >
          Su número no vuelve a usarse. Si todavía hace falta pedir esto, crea una orden nueva.
        </Aviso>
      </div>
    );
  }

  if (!baseConPapelDeInsumos(detalle)) {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso tono="atencion" titulo="Registrar el comprobante de una orden de insumos todavía no está listo">
          El servidor aún no tiene esta parte. Vuelve a intentarlo más tarde; si sigue, avísale a tu líder.
        </Aviso>
      </div>
    );
  }

  return <RegistrarComprobanteOrdenInsumo orden={detalle} insumos={insumos} fallaListas={fallaListas} sede={persona.ubicacionEtiqueta} hoy={hoyLima()} />;
}
