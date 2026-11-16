"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { CampoCelular } from "@/components/clientas/club-piezas";
import { EnviarBoleta } from "@/components/punto-de-venta/EnviarBoleta";
import { soles } from "@/lib/compras-reglas";
import type { TipoComprobante } from "@/lib/comprobantes-reglas";
import { esTipoDocComprobante } from "@/lib/documento-comprobante-reglas";
import { armarReciboDeCambio, type ReciboVenta } from "@/lib/recibo-reglas";
import type { MetodoDiferencia } from "@/lib/cambios-reglas";
import {
  comprobanteNuevo,
  textoCreditoDelRecibo,
  type DocumentoEmitido,
  type DocumentosDelCambio,
  type FilaTicketDocumento,
} from "@/lib/cambios-documentos-reglas";

/* ====================================================================
   Los documentos REALES de un cambio en su ticket (ADR-0671): se leen por `cambio_id` después de guardar, nunca se repiten las cifras
   que calculó la pantalla. Mientras SUNAT responde, se vuelve a leer unos segundos para que el estado se ponga al día solo.
   ==================================================================== */

/** Un comprobante del cambio, con lo que hace falta para su papel. */
export type ComprobanteDelCambio = DocumentoEmitido & {
  subtotal: number;
  igv: number;
  creadoEn: string;
  clienteTipoDoc: string | null;
  clienteNumDoc: string | null;
  clienteNombre: string | null;
  items: unknown;
};

/** Lo que hace falta para nombrar cada prenda en el papel: el ítem del comprobante solo trae su `variante_id`. */
export type PrendasDelCambio = Readonly<Record<string, { referencia: string; codigo: string | null; detalle: string }>>;

/** Cada cuánto se vuelve a leer mientras algún documento sigue en camino a SUNAT, y hasta cuándo. */
const RELEER_CADA_MS = 3_000;
const RELEER_HASTA_MS = 30_000;
const EN_CAMINO = new Set(["pendiente", "pendiente_reintento", "enviado"]);

/** Los comprobantes del cambio, o `null` mientras no se leyeron (o si no hay cambio que leer). Si la base no responde, sigue en `null`. */
export function useComprobantesDelCambio(cambioId: string | null): ComprobanteDelCambio[] | null {
  const [leido, setLeido] = useState<{ para: string; filas: ComprobanteDelCambio[] } | null>(null);
  useEffect(() => {
    if (!cambioId) return;
    let vigente = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const inicio = Date.now();
    async function leer() {
      const { data, error } = await createClient()
        .from("comprobantes")
        .select("id, tipo, serie, numero, total, subtotal, igv, estado, created_at, cliente_tipo_doc, cliente_num_doc, cliente_nombre, items")
        .eq("cambio_id", cambioId as string)
        .order("created_at");
      if (!vigente) return;
      if (!error && data) {
        const filas = data.map((d) => ({
          id: d.id,
          tipo: d.tipo,
          serie: d.serie,
          numero: d.numero,
          total: Number(d.total),
          subtotal: Number(d.subtotal),
          igv: Number(d.igv),
          estado: d.estado,
          creadoEn: d.created_at,
          clienteTipoDoc: d.cliente_tipo_doc,
          clienteNumDoc: d.cliente_num_doc,
          clienteNombre: d.cliente_nombre,
          items: d.items,
        }));
        setLeido({ para: cambioId as string, filas });
        if (!filas.some((f) => EN_CAMINO.has(f.estado))) return;
      }
      if (Date.now() - inicio < RELEER_HASTA_MS) temporizador = setTimeout(leer, RELEER_CADA_MS);
    }
    void leer();
    return () => {
      vigente = false;
      if (temporizador) clearTimeout(temporizador);
    };
  }, [cambioId]);
  return leido && leido.para === cambioId ? leido.filas : null;
}

/** Las líneas del papel, desde los ítems del comprobante (`variante_id`, `cantidad`, `precio_unitario`, `descuento_unitario`). */
function lineasDelPapel(items: unknown, prendas: PrendasDelCambio) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((x) => {
    const i = (x ?? {}) as Record<string, unknown>;
    const cantidad = Number(i.cantidad);
    const precio = Number(i.precio_unitario);
    if (!(cantidad > 0) || !Number.isFinite(precio)) return [];
    const prenda = typeof i.variante_id === "string" ? prendas[i.variante_id] : undefined;
    return [
      {
        cantidad,
        referencia: prenda?.referencia ?? (typeof i.descripcion === "string" ? i.descripcion : "Prenda"),
        codigo: prenda?.codigo ?? null,
        detalle: prenda?.detalle || undefined,
        precioUnitario: precio,
        descuentoUnitario: Number(i.descuento_unitario ?? 0) || 0,
      },
    ];
  });
}

/** El papel del comprobante nuevo (boleta, factura o nota de venta), o null si el cambio no emitió uno. */
export function reciboDelCambio(
  emitidos: readonly ComprobanteDelCambio[],
  e: {
    esperado: DocumentosDelCambio;
    diferencia: number;
    metodo: MetodoDiferencia;
    prendas: PrendasDelCambio;
    sede: string;
    atendio: string | null;
    /** El documento de la compra que se cambió («Boleta B001-000002»): el pie del papel lo nombra. */
    compra: string | null;
  },
): ReciboVenta | null {
  const nuevo = comprobanteNuevo(emitidos);
  if (!nuevo || (nuevo.tipo !== "boleta" && nuevo.tipo !== "factura" && nuevo.tipo !== "nota_venta")) return null;
  return armarReciboDeCambio({
    comprobante: { tipo: nuevo.tipo, serie: nuevo.serie, numero: nuevo.numero, created_at: nuevo.creadoEn, subtotal: nuevo.subtotal, igv: nuevo.igv, total: nuevo.total },
    sede: e.sede,
    cliente: { tipoDoc: esTipoDocComprobante(nuevo.clienteTipoDoc) ? nuevo.clienteTipoDoc : "sin_documento", numDoc: nuevo.clienteNumDoc, nombre: nuevo.clienteNombre },
    lineas: lineasDelPapel(nuevo.items, e.prendas),
    credito: textoCreditoDelRecibo(emitidos, e.esperado),
    diferencia: e.diferencia,
    metodo: e.metodo,
    atendio: e.atendio,
    compra: e.compra,
  });
}

/** La lista del ticket: cada documento con su número, su monto y su estado; el nuevo con «Imprimir» y, si es boleta o factura, WhatsApp. */
export function DocumentosDelTicket({
  filas,
  nuevo,
  onImprimir,
}: {
  filas: readonly FilaTicketDocumento[];
  nuevo: ComprobanteDelCambio | null;
  onImprimir: (() => void) | null;
}) {
  const [celular, setCelular] = useState("");
  const conPdf = nuevo && (nuevo.tipo === "boleta" || nuevo.tipo === "factura") ? nuevo : null;
  return (
    <section aria-label="Comprobantes del cambio" className="mt-4 space-y-3">
      <TituloGrupo cuenta={filas.length}>Comprobantes</TituloGrupo>
      <ul className="space-y-2.5">
        {filas.map((f) => (
          <li key={f.clave} className="flex items-start justify-between gap-4 text-sm">
            <span className="min-w-0">
              <span className="block font-semibold text-tinta">{f.titulo}</span>
              {f.numero && <span className="block font-mono text-tinta/70">{f.numero}</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-semibold tabular-nums text-tinta">{soles(f.monto)}</span>
              <Chip tono={f.chip.tono}>{f.chip.texto}</Chip>
            </span>
          </li>
        ))}
      </ul>
      {onImprimir && nuevo && (
        <BotonImprimir onClick={onImprimir} className="w-full">
          Imprimir {nuevo.tipo === "factura" ? "factura" : nuevo.tipo === "nota_venta" ? "nota de venta" : "boleta"}
        </BotonImprimir>
      )}
      {conPdf && (
        <div className="space-y-2">
          <CampoCelular
            id="cambio-celular"
            etiqueta={
              <>
                Celular para enviarle la {conPdf.tipo === "factura" ? "factura" : "boleta"} <span className="normal-case tracking-normal">(opcional)</span>
              </>
            }
            valor={celular}
            onValor={setCelular}
          />
          <EnviarBoleta
            ventaId={null}
            comprobanteId={conPdf.id}
            celular={celular || null}
            comprobante={{ tipo: conPdf.tipo as TipoComprobante, serie: conPdf.serie, numero: conPdf.numero }}
          />
        </div>
      )}
    </section>
  );
}
