"use client";

import { useState } from "react";
import { MessageCircle, PackageCheck } from "lucide-react";
import { AvisarLlegadaModal } from "@/components/PedidoClienteModales";
import type { ControlResponsable } from "@/lib/useResponsable";
import { etiquetaLinea, type PedidoEntreSedes } from "@/lib/pedidos-entre-sedes-reglas";
import { nombreCliente, porAvisarAlCliente } from "@/lib/pedidos-con-cliente-reglas";
import { nombreCortoSede } from "@/lib/stock-por-sede";

/**
 * «Llegó para un cliente» (ADR-0328 act. 17; Felipe: «se avisa al cliente al llegar»). Lo que esta tienda pidió a otra para
 * un cliente y ya llegó, mientras nadie le haya avisado: una franja en Vender, que es donde está quien atiende (la asesora
 * no siempre tiene Apartados ni Traslados). «Avisar por WhatsApp» abre el mensaje listo y deja constancia; la franja se va
 * sola al refrescar. Firma quien atiende la caja (el mismo combo del ticket).
 */
export function PedidosQueLlegaron({
  pedidos,
  sede,
  responsable,
}: {
  pedidos: readonly PedidoEntreSedes[];
  sede: { ubicacionId: string; etiqueta: string };
  responsable: ControlResponsable;
}) {
  const lista = porAvisarAlCliente(pedidos);
  const [abierto, setAbierto] = useState<(typeof lista)[number] | null>(null);
  const modal = abierto && <AvisarLlegadaModal pedido={abierto} sede={sede} responsable={responsable} onClose={() => setAbierto(null)} />;
  // Al avisar, la franja se refresca y el pedido sale de la lista: la ventana sigue abierta hasta que la persona la cierra.
  if (lista.length === 0) return modal || null;
  return (
    <div role="status" className="anim-revelar border-b border-sand bg-verde/[0.06] px-4 py-2.5 text-sm sm:px-6">
      <ul className="space-y-1.5">
        {lista.map((p) => (
          <li key={p.grupoId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <PackageCheck aria-hidden className="h-4 w-4 shrink-0 text-verde-profundo" strokeWidth={1.75} />
            <p className="min-w-0 flex-1">
              Llegó de {nombreCortoSede(p.otraSede)} para <b className="font-semibold">{nombreCliente(p.cliente)}</b>
              <span className="text-tinta/65"> · {p.lineas.map(etiquetaLinea).join(", ")}</span>
            </p>
            <button
              type="button"
              onClick={() => setAbierto(p)}
              className="label-cayla inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-tinta/25 bg-papel px-2.5 text-[10.5px] text-tinta transition-colors hover:border-tinta"
            >
              <MessageCircle aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
              Avisar por WhatsApp
            </button>
          </li>
        ))}
      </ul>
      {modal}
    </div>
  );
}
