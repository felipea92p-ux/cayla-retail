"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/precio-sede-reglas";
import { camposAnularPago } from "@/lib/pedidos-web-guia";
import {
  MOTIVOS_ANULAR_PAGO,
  detalleDelPago,
  efectoDeAnular,
  errorDelPago,
  textoDelPago,
  type MotivoAnularPago,
} from "@/lib/pedidos-web-cobro-reglas";
import type { PagoDeLista, PedidoDetalle } from "@/lib/pedidos-web-reglas";

/**
 * Anular un pago de un pedido web (ADR-0408, actividad 9): uno que se anotó mal, o el que se le devuelve al cliente (el de un pedido
 * anulado: «Devolver»). Con su motivo y quién lo hace. Si fue efectivo, la plata sale de la caja abierta de la tienda el día en que se
 * devuelve —no de la que lo recibió— (decisión de Felipe, ADR-0408 act. c): sin caja abierta, o si esa caja no tiene ese efectivo, no
 * se puede (lo frena la base). Un pago digital se anula sin tocar la caja. El pago no se borra: queda tachado, con quién y por qué.
 *
 * No lleva marca de envío: anular dos veces el mismo pago lo rechaza la base («ya estaba anulado»), y eso aquí se lee como «ya está».
 */
export function AnularPagoHoja({
  pedido: p,
  pago,
  ahora,
  onClose,
  onAnulado,
}: {
  pedido: PedidoDetalle;
  pago: PagoDeLista;
  ahora: number;
  onClose: () => void;
  /** La base anuló el pago (o ya estaba): la hoja del pedido y la lista se ponen al día. */
  onAnulado: () => void;
}) {
  const responsable = useResponsable({ ubicacionId: p.ubicacionId, etiqueta: p.tienda });
  const [motivo, setMotivo] = useState<MotivoAnularPago | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorBase, setErrorBase] = useState<{ titulo: string; detalle: string } | null>(null);
  // Un doble clic no manda dos veces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);
  const devolver = p.estado === "anulado";
  const efectivo = pago.medio === "efectivo";
  const guia = useGuiaCampos(
    camposAnularPago({ medio: pago.medio, motivo, cajaAbierta: p.cajaAbierta, tienda: p.tienda, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }),
  );

  async function anular(cerrar: () => void) {
    if (enVuelo.current || !guia.puedeConfirmar || !motivo) return;
    enVuelo.current = true;
    setGuardando(true);
    setErrorBase(null);
    const { error } = await firmar(createClient().rpc("anular_pago_pedido_web", { p_pago_id: pago.id, p_motivo: motivo }), responsable.firma());
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      const propio = errorDelPago(error);
      if (propio?.releer) {
        // Ya estaba anulado (un doble clic, otra caja) o el pedido quedó pagado completo mientras tanto: se cierra y se relee.
        avisar.aviso(propio.titulo, { detalle: propio.detalle });
        onAnulado();
        cerrar();
        return;
      }
      setErrorBase(propio ? { titulo: propio.titulo, detalle: propio.detalle } : { titulo: "No se pudo anular el pago", detalle: traducirError(error, "anular el pago") });
      return;
    }
    avisar.exito(devolver ? `Devolución de ${soles(pago.monto)} registrada` : `Pago de ${soles(pago.monto)} anulado`, {
      detalle: efectivo ? `Salió de la caja de ${p.tienda}.` : devolver ? "La caja no cambia." : `Vuelve a faltar ${soles(pago.monto)} en el pedido.`,
    });
    onAnulado();
    cerrar();
  }

  return (
    <Modal
      titulo={devolver ? "Devolver un pago" : "Anular un pago"}
      subtitulo={`Pedido ${p.codigo} · ${p.cliente.nombre}`}
      onClose={onClose}
      tamano="angosta"
      bloqueado={guardando}
    >
      {(cerrar) => (
        <div className="space-y-4">
          <div className="rounded-xl border border-sand px-4 py-3">
            <span className="block font-medium tabular-nums text-tinta">{textoDelPago(pago)}</span>
            <span className="block text-[12.5px] text-taupe">{detalleDelPago(pago, ahora, p.tienda)}</span>
          </div>

          {efectivo ? (
            <CampoGuiado id="caja" guia={guia}>
              {p.cajaAbierta === false ? (
                <Aviso
                  tono="atencion"
                  accion={
                    <BotonVer href="/caja" chico>
                      Ir a Caja
                    </BotonVer>
                  }
                >
                  No hay una caja abierta en {p.tienda}: ábrela para sacar el efectivo de este pago.
                </Aviso>
              ) : (
                <Aviso tono="atencion">{efectoDeAnular(pago, motivo, p.tienda)}</Aviso>
              )}
            </CampoGuiado>
          ) : (
            <Aviso tono="info">{efectoDeAnular(pago, motivo, p.tienda)}</Aviso>
          )}

          <CampoGuiado id="motivo" guia={guia} titulo={devolver ? "¿Por qué se anula este pago?" : "¿Por qué se anula?"}>
            <SegmentoDeslizante
              etiqueta="Por qué se anula el pago"
              opciones={MOTIVOS_ANULAR_PAGO.map((m) => ({ clave: m.clave, etiqueta: m.etiqueta }))}
              valor={motivo ?? ""}
              onCambio={(c) => {
                setMotivo(c as MotivoAnularPago);
                setErrorBase(null);
              }}
            />
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <div className="pie-hoja-fijo space-y-2 pt-1">
            {/* En el pie pegado: el «no hay tanto efectivo» de la base se ve sin bajar. */}
            {errorBase && (
              <Aviso tono="error" titulo={errorBase.titulo}>
                {errorBase.detalle}
              </Aviso>
            )}
            {/* Con un «no» de la base a la vista, «Todo listo» la contradiría. */}
            {!errorBase && <PieGuia guia={guia} />}
            <PieAcciones>
              <Boton type="button" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton
                type="button"
                peso="peligro"
                cargando={guardando}
                textoCargando="Anulando…"
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? undefined}
                onClick={() => anular(cerrar)}
              >
                {devolver ? `Devolver ${soles(pago.monto)}` : "Anular el pago"}
              </Boton>
            </PieAcciones>
          </div>
        </div>
      )}
    </Modal>
  );
}
