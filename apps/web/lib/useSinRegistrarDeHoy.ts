"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { inicioDeHoyLimaIso, type ConteoSinRegistrar } from "./vender-sin-registrar-reglas";

/**
 * Cuántas prendas sin registrar vendió ESTA tienda hoy y cuántas siguen por regularizar (A5, auditoría 2026-10-14). Se lee al
 * entrar y cada vez que sube `version` (tras cada venta, como `useVentasDeHoy`). Son dos conteos por PostgREST (`head`, sin
 * filas): lecturas, así que el loader global no se muestra (ADR-0149). RLS deja ver solo la sede en que se está parado
 * (`prendas_por_regularizar_select`), igual que la mesa. Si no se puede leer, `null`: el pie no dice nada, nunca un 0 falso.
 */
export function useSinRegistrarDeHoy(ubicacionId: string, version: number): ConteoSinRegistrar | null {
  const [conteo, setConteo] = useState<ConteoSinRegistrar | null>(null);
  useEffect(() => {
    let sigue = true;
    const supabase = createClient();
    const base = () => supabase.from("prendas_por_regularizar").select("id", { count: "exact", head: true }).eq("ubicacion_id", ubicacionId);
    Promise.all([base().eq("estado", "pendiente"), base().neq("estado", "anulada").gte("vendido_en", inicioDeHoyLimaIso())]).then(([pendientes, hoy]) => {
      if (!sigue) return;
      if (pendientes.error || hoy.error || pendientes.count === null || hoy.count === null) setConteo(null);
      else setConteo({ hoy: hoy.count, pendientes: pendientes.count });
    });
    return () => {
      sigue = false;
    };
  }, [ubicacionId, version]);
  return conteo;
}
