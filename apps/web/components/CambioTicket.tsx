"use client";

import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MessageCircle, Plus, Printer, ShoppingBag } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EMISOR } from "@/lib/emisor";
import { enlaceWhatsApp } from "@/lib/facturacion-comprobantes-reglas";
import { fechaHoraLima } from "@/lib/recibo-reglas";
import { textoTicketCambio } from "@/lib/cambios-atajos-reglas";
import { soles } from "@/lib/compras-reglas";

/* ====================================================================
   CambioTicket · lo que la clienta se lleva al terminar un cambio (spike 2026-09-26, opción A)

   Antes el cambio terminaba en una pantalla con 4 datos y un número de 8 letras: la clienta no se llevaba nada que
   dijera qué cambió. Ahora sale una hoja (ADR-0136) con el ticket del cambio y tres salidas:
     · WhatsApp: el resumen en texto (`textoTicketCambio`). La venta no guarda el teléfono de la clienta, así que
       WhatsApp pregunta a quién mandarlo.
     · Imprimir: el mismo resumen en la térmica de 80 mm (`#comprobante-print`, las reglas de impresión de
       `globals.css` que ya usa el comprobante de venta).
     · Seguir vendiendo: si se lleva algo más, al Punto de venta. Es cuando más compra: ya está en la tienda.
   El ticket NO es comprobante de SUNAT y lo dice en los dos formatos: la diferencia de precio sigue sin comprobante
   propio (docs/pantallas/cambios.md §2), y eso es una decisión de dinero pendiente, no de esta hoja.
   ==================================================================== */

export type TicketCambio = {
  operacion: string;
  comprobante: string | null;
  clienta: string | null;
  devolvio: string;
  sellevo: string;
  cantidad: number;
  diferencia: number;
  vaACuarentena: boolean;
  sede: string;
  atendio: string | null;
  registradoEn: string;
};

function Linea({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-tinta/65">{titulo}</span>
      <span className="text-right text-tinta">{children}</span>
    </div>
  );
}

function textoDiferencia(d: number): string {
  return d === 0 ? "Sin diferencia" : d > 0 ? `${soles(d)} cobrados` : `${soles(-d)} devueltos`;
}

export function CambioTicketHoja({ ticket, onNuevo, onCerrar }: { ticket: TicketCambio; onNuevo: () => void; onCerrar: () => void }) {
  const { fecha, hora } = fechaHoraLima(ticket.registradoEn);
  const cantidad = ticket.cantidad > 1 ? ` (×${ticket.cantidad})` : "";
  const whatsapp = enlaceWhatsApp(
    textoTicketCambio({
      operacion: ticket.operacion,
      comprobante: ticket.comprobante,
      devolvio: `${ticket.devolvio}${cantidad}`,
      sellevo: `${ticket.sellevo}${cantidad}`,
      diferencia: ticket.diferencia,
      sede: ticket.sede,
    }),
  );
  const boton = "flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200";

  return (
    <Modal
      variante="hoja"
      ancho="max-w-lg"
      titulo="Cambio registrado"
      subtitulo={
        ticket.vaACuarentena
          ? "La prenda que trajo quedó en cuarentena, esperando que un líder decida qué hacer con ella."
          : "El stock ya refleja la prenda que volvió y la que salió."
      }
      onClose={onCerrar}
    >
      {(cerrar) => (
        <>
          <div className="rounded-xl border border-sand bg-crema/60 px-4 py-3">
            <Linea titulo="Cambio">
              <span className="font-mono font-semibold">{ticket.operacion}</span>
            </Linea>
            {ticket.comprobante && <Linea titulo="De la compra">{ticket.comprobante}</Linea>}
            <div className="my-1.5 border-t border-dashed border-sand" />
            <Linea titulo="Devolvió">{`${ticket.devolvio}${cantidad}`}</Linea>
            <Linea titulo="Se llevó">{`${ticket.sellevo}${cantidad}`}</Linea>
            <Linea titulo="Diferencia">
              <span className="font-semibold tabular-nums">{textoDiferencia(ticket.diferencia)}</span>
            </Linea>
            <div className="my-1.5 border-t border-dashed border-sand" />
            <p className="text-xs text-tinta/60">
              {ticket.atendio ? `Atendió ${ticket.atendio} · ` : ""}
              {ticket.sede} · {fecha} {hora}
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a href={whatsapp} target="_blank" rel="noreferrer" className={`${boton} bg-tinta text-crema hover:bg-tinta/85`}>
              <MessageCircle aria-hidden className="h-4 w-4" />
              {ticket.clienta ? `WhatsApp a ${ticket.clienta.split(" · ")[0]!.split(" ")[0]}` : "Enviar por WhatsApp"}
            </a>
            <button type="button" onClick={() => window.print()} className={`${boton} border border-sand bg-papel text-tinta hover:border-taupe`}>
              <Printer aria-hidden className="h-4 w-4" />
              Imprimir ticket
            </button>
            <Link href="/vender" className={`${boton} border border-sand bg-papel text-tinta hover:border-taupe`}>
              <ShoppingBag aria-hidden className="h-4 w-4" />
              Se lleva algo más: seguir vendiendo
            </Link>
            <button
              type="button"
              onClick={() => {
                cerrar();
                onNuevo();
              }}
              className={`${boton} text-taupe hover:text-tinta`}
            >
              <Plus aria-hidden className="h-4 w-4" />
              Nuevo cambio
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-tinta/55">Es el resumen del cambio para la clienta; no es un comprobante de pago.</p>

          {typeof document !== "undefined" && createPortal(<TicketCambioTermico ticket={ticket} />, document.body)}
        </>
      )}
    </Modal>
  );
}

/** El mismo ticket en la térmica de 80 mm. En pantalla no se ve (`#comprobante-print`, globals.css): solo existe para
 *  `window.print()` mientras la hoja está abierta. Negro sobre blanco, como el comprobante de venta (ADR-0114). */
function TicketCambioTermico({ ticket }: { ticket: TicketCambio }) {
  const { fecha, hora } = fechaHoraLima(ticket.registradoEn);
  const cantidad = ticket.cantidad > 1 ? ` (×${ticket.cantidad})` : "";
  return (
    <div id="comprobante-print">
      <header className="rt-centro">
        <Image src="/cayla-isotipo.png" alt="" width={221} height={150} priority unoptimized className="rt-logo" />
        <p className="rt-marca">{EMISOR.nombreComercial}</p>
        <p className="rt-tienda">{ticket.sede}</p>
      </header>
      <div className="rt-doble" />
      <p className="rt-centro rt-titulo">CAMBIO DE PRENDA</p>
      <p className="rt-centro rt-numero">N.º {ticket.operacion}</p>
      <div className="rt-doble" />
      <dl className="rt-datos">
        <dt>Fecha</dt>
        <dd>
          {fecha} · {hora}
        </dd>
        {ticket.comprobante && (
          <>
            <dt>Compra</dt>
            <dd>{ticket.comprobante}</dd>
          </>
        )}
        {ticket.clienta && (
          <>
            <dt>Clienta</dt>
            <dd>{ticket.clienta}</dd>
          </>
        )}
        {ticket.atendio && (
          <>
            <dt>Atendió</dt>
            <dd>{ticket.atendio}</dd>
          </>
        )}
      </dl>
      <div className="rt-linea" />
      <div className="rt-fila">
        <span>Devolvió</span>
        <span>{`${ticket.devolvio}${cantidad}`}</span>
      </div>
      <div className="rt-fila">
        <span>Se llevó</span>
        <span>{`${ticket.sellevo}${cantidad}`}</span>
      </div>
      <div className="rt-fila rt-total">
        <span>DIFERENCIA</span>
        <span>{textoDiferencia(ticket.diferencia)}</span>
      </div>
      <div className="rt-linea" />
      <p className="rt-centro rt-pie">Resumen del cambio · no es comprobante de pago</p>
    </div>
  );
}
