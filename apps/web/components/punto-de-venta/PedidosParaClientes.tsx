"use client";

import { useState } from "react";
import { CircleHelp, MessageCircle, PackageCheck, PackageX } from "lucide-react";
import { AvisarAlClienteModal, SigueEnPieModal } from "@/components/PedidoClienteModales";
import type { ControlResponsable } from "@/lib/useResponsable";
import { etiquetaLinea, type PedidoEntreSedes } from "@/lib/pedidos-entre-sedes-reglas";
import { diasEsperando, nombreCliente, porAvisarAlCliente, porPreguntarSiSigue, type ClientePedido, type PedidoPorAvisar } from "@/lib/pedidos-con-cliente-reglas";
import { nombreCortoSede } from "@/lib/stock-por-sede";

type ConCliente = PedidoEntreSedes & { cliente: ClientePedido };
type Abierto = { tipo: "avisar"; pedido: PedidoPorAvisar } | { tipo: "pregunta"; pedido: ConCliente };

const BOTON = "btn-cayla btn-secundario inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[12.5px]";

/**
 * Los pedidos que esta tienda hizo a otra para un cliente y que piden un paso de quien atiende (ADR-0328 act. 17): una franja
 * en Vender, que es donde está quien atiende (la asesora no siempre tiene Apartados ni Traslados).
 *   · «No llegó de Lima para Ana» (decisión del 2026-10-04): la otra sede dijo «No la tengo» o el envío se cerró sin ella.
 *     Va primero: ese cliente sigue esperando algo que no viene.
 *   · «Llegó de Lima para Ana» (Felipe: «se avisa al cliente al llegar»).
 *   · «¿Sigue en pie el pedido de Ana?» (decisión del 2026-10-04): la reserva allá no vence sola; a los 7 días esta tienda
 *     responde «Sí» o «Ya no la quiere».
 * «Avisar» abre el WhatsApp listo y deja constancia; la fila se va sola al refrescar. Firma quien atiende la caja (el mismo
 * combo del ticket). El Inicio de la tienda dice lo mismo y trae hasta aquí. `ahoraIso` viene del servidor (como en
 * Traslados): los días se cuentan igual en el HTML del servidor y en el navegador.
 */
export function PedidosParaClientes({
  pedidos,
  sede,
  responsable,
  ahoraIso,
}: {
  pedidos: readonly PedidoEntreSedes[];
  sede: { ubicacionId: string; etiqueta: string };
  responsable: ControlResponsable;
  ahoraIso: string;
}) {
  const avisos = porAvisarAlCliente(pedidos);
  const preguntas = ahoraIso ? porPreguntarSiSigue(pedidos, ahoraIso) : [];
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const cerrar = () => setAbierto(null);
  const modal =
    abierto?.tipo === "avisar" ? (
      <AvisarAlClienteModal pedido={abierto.pedido} aviso={abierto.pedido.aviso} sede={sede} responsable={responsable} onClose={cerrar} />
    ) : abierto?.tipo === "pregunta" ? (
      <SigueEnPieModal pedido={abierto.pedido} sede={sede} ahoraIso={ahoraIso} responsable={responsable} onClose={cerrar} />
    ) : null;
  // Al responder, la franja se refresca y el pedido sale de la lista: la ventana sigue abierta hasta que la persona la cierra.
  if (avisos.length + preguntas.length === 0) return modal;
  // Si algo no llegó o hay que preguntar, la franja entera toma el tono de «por hacer»: no es solo una buena noticia.
  const todoLlego = preguntas.length === 0 && avisos.every((p) => p.aviso === "llego");
  return (
    <div role="status" className={`anim-revelar border-b border-sand px-4 py-2.5 text-sm sm:px-6 ${todoLlego ? "bg-verde/[0.06]" : "bg-ambar/[0.07]"}`}>
      <ul className="space-y-1.5">
        {avisos.map((p) => {
          const llego = p.aviso === "llego";
          const Icono = llego ? PackageCheck : PackageX;
          return (
            <li key={p.grupoId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Icono aria-hidden className={`h-4 w-4 shrink-0 ${llego ? "text-verde-profundo" : "text-ambar-profundo"}`} strokeWidth={1.75} />
              {/* Con un ancho mínimo, en un celular el botón baja bajo el texto en vez de apretarlo en una columna de 2 palabras. */}
              <p className="min-w-[12rem] flex-1">
                {llego ? "Llegó" : "No llegó"} de {nombreCortoSede(p.otraSede)} para <b className="font-semibold">{nombreCliente(p.cliente)}</b>
                <span className="text-tinta/65"> · {p.lineas.map(etiquetaLinea).join(", ")}</span>
              </p>
              <button type="button" onClick={() => setAbierto({ tipo: "avisar", pedido: p })} className={BOTON}>
                <MessageCircle aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                {llego ? "Avisar por WhatsApp" : "Avisar que no llegó"}
              </button>
            </li>
          );
        })}
        {preguntas.map((p) => (
          <li key={p.grupoId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <CircleHelp aria-hidden className="h-4 w-4 shrink-0 text-ambar-profundo" strokeWidth={1.75} />
            <p className="min-w-[12rem] flex-1">
              ¿Sigue en pie el pedido de <b className="font-semibold">{nombreCliente(p.cliente)}</b>?
              <span className="text-tinta/65">
                {" "}
                · {nombreCortoSede(p.otraSede)} la tiene apartada hace {diasEsperando(p, ahoraIso)} días · {p.lineas.map(etiquetaLinea).join(", ")}
              </span>
            </p>
            <button type="button" onClick={() => setAbierto({ tipo: "pregunta", pedido: p })} className={BOTON}>
              Responder
            </button>
          </li>
        ))}
      </ul>
      {modal}
    </div>
  );
}
