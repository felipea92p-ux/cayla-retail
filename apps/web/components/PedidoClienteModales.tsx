"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle } from "lucide-react";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { enlaceWhatsAppA } from "@/lib/facturacion-comprobantes-reglas";
import { etiquetaLinea, type PedidoEntreSedes } from "@/lib/pedidos-entre-sedes-reglas";
import {
  DIAS_PARA_PREGUNTAR,
  avisoParaLaVentana,
  nombreCliente,
  textoSigueEnPie,
  textoSubirAlAlmacen,
  type AvisoAlCliente,
  type ClientePedido,
  type PedidoParaSubir,
} from "@/lib/pedidos-con-cliente-reglas";

// Tres ventanas cortas de los pedidos PARA UN CLIENTE (ADR-0328 act. 17). Cada una tiene un solo control (quién lo hace):
// no llevan la guía de foco por campos (se declaran «no-aplica» en `lib/guia-de-foco-pantallas.ts`).
//   · «Subir al almacén»: el primer paso de dos (Felipe) cuando la prenda apartada para el cliente está colgada (o cuando
//     alguien liberó la reserva y no se sabe dónde quedó). La abren Traslados y Apartados con la misma regla
//     (`envioConCliente`): por eso recibe solo lo que dibuja, no la fila de una de las dos listas.
//   · «Avisar al cliente»: abre WhatsApp con el mensaje listo y deja constancia (`marcar_pedido_avisado`). Sirve para los
//     dos finales (decisión del 2026-10-04): «llegó tu prenda» y «no va a poder llegar».
//   · «¿Sigue en pie?» (decisión del 2026-10-04): la reserva allá no vence sola; a los 7 días la tienda que pidió responde
//     «Sí» (`confirmar_pedido_sigue_en_pie`) o «Ya no la quiere» (`cancelar_pedido_para_apartar`, que la suelta allá).

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
      detalle: `${prenda} sigue apartada para el pedido de ${pedido.otraSede}, ahora en el almacén. Ya puedes enviarla.`,
    });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="Subir al almacén" subtitulo={`Pedido de ${pedido.otraSede} para un cliente`} onClose={onClose} ancho="max-w-md" bloqueado={enviando}>
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
 * La sede que pidió le avisa al cliente cómo terminó su pedido: que llegó, o que no va a llegar (`aviso`). El enlace abre
 * WhatsApp con el mensaje listo (es un toque de la persona: el sistema no manda mensajes solo) y, al tocarlo, se deja
 * constancia de quién avisó. Si la constancia falla, el WhatsApp ya se abrió: se dice, sin repetir el mensaje.
 * `responsable`: el combo que ya está en pantalla (Vender); sin él, la ventana usa el suyo.
 */
export function AvisarAlClienteModal({
  pedido,
  aviso,
  sede,
  responsable: externo,
  onClose,
}: {
  pedido: PedidoConCliente;
  aviso: AvisoAlCliente;
  sede: Sede;
  responsable?: ControlResponsable;
  onClose: () => void;
}) {
  const router = useRouter();
  // Desde Traslados es una operación más («¿Quién hace esta operación?»); Vender pasa su propio combo, el de atender.
  const propio = useResponsable(sede);
  const responsable = externo ?? propio;
  const [estado, setEstado] = useState<"listo" | "guardando" | "hecho">("listo");
  const { titulo, subtitulo, mensaje } = avisoParaLaVentana(aviso, pedido, sede.etiqueta);
  // Sin celular (ADR-0367) no hay WhatsApp: se le avisa como se acordó (llamada, en persona) y aquí solo queda la constancia.
  const conCelular = pedido.cliente.celular !== "";
  const enlace = conCelular ? enlaceWhatsAppA(pedido.cliente.celular, mensaje) : null;

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
    <Modal titulo={titulo} subtitulo={subtitulo} onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <div className="space-y-4">
          <p className="rounded-xl bg-hueso px-3.5 py-3 text-sm text-tinta/85">{mensaje}</p>
          {!conCelular && estado !== "hecho" && (
            <p className="text-xs text-tinta/70">No dejó celular: avísale como acordaron (llamada o en persona) y deja constancia aquí.</p>
          )}
          {estado !== "hecho" && !responsable.listo && <ComboResponsable control={responsable} />}
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              {estado === "hecho" ? "Listo" : "Ahora no"}
            </button>
            {estado !== "hecho" && !enlace && (
              <button
                type="button"
                disabled={!responsable.listo || estado !== "listo"}
                title={responsable.motivo ?? undefined}
                onClick={() => void marcar()}
                className={`${botonPrimario} inline-flex items-center justify-center gap-2`}
              >
                <Check aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                {estado === "guardando" ? "Guardando…" : "Ya le avisé"}
              </button>
            )}
            {estado !== "hecho" && enlace && (
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

/**
 * «¿Sigue en pie el pedido de Ana?» (decisión del 2026-10-04): la reserva en la otra sede no vence sola, así que a los 7 días
 * (desde el pedido o desde el último «Sí») la tienda que pidió responde. «Sí, sigue en pie» deja constancia y la pregunta
 * vuelve en 7 días; «Ya no la quiere» cancela el pedido y la otra sede suelta la prenda. `responsable`: el combo que ya está
 * en pantalla (Vender); sin él, la ventana usa el suyo (Traslados).
 */
export function SigueEnPieModal({
  pedido,
  sede,
  ahoraIso,
  responsable: externo,
  onClose,
}: {
  pedido: PedidoConCliente;
  sede: Sede;
  ahoraIso: string;
  responsable?: ControlResponsable;
  onClose: () => void;
}) {
  const router = useRouter();
  const propio = useResponsable(sede);
  const responsable = externo ?? propio;
  const [guardando, setGuardando] = useState<"sigue" | "cancela" | null>(null);
  const { espera, explicacion } = textoSigueEnPie(pedido, ahoraIso);
  const cliente = nombreCliente(pedido.cliente);

  async function responder(sigue: boolean, cerrar: () => void) {
    if (!responsable.listo || guardando) return;
    setGuardando(sigue ? "sigue" : "cancela");
    const supabase = createClient();
    const { error } = await firmar(
      sigue
        ? supabase.rpc("confirmar_pedido_sigue_en_pie", { p_pedido_id: pedido.grupoId })
        : supabase.rpc("cancelar_pedido_para_apartar", { p_pedido_id: pedido.grupoId, p_motivo: "El cliente ya no la quiere" }),
      responsable.firma(),
    );
    setGuardando(null);
    // Solo ante un rechazo: con éxito, `despues` soltaría a quien atiende una venta en curso (Vender).
    if (error) {
      responsable.despues(error);
      return void avisar.error(traducirError(error, sigue ? "confirmar el pedido" : "cancelar el pedido"));
    }
    avisar.exito(sigue ? `El pedido de ${cliente} sigue en pie` : "Pedido cancelado", {
      detalle: sigue ? `${pedido.otraSede} la sigue guardando. Se te vuelve a preguntar en ${DIAS_PARA_PREGUNTAR} días.` : `${pedido.otraSede} suelta la prenda que tenía apartada.`,
    });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo={`¿Sigue en pie el pedido de ${cliente}?`} subtitulo={espera} onClose={onClose} ancho="max-w-md" bloqueado={guardando !== null}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="card-cayla p-4 text-sm text-tinta">{pedido.lineas.map(etiquetaLinea).join(", ")}</p>
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">{explicacion}</p>
          {!responsable.listo && <ComboResponsable control={responsable} deshabilitado={guardando !== null} />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => responder(false, cerrar)}
              className={botonCancelar}
              disabled={guardando !== null || !responsable.listo}
              title={responsable.motivo ?? undefined}
            >
              {guardando === "cancela" ? "Cancelando…" : "Ya no la quiere"}
            </button>
            <button
              type="button"
              onClick={() => responder(true, cerrar)}
              className={botonPrimario}
              disabled={guardando !== null || !responsable.listo}
              title={responsable.motivo ?? undefined}
            >
              {guardando === "sigue" ? "Guardando…" : "Sí, sigue en pie"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
