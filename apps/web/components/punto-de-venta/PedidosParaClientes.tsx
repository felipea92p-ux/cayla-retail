"use client";

import { useState } from "react";
import { MessageCircle, PackageCheck, PackageX } from "lucide-react";
import { AvisarAlClienteModal } from "@/components/PedidoClienteModales";
import type { ControlResponsable } from "@/lib/useResponsable";
import { etiquetaLinea, type PedidoEntreSedes } from "@/lib/pedidos-entre-sedes-reglas";
import { nombreCliente, porAvisarAlCliente, type PedidoPorAvisar } from "@/lib/pedidos-con-cliente-reglas";
import { nombreCortoSede } from "@/lib/stock-por-sede";

/**
 * Los pedidos que esta tienda hizo a otra para un cliente y que piden un paso de quien atiende (ADR-0328 act. 17): una franja
 * en Vender, que es donde está quien atiende (la asesora no siempre tiene Apartados ni Traslados).
 *   · «Llegó de Lima para Ana» (Felipe: «se avisa al cliente al llegar»).
 *   · «No llegó de Lima para Ana» (decisión del 2026-10-04): la otra sede dijo «No la tengo» o el envío se cerró sin ella.
 *     Va primero: ese cliente sigue esperando algo que no viene.
 * «Avisar por WhatsApp» abre el mensaje listo y deja constancia; la fila se va sola al refrescar. Firma quien atiende la
 * caja (el mismo combo del ticket). El Inicio de la tienda dice lo mismo y trae hasta aquí.
 */
export function PedidosParaClientes({
  pedidos,
  sede,
  responsable,
}: {
  pedidos: readonly PedidoEntreSedes[];
  sede: { ubicacionId: string; etiqueta: string };
  responsable: ControlResponsable;
}) {
  const lista = porAvisarAlCliente(pedidos);
  const [abierto, setAbierto] = useState<PedidoPorAvisar | null>(null);
  const modal = abierto && (
    <AvisarAlClienteModal pedido={abierto} aviso={abierto.aviso} sede={sede} responsable={responsable} onClose={() => setAbierto(null)} />
  );
  // Al avisar, la franja se refresca y el pedido sale de la lista: la ventana sigue abierta hasta que la persona la cierra.
  if (lista.length === 0) return modal || null;
  // Si algo no llegó, la franja entera toma el tono de «por hacer»: no es una buena noticia.
  const hayMalas = lista.some((p) => p.aviso !== "llego");
  return (
    <div role="status" className={`anim-revelar border-b border-sand px-4 py-2.5 text-sm sm:px-6 ${hayMalas ? "bg-ambar/[0.07]" : "bg-verde/[0.06]"}`}>
      <ul className="space-y-1.5">
        {lista.map((p) => {
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
              <button
                type="button"
                onClick={() => setAbierto(p)}
                className="label-cayla inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-tinta/25 bg-papel px-2.5 text-[10.5px] text-tinta transition-colors hover:border-tinta"
              >
                <MessageCircle aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                {llego ? "Avisar por WhatsApp" : "Avisar que no llegó"}
              </button>
            </li>
          );
        })}
      </ul>
      {modal}
    </div>
  );
}
