"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listarTicketsCompartidos } from "@/lib/tickets-compartidos";
import type { TicketCompartido } from "@/lib/tickets-compartidos-reglas";

/** Cada cuánto pregunta la caja qué mandaron del piso. Cinco segundos: la asesora camina con su cliente hasta la caja en más que
 *  eso, así que el ticket ya está en la lista cuando llegan. Es una lectura liviana (solo los que esperan, sin su contenido). */
const CADA_CUANTO_PISO_MS = 5_000;

/**
 * Los tickets que el piso mandó a la caja de esta sede (ADR-0701), al día. Pregunta cada 5 s mientras la pestaña está a la vista, y
 * enseguida al volver a ella. Si una pregunta falla (sin red, la base lenta), se queda con la última lista buena en vez de vaciarla: una
 * lista que parpadea vacía haría creer que el ticket se perdió. `quitar` saca uno al abrirlo, sin esperar a la próxima pregunta.
 */
export function useTicketsDelPiso(ubicacionId: string, activo: boolean) {
  const [tickets, setTickets] = useState<TicketCompartido[]>([]);
  // Cuándo se leyó la lista: el reloj de «hace 3 min» (se actualiza con cada pregunta, sin un reloj aparte).
  const [leidoEn, setLeidoEn] = useState(0);
  const enCurso = useRef<AbortController | null>(null);

  const refrescar = useCallback(async () => {
    if (!activo || (typeof document !== "undefined" && document.visibilityState !== "visible")) return;
    enCurso.current?.abort();
    const control = new AbortController();
    enCurso.current = control;
    const r = await listarTicketsCompartidos(createClient(), ubicacionId, control.signal);
    if (control.signal.aborted) return;
    if (r.error === null) {
      setTickets(r.dato);
      setLeidoEn(Date.now());
    }
  }, [activo, ubicacionId]);

  useEffect(() => {
    if (!activo) return;
    // La primera pregunta, apenas termina de pintarse (no dentro del efecto: el lint de React pide no encadenar renders).
    const primera = window.setTimeout(() => void refrescar(), 0);
    const intervalo = window.setInterval(() => void refrescar(), CADA_CUANTO_PISO_MS);
    const alVolver = () => void refrescar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearTimeout(primera);
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      enCurso.current?.abort();
    };
  }, [activo, refrescar]);

  const quitar = useCallback((id: string) => setTickets((ts) => ts.filter((t) => t.id !== id)), []);

  return { tickets: activo ? tickets : [], leidoEn, refrescar, quitar };
}
