import { FileX } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDatosComprobanteOrden } from "@/lib/ordenes-compra";
import { numeroOrdenCompra, puedeEditarOrden, puedeRegistrarComprobante } from "@/lib/ordenes-compra-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { RegistrarComprobanteOrden } from "@/components/ordenes-compra/RegistrarComprobanteOrden";

// Registrar el comprobante de una orden de compra (ADR-0362, fase 2 · actividades 4 a 8): el papel (factura, boleta o nota de venta) que
// el proveedor entregó por lo que se le pidió. Hermana de `editar/[id]`: la puerta del módulo la pone `ordenes/layout.tsx`, y las
// reglas viven en `registrar_comprobante_orden` (la pantalla las espeja para decirlas antes de pulsar).
//
// Solo una orden «generada» registra comprobante (una anulada no). Una «Por repartir» también, desde la fase 3: la deuda queda en la sede de
// quien hizo la orden (decisión 46, Felipe 2026-10-12); con una base de la fase 2, que todavía no lo sabe, se explica. Si la base aún no conoce los comprobantes de orden (la web publicada antes que la migración), lo dice: nunca un formulario
// que falle al guardar.
export default async function RegistrarComprobanteOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await exigirModulo("ordenes_compra");
  const { id } = await params;
  const { detalle, falla, ...datos } = await getDatosComprobanteOrden(id);
  const volver = <Volver href="/compras/ordenes" a="Órdenes de compra" />;
  const subtitulo = "El papel que te dio el proveedor por lo que le pediste.";

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
                <BotonEnlace href="/compras/ordenes" peso="primario" /* unificar-fijo: la acción de un vacío (ronda 5): ahí, ir a otra pantalla es el paso principal */>
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

  const nombre = numeroOrdenCompra(detalle.numero);
  const cabecera = <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo={`Comprobante de ${nombre}`} subtitulo={subtitulo} volver={volver} />;

  if (detalle.estado !== "generada") {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso tono="atencion" titulo="Esta orden está anulada: no recibe comprobantes" accion={<BotonEnlace href={`/compras/ordenes/ver/${detalle.id}`}>Ver la orden</BotonEnlace>}>
          Su número no vuelve a usarse. Si todavía hace falta pedir esto, crea una orden nueva.
        </Aviso>
      </div>
    );
  }

  if (!detalle.destino && !detalle.deudaDe) {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso
          tono="atencion"
          titulo="Esta orden está «Por repartir»: todavía no se registra su comprobante aquí"
          accion={puedeEditarOrden(detalle) ? <BotonEnlace href={`/compras/ordenes/editar/${detalle.id}`}>Editar la orden</BotonEnlace> : undefined}
        >
          Si la mercadería llega a una sola tienda, edita la orden y elige cuál en «Llega a»; después podrás registrar su comprobante.
        </Aviso>
      </div>
    );
  }

  if (!puedeRegistrarComprobante(detalle)) {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso tono="atencion" titulo="Registrar comprobantes de una orden todavía no está listo">
          El servidor aún no tiene esta parte. Vuelve a intentarlo más tarde; si sigue, avísale a tu líder.
        </Aviso>
      </div>
    );
  }

  return <RegistrarComprobanteOrden orden={detalle} datos={datos} sede={persona.ubicacionEtiqueta} hoy={hoyLima()} />;
}
