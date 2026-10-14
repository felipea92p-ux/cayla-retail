import { FileX } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDatosEnvioOrden } from "@/lib/ordenes-compra";
import { numeroOrdenCompra, puedeEnviarOrden } from "@/lib/ordenes-compra-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { EnviarOrdenASede } from "@/components/ordenes-compra/EnviarOrdenASede";

// Enviar una orden de compra a una sede (ADR-0362, fase 3): la guía que lleva lo de la orden a UNA sede. Hermana de `comprobante/[id]`: la
// puerta del módulo la pone `ordenes/layout.tsx`, y las reglas viven en `crear_envio` (la pantalla las espeja para decirlas antes de
// pulsar). El comprobante no bloquea (decisión 9): se envía con o sin papel.
//
// Solo una orden «generada» con algo por enviar. Una anulada no se envía; una que ya salió toda tampoco (lo dice, sin ofrecer un
// formulario vacío). Si la base aún no conoce los envíos (la web publicada antes que la migración), lo dice: nunca un formulario que falle
// al guardar. En una «Por repartir» la sede se elige entre las activas: sin esa lista no hay a dónde enviar, y también se dice.
export default async function EnviarOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await exigirModulo("ordenes_compra");
  const { id } = await params;
  const { detalle, falla, sedes } = await getDatosEnvioOrden(id);
  const volver = <Volver href="/compras/ordenes" a="Órdenes de compra" />;
  const subtitulo = "Lo que sale de la orden hacia una sede, en una guía.";

  if (falla || !detalle) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Enviar a una sede" subtitulo={subtitulo} volver={volver} />
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
  const cabecera = <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo={`Enviar ${nombre}`} subtitulo={subtitulo} volver={volver} />;
  const verOrden = <BotonEnlace href={`/compras/ordenes/ver/${detalle.id}`}>Ver la orden</BotonEnlace>;

  if (detalle.estado !== "generada") {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso tono="atencion" titulo="Esta orden está anulada: no se envía" accion={verOrden}>
          Su número no vuelve a usarse. Si todavía hace falta mandar esto, crea una orden nueva.
        </Aviso>
      </div>
    );
  }

  // La base sabe de envíos cuando la orden trae `envios` y cada línea dice cuánto le queda por enviar.
  const baseSabe = detalle.envios !== null && detalle.lineas.every((l) => l.id !== null && l.porEnviar !== null);
  if (!baseSabe) {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso tono="atencion" titulo="Enviar a una sede todavía no está listo">
          El servidor aún no tiene esta parte. Vuelve a intentarlo más tarde; si sigue, avísale a tu líder.
        </Aviso>
      </div>
    );
  }

  if (!puedeEnviarOrden(detalle)) {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso tono="info" titulo="Ya salió todo lo de esta orden" accion={verOrden}>
          No queda nada por enviar. Si un envío salió mal, anúlalo desde la orden mientras siga en camino y vuelve a enviar.
        </Aviso>
      </div>
    );
  }

  // Una «Por repartir» elige la sede entre las activas: si esa lista no cargó, no hay a dónde enviar (y no se inventa una).
  if (!detalle.destino && (sedes === null || sedes.length === 0)) {
    return (
      <div className="space-y-6">
        {cabecera}
        <Aviso tono="error" titulo="No se pudieron leer las sedes">
          Sin la lista de sedes no se puede elegir a dónde enviar. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.
        </Aviso>
      </div>
    );
  }

  return <EnviarOrdenASede orden={detalle} sedes={sedes ?? []} sede={persona.ubicacionEtiqueta} />;
}
