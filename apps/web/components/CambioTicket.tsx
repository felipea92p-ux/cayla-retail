"use client";

import { LogoCayla } from "@/components/ui/LogoCayla";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Plus, ShoppingBag } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EMISOR } from "@/lib/emisor";
import { enlaceWhatsApp } from "@/lib/facturacion-comprobantes-reglas";
import { fechaHoraLima } from "@/lib/recibo-reglas";
import { textoTicketCambio } from "@/lib/cambios-atajos-reglas";
import { useTituloDeImpresion } from "@/lib/useTituloDeImpresion";
import { soles } from "@/lib/compras-reglas";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { ReciboTermico } from "@/components/ReciboTermico";
import type { MetodoDiferencia } from "@/lib/cambios-reglas";
import {
  comprobanteNuevo,
  documentosParaMensaje,
  filasDelTicket,
  numeroDeDocumento,
  type DocumentosDelCambio,
  type FilaTicketDocumento,
} from "@/lib/cambios-documentos-reglas";
import { DocumentosDelTicket, reciboDelCambio, useComprobantesDelCambio, type PrendasDelCambio } from "@/components/cambios-documentos/DocumentosDelTicket";
import { imprimirBoleta } from "@/components/impresion/imprimirBoleta";
import { imprimirAlCobrar } from "@/lib/imprimir-al-cobrar";

/* ====================================================================
   CambioTicket · lo que la clienta se lleva al terminar un cambio (spike 2026-09-26, opción A)

   Antes el cambio terminaba en una pantalla con 4 datos y un número de 8 letras: la clienta no se llevaba nada que
   dijera qué cambió. Ahora sale una hoja (ADR-0136) con el ticket del cambio y tres salidas:
     · WhatsApp: el resumen en texto (`textoTicketCambio`). La venta no guarda el teléfono de la clienta, así que
       WhatsApp pregunta a quién mandarlo.
     · Imprimir: el mismo resumen en la térmica de 80 mm (`#comprobante-print`, las reglas de impresión de
       `globals.css` que ya usa el comprobante de venta).
     · Seguir vendiendo: si se lleva algo más, al Punto de venta. Es cuando más compra: ya está en la tienda.
   El ticket NO es comprobante de SUNAT. Desde ADR-0671 un cambio con diferencia emite los suyos (la nota de crédito sobre la compra y
   el comprobante nuevo por lo que se lleva): la hoja los lee por `cambio_id` y los nombra con su estado, y el nuevo se imprime en la
   térmica (`ReciboTermico` en modo cambio) o se manda por WhatsApp. «No es comprobante de pago» se dice solo si no salió ninguno.
   Un solo `#comprobante-print` a la vez (globals.css): el ticket o el comprobante nuevo, el que se pidió imprimir.
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
  /** El id completo del cambio (`operacion` son sus 8 primeros caracteres): con él se leen sus comprobantes. */
  cambioId?: string;
  /** Un cambio con diferencia cuando la base ya emite sus comprobantes (ADR-0671): lo que se esperaba que saliera, el medio de la
   *  diferencia y cómo se llama cada prenda que se lleva (el ítem del comprobante solo trae su `variante_id`). Sin esto, el ticket de siempre. */
  documentos?: { esperado: DocumentosDelCambio; metodo: MetodoDiferencia; prendas: PrendasDelCambio };
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
  // Los comprobantes REALES del cambio (ADR-0671), leídos por su id; `null` mientras se leen.
  const emitidos = useComprobantesDelCambio(ticket.documentos && ticket.cambioId ? ticket.cambioId : null);
  const filas: FilaTicketDocumento[] = ticket.documentos && emitidos ? filasDelTicket(emitidos, ticket.documentos.esperado) : [];
  const nuevo = emitidos ? comprobanteNuevo(emitidos) : null;
  const recibo =
    ticket.documentos && emitidos
      ? reciboDelCambio(emitidos, {
          ...ticket.documentos,
          diferencia: ticket.diferencia,
          sede: ticket.sede,
          atendio: ticket.atendio,
          compra: ticket.comprobante,
        })
      : null;
  // «No es comprobante de pago» solo si el cambio no emitió ninguno (mientras se leen, no se dice nada).
  const sinComprobantes = !ticket.documentos || (emitidos !== null && emitidos.length === 0);
  // Qué va a la térmica: un solo `#comprobante-print` a la vez. Se elige y, ya dibujado, se abre el cuadro de impresión.
  const [impresion, setImpresion] = useState<"ticket" | "comprobante">("ticket");
  const [pedidos, setPedidos] = useState(0);
  const imprimeComprobante = impresion === "comprobante" && recibo !== null;
  // El PDF sale como «Cambio B004-000004.pdf» (el ticket nombra la venta que se cambió) o con el número del comprobante nuevo, no «Retail - CAYLA.pdf».
  // ANTES que el efecto que imprime: React corre los efectos en el orden en que se declaran, y al pasar del ticket al comprobante (o al
  // revés) el título nuevo tiene que estar puesto cuando se abre el cuadro de impresión; si no, el primer PDF sale «Retail - CAYLA.pdf».
  useTituloDeImpresion(imprimeComprobante && nuevo ? numeroDeDocumento(nuevo) : ticket.comprobante ? `Cambio ${ticket.comprobante}` : null);
  // Ya dibujado el papel elegido, se imprime como todo ticket térmico del ERP (ADR-0670): por el ayudante de la Mac si lo tiene, si no
  // con el cuadro de impresión.
  useEffect(() => {
    if (pedidos > 0) void imprimirBoleta();
  }, [pedidos]);
  function imprimir(que: "ticket" | "comprobante") {
    setImpresion(que);
    setPedidos((n) => n + 1);
  }
  // «Imprimir solo al cobrar» (lib/imprimir-al-cobrar.ts, la preferencia de este equipo): la boleta nueva del cambio sale sola, una vez,
  // apenas se leyó (lo trajo #1910). «Mandar a la caja» no aplica: la cola de la caja imprime por venta, y este papel no tiene venta.
  const imprimeSolo = useSyncExternalStore(imprimirAlCobrar.suscribir, imprimirAlCobrar.leer, imprimirAlCobrar.leerEnServidor) === "si";
  const yaImprimioSolo = useRef(false);
  const hayRecibo = recibo !== null;
  useEffect(() => {
    if (!hayRecibo || !imprimeSolo || yaImprimioSolo.current) return;
    yaImprimioSolo.current = true;
    setImpresion("comprobante");
    setPedidos((n) => n + 1);
  }, [hayRecibo, imprimeSolo]);
  const whatsapp = enlaceWhatsApp(
    textoTicketCambio({
      operacion: ticket.operacion,
      comprobante: ticket.comprobante,
      devolvio: `${ticket.devolvio}${cantidad}`,
      sellevo: `${ticket.sellevo}${cantidad}`,
      diferencia: ticket.diferencia,
      sede: ticket.sede,
      documentos: emitidos ? documentosParaMensaje(emitidos) : [],
    }),
  );
  const boton = "flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200";

  return (
    <Modal
      variante="hoja"
      tamano="mediana"
      titulo="Cambio registrado"
      subtitulo={
        ticket.vaACuarentena
          ? "La prenda que trajo quedó en cuarentena, esperando que se decida qué hacer con ella."
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
            <p className="text-sm text-tinta/60">
              {ticket.atendio ? `Atendió ${ticket.atendio} · ` : ""}
              {ticket.sede} · {fecha} {hora}
            </p>
          </div>

          {/* Los comprobantes del cambio, antes que las salidas: el nuevo es lo que el cliente se lleva impreso. */}
          {filas.length > 0 && <DocumentosDelTicket filas={filas} nuevo={nuevo} onImprimir={recibo ? () => imprimir("comprobante") : null} />}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a href={whatsapp} target="_blank" rel="noreferrer" className={`${boton} bg-tinta text-crema hover:bg-rojo-profundo`}>
              <MessageCircle aria-hidden className="h-4 w-4" />
              {ticket.clienta ? `WhatsApp a ${ticket.clienta.split(" · ")[0]!.split(" ")[0]}` : "Enviar por WhatsApp"}
            </a>
            <BotonImprimir onClick={() => imprimir("ticket")} className="h-12 rounded-xl">
              Imprimir ticket
            </BotonImprimir>
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
          {sinComprobantes && <p className="mt-3 text-center text-sm text-tinta/55">Es el resumen del cambio para el cliente; no es un comprobante de pago.</p>}

          {typeof document !== "undefined" &&
            createPortal(imprimeComprobante ? <ReciboTermico recibo={recibo} /> : <TicketCambioTermico ticket={ticket} filas={filas} />, document.body)}
        </>
      )}
    </Modal>
  );
}

/** El mismo ticket en la térmica de 80 mm. En pantalla no se ve (`#comprobante-print`, globals.css): solo existe para
 *  `window.print()` mientras la hoja está abierta. Negro sobre blanco, como el comprobante de venta (ADR-0114). */
function TicketCambioTermico({ ticket, filas }: { ticket: TicketCambio; filas: readonly FilaTicketDocumento[] }) {
  const { fecha, hora } = fechaHoraLima(ticket.registradoEn);
  const cantidad = ticket.cantidad > 1 ? ` (×${ticket.cantidad})` : "";
  return (
    <div id="comprobante-print">
      <header className="rt-centro">
        <LogoCayla tinta="negro" className="rt-logo" />
        <p className="sr-only">{EMISOR.nombreComercial}</p>
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
            <dt>Cliente</dt>
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
      {/* Los comprobantes que emitió el cambio (ADR-0671), con su número; la nota que espera a SUNAT dice «por emitir». */}
      {filas.length > 0 && (
        <>
          <div className="rt-linea" />
          {filas.map((f) => (
            <div key={f.clave} className="rt-fila">
              <span>{f.numero ? `${f.titulo} ${f.numero}` : `${f.titulo} (por emitir)`}</span>
              <span>{soles(f.monto)}</span>
            </div>
          ))}
        </>
      )}
      <div className="rt-linea" />
      <p className="rt-centro rt-pie">{filas.length > 0 ? "Resumen del cambio" : "Resumen del cambio · no es comprobante de pago"}</p>
    </div>
  );
}
