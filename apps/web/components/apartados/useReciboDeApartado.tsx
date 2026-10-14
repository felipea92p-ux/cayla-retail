"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ReciboTermico } from "@/components/ReciboTermico";
import { createClient } from "@/lib/supabase/client";
import { reciboDeApartado, type ComprobanteDeApartado } from "@/lib/recibo-apartado-reglas";
import type { Apartado } from "@/lib/separaciones-reglas";
import type { ReciboVenta } from "@/lib/recibo-reglas";

/**
 * La boleta o factura de un apartado ya ENTREGADO, lista para la térmica (ADR-0399): se lee su comprobante final y se arma con el mismo
 * ticket de cualquier venta. `null` mientras carga o si no se encuentra (la pantalla cae entonces al ticket viejo del apartado).
 * No escribe nada.
 */
export function useReciboDeApartado(apartado: Apartado, sede: string, redondeo = 0, activo = true): ReciboVenta | null {
  const [comprobante, setComprobante] = useState<{ para: string; fila: ComprobanteDeApartado } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    createClient()
      .from("comprobantes")
      .select("tipo, serie, numero, created_at, cliente_tipo_doc, cliente_num_doc, cliente_nombre")
      // `separacion_id` y `es_anticipo` (ADR-0166) todavía no están en los tipos generados de `comprobantes`.
      .eq("separacion_id" as never, apartado.id as never)
      .eq("es_anticipo" as never, false as never)
      .in("tipo", ["boleta", "factura"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (vigente && data) setComprobante({ para: apartado.id, fila: data as unknown as ComprobanteDeApartado });
      });
    return () => {
      vigente = false;
    };
  }, [apartado.id, activo]);
  return comprobante && comprobante.para === apartado.id ? reciboDeApartado(apartado, comprobante.fila, sede, redondeo) : null;
}

/** El ticket de la entrega pegado a `<body>`, como lo hace «Venta registrada»: en pantalla no se ve y al imprimir es lo único que sale. */
export function TicketDeEntrega({ recibo, codigo }: { recibo: ReciboVenta; codigo: string }) {
  return typeof document === "undefined" ? null : createPortal(<ReciboTermico recibo={recibo} apartado={{ codigo }} />, document.body);
}
