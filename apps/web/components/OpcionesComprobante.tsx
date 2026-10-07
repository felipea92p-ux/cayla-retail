"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftRight, FileText, Link2, MessageCircle, Printer, ShoppingBag, Undo2 } from "lucide-react";
import type { Comprobante } from "@/lib/comprobantes-reglas";
import { ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import type { ExtraComprobante } from "@/lib/comprobantes";
import { soles } from "@/lib/compras-reglas";
import { chipDelComprobante } from "@/lib/facturacion-actividad";
import { enlaceWhatsAppA, numeroWhatsApp } from "@/lib/facturacion-comprobantes-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { DetalleVentaModal } from "@/components/DetalleVentaModal";

// Las opciones de un comprobante (2026-09-26, spike `docs/maquetas/comprobantes-conectado-2026-09/`): lo que
// conecta la boleta con el resto del ERP. Ver la venta (el mismo detalle de Historial y Caja), reenviarla por
// WhatsApp AL NÚMERO de la clienta, imprimirla de nuevo, y empezar un cambio o una devolución con la boleta ya
// buscada en Posventa. En celular es la hoja que sube desde abajo (`<Modal variante="hoja">`, botones de 52 px);
// XML y CDR van al final porque son del contador, no de la tienda (lo mismo hacen Alegra y Bsale).
// Anular, liberar y reintentar siguen en la fila (son del estado ante SUNAT, y Anular es del líder).

const BASE_OPCION =
  "flex min-h-[52px] items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left text-[14px] outline-none transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60";
const OPCION = `${BASE_OPCION} border-sand bg-papel text-tinta hover:bg-hueso`;
// La principal (reenviar a la clienta) en tinta: una sola por hoja.
const PRIMARIA = `${BASE_OPCION} border-tinta bg-tinta text-crema hover:bg-tinta/90`; // unificar-fijo: la opción ya elegida de un selector, no un botón principal
const BAJADA = "block text-[12px] leading-snug text-tinta/65";

export function OpcionesComprobante({
  comprobante: c,
  extra,
  sede,
  esLider,
  onClose,
}: {
  comprobante: Comprobante;
  extra: ExtraComprobante | undefined;
  sede: string;
  esLider: boolean;
  onClose: () => void;
}) {
  const [viendoVenta, setViendoVenta] = useState(false);
  const numero = `${c.serie}-${String(c.numero).padStart(6, "0")}`;
  const tipo = ETIQUETA_TIPO[c.tipo];
  const chip = chipDelComprobante(c);
  const { dia, hora } = diaYHoraLima(c.created_at);
  const aceptado = c.estado === "aceptado";
  const esNota = c.tipo === "nota_credito";
  const primerNombre = c.cliente_nombre?.split(" ")[0] ?? null;
  const tieneNumero = numeroWhatsApp(extra?.telefono) !== null;
  const mensaje = `Hola${primerNombre ? ` ${primerNombre}` : ""}, aquí está tu ${tipo.toLowerCase()} ${numero} de CAYLA: ${c.pdfUrl ?? ""}`;
  // Posventa busca la venta por el número de la boleta; el líder mira todas las sedes (RLS de ventas).
  const posventa = (ruta: string) => `${ruta}?q=${encodeURIComponent(numero)}${esLider ? "&todas=1" : ""}`;
  const puedePosventa = aceptado && !esNota && !!c.venta_id && !extra?.notaDeCredito;

  if (viendoVenta && c.venta_id) {
    return <DetalleVentaModal ventaId={c.venta_id} vendedor={null} ubicacionNombre={sede} onClose={() => setViendoVenta(false)} />;
  }

  return (
    <Modal ancho="max-w-md" titulo={`${tipo} ${numero}`} subtitulo={`${c.cliente_nombre ?? "Cliente varios"} · ${dia} ${hora} · ${sede}`} onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <Chip tono={chip.tono} className={chip.punteado ? "border-dashed border-tinta/30" : ""}>
          {chip.texto}
        </Chip>
        <span className="font-display text-2xl tabular-nums text-tinta">{soles(Number(c.total))}</span>
      </div>

      {!aceptado && c.estado !== "anulado" && c.estado !== "no_emitido" && (
        <p className="nota-cayla mt-3 text-[13px]">
          Todavía no llegó a SUNAT: el PDF y el reenvío aparecen cuando SUNAT lo acepte. Se reintenta solo; si pasa de 1 hora, avisa a tu líder.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {c.pdfUrl && (
          <a href={enlaceWhatsAppA(extra?.telefono, mensaje)} target="_blank" rel="noreferrer" className={PRIMARIA}>
            <MessageCircle aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
            <span>
              {tieneNumero && primerNombre ? `WhatsApp a ${primerNombre}` : "Enviar por WhatsApp"}
              <span className="block text-[12px] leading-snug text-crema/70">{tieneNumero ? "Directo a su chat, con el PDF" : "Sin número guardado: eliges el chat"}</span>
            </span>
          </a>
        )}
        {c.pdfUrl && (
          <a href={c.pdfUrl} target="_blank" rel="noreferrer" className={OPCION}>
            <FileText aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-taupe" />
            <span>
              Ver PDF<span className={BAJADA}>El comprobante tal como lo tiene SUNAT</span>
            </span>
          </a>
        )}
        {c.venta_id && (
          <button type="button" onClick={() => setViendoVenta(true)} className={OPCION}>
            <ShoppingBag aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-taupe" />
            <span>
              Ver la venta<span className={BAJADA}>Prendas, pago y quién vendió</span>
            </span>
          </button>
        )}
        {c.pdfUrl && (
          <a href={c.pdfUrl} target="_blank" rel="noreferrer" className={OPCION}>
            <Printer aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-taupe" />
            <span>
              Imprimir de nuevo<span className={BAJADA}>Abre el PDF para imprimir</span>
            </span>
          </a>
        )}
        {puedePosventa && (
          <>
            <Link href={posventa("/cambios")} className={OPCION}>
              <ArrowLeftRight aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-taupe" />
              <span>
                Cambio<span className={BAJADA}>Talla o color, en Posventa</span>
              </span>
            </Link>
            <Link href={posventa("/devoluciones")} className={OPCION}>
              <Undo2 aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-taupe" />
              <span>
                Devolución<span className={BAJADA}>Emite su nota de crédito</span>
              </span>
            </Link>
          </>
        )}
        {extra?.notaDeCredito && (
          <Link href={posventa("/devoluciones")} className={`${OPCION} sm:col-span-2`}>
            <Link2 aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-pizarra" />
            <span>
              Ya tiene la nota de crédito {extra.notaDeCredito.numero}
              <span className={BAJADA}>Se devolvió: no se puede devolver dos veces. Toca para ver la devolución.</span>
            </span>
          </Link>
        )}
        {esNota && extra?.corrige && (
          <div className={`${OPCION} sm:col-span-2`}>
            <Link2 aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-pizarra" />
            <span>
              Corrige a {extra.corrige.numero}
              <span className={BAJADA}>{extra.devolucionId ? "Salió de una devolución aprobada." : "Nota de crédito sobre ese comprobante."}</span>
            </span>
          </div>
        )}
      </div>

      {(c.xmlUrl || c.cdrUrl) && (
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-tinta/10 pt-3 text-[12.5px] text-tinta/65">
          <span>Para el contador:</span>
          {c.xmlUrl && (
            <a href={c.xmlUrl} target="_blank" rel="noreferrer" className="hover:text-tinta hover:underline">
              XML
            </a>
          )}
          {c.cdrUrl && (
            <a href={c.cdrUrl} target="_blank" rel="noreferrer" className="hover:text-tinta hover:underline">
              CDR
            </a>
          )}
        </p>
      )}
    </Modal>
  );
}
