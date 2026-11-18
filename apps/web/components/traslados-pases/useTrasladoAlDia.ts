"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { anotarCarga, cargaVistaEn } from "@/lib/copia-de-pagina";
import { lineasAlDia, recibidosDespuesDe } from "@/lib/recepcion-traslado-memoria";
import type { TrasladoDetalle } from "@/lib/traslados";

/**
 * El traslado que la pantalla tiene que dibujar (2026-11-11). Si lo que llegó es la copia de la página que guardó el router («atrás», o un
 * enlace antes de 30 s), pone encima lo que esta pestaña guardó después (`lib/recepcion-traslado-memoria.ts`) y pide la página de nuevo, sin
 * loader: así llega también lo que contó otra persona y el estado del traslado. Mientras llega, y si no llega, vale lo recordado.
 */
export function useTrasladoAlDia(t: TrasladoDetalle, carga: string): TrasladoDetalle {
  const router = useRouter();
  const ambito = `traslado:${t.id}`;
  // Se calcula con la página que llega: una página nueva (que esta pestaña no anotó todavía) se dibuja tal cual.
  const alDia = useMemo(() => {
    const lineas = lineasAlDia(t.lineas, recibidosDespuesDe(t.id, cargaVistaEn(ambito, carga)));
    return lineas === t.lineas ? t : { ...t, lineas };
  }, [t, ambito, carga]);

  // Una carga que llega con la pantalla ya abierta (un refresco) solo se anota; la primera de la pantalla, si ya se había dibujado, se pide
  // de nuevo. El ref ataja la segunda pasada del modo estricto.
  const revisada = useRef(false);
  useEffect(() => {
    const copia = anotarCarga(ambito, carga);
    if (revisada.current) return;
    revisada.current = true;
    if (!copia) return;
    navegacionSinEspera(window.location.href);
    router.refresh();
  }, [ambito, carga, router]);

  return alDia;
}
