"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { crearJuntador, ESPERA_JUNTAR_MS, filtroDeUbicacion, sePuedeEscuchar } from "@/lib/cambios-en-vivo-reglas";

/**
 * Escucha por WebSocket (Supabase Realtime, ADR-0603) los cambios de una tabla y avisa a la pantalla, que sigue leyendo
 * por su camino de siempre. El socket NO trae datos que se pinten: solo dice «algo cambió». Así la autorización sigue
 * en un solo lugar (la RLS de la tabla y la lectura de siempre) y un cambio perdido se recupera en el sondeo.
 *
 * Devuelve `true` mientras el canal está suscrito. Quien tiene un sondeo de respaldo lo espacia con eso
 * (`vueltasPorLectura`); con `false` —sin red, sin permiso, la tabla fuera de la publicación— todo sigue como antes.
 *
 * - Una ráfaga de cambios se junta en un aviso (`esperaMs`).
 * - Al (re)conectar avisa una vez: lo que pasó mientras el socket estaba caído se recupera.
 * - Tablas con Realtime: `stock` y `ventas` (migración `20261102212000`). Otra tabla no emite hasta que se publique.
 */
export function useCambiosEnVivo({
  tabla,
  ubicacionId = null,
  activo = true,
  esperaMs = ESPERA_JUNTAR_MS,
  alCambiar,
}: {
  tabla: "stock" | "ventas";
  /** Solo los cambios de esta sede; sin ella, todos los que la cuenta puede ver. */
  ubicacionId?: string | null;
  activo?: boolean;
  esperaMs?: number;
  alCambiar: () => void;
}): boolean {
  const [conectado, setConectado] = useState(false);
  const alCambiarRef = useRef(alCambiar);
  useEffect(() => {
    alCambiarRef.current = alCambiar;
  });

  useEffect(() => {
    if (!activo || !sePuedeEscuchar(ubicacionId)) return;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    const filtro = filtroDeUbicacion(ubicacionId);
    const juntador = crearJuntador(esperaMs, () => alCambiarRef.current());
    let estabaConectado = false;
    const canal = supabase
      .channel(`en-vivo:${tabla}:${ubicacionId ?? "todas"}`)
      .on("postgres_changes", { event: "*", schema: "retail", table: tabla, ...(filtro ? { filter: filtro } : {}) }, () => juntador.avisar())
      .subscribe((estado) => {
        const ahora = estado === "SUBSCRIBED";
        setConectado(ahora);
        if (ahora && !estabaConectado) juntador.avisar();
        estabaConectado = ahora;
      });
    return () => {
      juntador.cancelar();
      setConectado(false);
      void supabase.removeChannel(canal);
    };
  }, [tabla, ubicacionId, activo, esperaMs]);

  return conectado;
}
