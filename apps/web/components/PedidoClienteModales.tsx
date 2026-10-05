"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { enlaceWhatsAppA } from "@/lib/facturacion-comprobantes-reglas";
import type { PedidoEntreSedes } from "@/lib/pedidos-entre-sedes-reglas";
import { mensajeLlegoTuPrenda, nombreCliente, textoSubirAlAlmacen, type ClientePedido, type PedidoParaSubir } from "@/lib/pedidos-con-cliente-reglas";

// Dos ventanas cortas de los pedidos PARA UN CLIENTE (ADR-0328 act. 17). Cada una tiene un solo control (quién lo hace):
// no llevan la guía de foco por campos (se declaran «no-aplica» en `lib/guia-de-foco-pantallas.ts`).
//   · «Subir al almacén»: el primer paso de dos (Felipe) cuando la prenda apartada para el cliente está colgada (o cuando
//     alguien liberó la reserva y no se sabe dónde quedó). La abren Traslados y Apartados con la misma regla
//     (`envioConCliente`): por eso recibe solo lo que dibuja, no la fila de una de las dos listas.
//   · «Avisar al cliente»: abre WhatsApp con el mensaje listo y deja constancia (`marcar_pedido_avisado`).

type Sede = { ubicacionId: string; etiqueta: string };
type PedidoConCliente = PedidoEntreSedes & { cliente: ClientePedido };

/** La sede que tiene la prenda la baja del colgador y la guarda: queda apartada en el almacén, lista para el próximo envío. */
export function SubirPedidoAlAlmacenModal({ pedido, ubicacion, onClose }: { pedido: PedidoParaSubir; ubicacion: Sede; onClose: () => void }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const responsable = useResponsable(ubicacion);
  const prenda = pedido.prenda;

  async function subir(cerrar: () => void) {
    if (!responsable.listo) return;
    setEnviando(true);
    const { data, error } = await firmar(createClient().rpc("subir_pedido_al_almacen", { p_pedido_id: pedido.id }), responsable.firma());
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "subir la prenda al almacén"));
    const yaEstaba = typeof data === "object" && data !== null && (data as { ya_estaba?: unknown }).ya_estaba === true;
    avisar.exito(yaEstaba ? "Ya estaba en el almacén" : "Lista para enviar", {
      detalle: `${prenda} sigue apartada para ${pedido.cliente}, ahora en el almacén. Ya puedes enviarla.`,
    });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="Subir al almacén" subtitulo={`Para ${pedido.cliente} · pedido de ${pedido.otraSede}`} onClose={onClose} ancho="max-w-md" bloqueado={enviando}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="card-cayla p-4 text-sm text-tinta">{prenda}</p>
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">{textoSubirAlAlmacen(pedido.reservaEn, pedido.otraSede)}</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={enviando}>
              Mejor no
            </button>
            <button type="button" disabled={enviando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => subir(cerrar)} className={botonPrimario}>
              {enviando ? "Guardando…" : "Ya la subí al almacén"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * La sede que pidió le avisa al cliente que su prenda llegó. El enlace abre WhatsApp con el mensaje listo (es un toque de la
 * persona: el sistema no manda mensajes solo) y, al tocarlo, se deja constancia de quién avisó. Si la constancia falla, el
 * WhatsApp ya se abrió: se dice, sin repetir el mensaje. `responsable`: el combo que ya está en pantalla (Vender); sin él,
 * la ventana usa el suyo.
 */
export function AvisarLlegadaModal({
  pedido,
  sede,
  responsable: externo,
  onClose,
}: {
  pedido: PedidoConCliente;
  sede: Sede;
  responsable?: ControlResponsable;
  onClose: () => void;
}) {
  const router = useRouter();
  // Desde Traslados es una operación más («¿Quién hace esta operación?»); Vender pasa su propio combo, el de atender.
  const propio = useResponsable(sede);
  const responsable = externo ?? propio;
  const [estado, setEstado] = useState<"listo" | "guardando" | "hecho">("listo");
  const linea = pedido.lineas[0];
  const mensaje = mensajeLlegoTuPrenda({
    nombres: pedido.cliente.nombres,
    producto: linea?.producto ?? "prenda",
    color: linea?.color ?? null,
    talla: linea?.talla ?? null,
    sede: sede.etiqueta,
    guardadaHasta: pedido.cliente.guardadaHasta,
  });
  const enlace = enlaceWhatsAppA(pedido.cliente.celular, mensaje);

  async function marcar() {
    if (!responsable.listo || estado !== "listo") return;
    setEstado("guardando");
    const { error } = await firmar(createClient().rpc("marcar_pedido_avisado", { p_pedido_id: pedido.grupoId }), responsable.firma());
    if (error) {
      // Solo ante un rechazo: con éxito, `despues` soltaría a quien atiende una venta en curso.
      responsable.despues(error);
      setEstado("listo");
      return void avisar.error(traducirError(error, "dejar constancia del aviso"), { detalle: "El WhatsApp ya se abrió: no hace falta escribirle otra vez." });
    }
    setEstado("hecho");
    avisar.exito(`Aviso registrado: ${nombreCliente(pedido.cliente)}`, { detalle: "Queda constancia de quién le avisó." });
    router.refresh();
  }

  return (
    <Modal titulo={`Avisar a ${nombreCliente(pedido.cliente)}`} subtitulo="Llegó su prenda y está guardada" onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <div className="space-y-4">
          <p className="rounded-xl bg-hueso px-3.5 py-3 text-sm text-tinta/85">{mensaje}</p>
          {estado !== "hecho" && !responsable.listo && <ComboResponsable control={responsable} />}
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              {estado === "hecho" ? "Listo" : "Ahora no"}
            </button>
            {estado !== "hecho" && (
              <a
                href={enlace}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!responsable.listo || estado !== "listo"}
                title={responsable.motivo ?? undefined}
                onClick={(e) => {
                  if (!responsable.listo || estado !== "listo") return e.preventDefault();
                  void marcar();
                }}
                className={`${botonPrimario} inline-flex items-center justify-center gap-2 ${!responsable.listo || estado !== "listo" ? "pointer-events-none opacity-50" : ""}`}
              >
                <MessageCircle aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                {estado === "guardando" ? "Guardando…" : "Abrir WhatsApp"}
              </a>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
