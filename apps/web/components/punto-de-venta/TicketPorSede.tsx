"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { avisar } from "@/components/ui/Avisos";
import type { ItemCarrito, TicketEnEspera } from "@/components/PuntoDeVenta";
import type { ClientaDelTicket as Clienta } from "@/lib/clienta-ticket-reglas";
import { claveLocal, guardar, leer } from "@/lib/almacen-local";
import { esperaTrasCambiarDeSede, type TicketVivo } from "@/lib/vender-cambio-de-sede";

// El guardián del cambio de sede en Vender (Felipe, 2026-10-11; la regla y el porqué, en `lib/vender-cambio-de-sede.ts`).
//
// La página monta el Punto de venta con la sede en su key: al cambiar de sede se monta de nuevo y la caja arranca vacía.
// Lo que tenía armado la sede anterior se perdería con ese montaje, así que lo guarda este envoltorio, que NO lleva key y por
// eso sobrevive al `router.refresh()` del selector: el Punto de venta le reporta su ticket cada vez que cambia y, cuando la
// sede cambia, el ticket de la anterior pasa a la espera de ESA sede (la misma llave del navegador que usa «Dejar en espera»).
//
// Solo actúa cuando la sede cambia con Vender a la vista (el selector de la cabecera, o una recarga que trae la sede que otra
// pestaña eligió). Salir de Vender lo desmonta con todo, como siempre: ahí el ticket se pierde igual que antes.

type Reporte = { etiqueta: string; ticket: TicketVivo<ItemCarrito, Clienta> };
type Reportar = (ubicacionId: string, reporte: Reporte | null) => void;

const ReportarTicket = createContext<Reportar | null>(null);

/** Para el Punto de venta: `null` fuera de `TicketPorSede` (no reporta a nadie). */
export function useReportarTicket(): Reportar | null {
  return useContext(ReportarTicket);
}

export function TicketPorSede({ ubicacionId, children }: { ubicacionId: string; children: ReactNode }) {
  // Por sede y no uno solo: al cambiar de sede, el Punto de venta nuevo reporta su ticket vacío ANTES de que corra el efecto
  // de abajo (los efectos de los hijos van primero), y con un solo lugar pisaría el de la sede que se deja.
  const tickets = useRef(new Map<string, Reporte>());
  const sedeAnterior = useRef(ubicacionId);

  const reportar = useCallback<Reportar>((sede, reporte) => {
    if (reporte && reporte.ticket.carrito.length > 0) tickets.current.set(sede, reporte);
    else tickets.current.delete(sede);
  }, []);

  useEffect(() => {
    const anterior = sedeAnterior.current;
    sedeAnterior.current = ubicacionId;
    if (anterior === ubicacionId) return;
    const reporte = tickets.current.get(anterior);
    tickets.current.delete(anterior);
    if (!reporte) return;

    const clave = claveLocal(anterior, "en-espera");
    const espera = esperaTrasCambiarDeSede(leer<TicketEnEspera[]>(clave, []), reporte.ticket, {
      id: crypto.randomUUID(),
      ahora: new Date().toISOString(),
    });
    if (!espera) return;
    if (guardar(clave, espera)) {
      avisar.aviso(`El ticket de ${reporte.etiqueta} quedó en espera en esa tienda`, {
        detalle: `Cuando vuelvas a ${reporte.etiqueta}, retómalo desde «En espera».`,
      });
    } else {
      avisar.error(`No se pudo guardar el ticket de ${reporte.etiqueta} en este navegador`, {
        detalle: "Vuelve a esa sede y ármalo de nuevo antes de cobrar.",
      });
    }
  }, [ubicacionId]);

  return <ReportarTicket.Provider value={reportar}>{children}</ReportarTicket.Provider>;
}
