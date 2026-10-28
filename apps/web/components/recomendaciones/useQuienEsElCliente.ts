"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerQuienEs, type QuienEs } from "@/lib/recomendaciones-cliente";

// Una lectura por cliente y por visita: volver a la misma recomendación con ↑ ↓ no la repite.
const lecturas = new Map<string, Promise<QuienEs | null>>();

async function leer(fichaId: string): Promise<QuienEs | null> {
  const base = createClient();
  // Las dos piden el módulo Clientes en la base (la política de `clientas` y `fn_clienta_su_sede`, regla B-03).
  const [club, sede] = await Promise.all([
    base.from("clientas").select("club_desde").eq("id", fichaId).maybeSingle(),
    base.rpc("fn_clienta_su_sede", { p_clienta_id: fichaId }),
  ]);
  if (club.error || !club.data) return null;
  return leerQuienEs(club.data, sede.error ? null : sede.data);
}

/**
 * Quién es el cliente (actividad 5, decisión #5 A): su club, sus compras y su tienda, SOLO si quien mira ve las fichas (`veFichas`).
 * Devuelve `undefined` mientras lee, `null` si no hay nada que mostrar (no ve Clientes, la ficha se anonimizó o la base no respondió) y
 * la línea si la leyó. Si no responde, se degrada así: la banda muestra solo «Ver su ficha», como antes; no se pierde nada.
 */
export function useQuienEsElCliente(fichaId: string | null, veFichas: boolean): QuienEs | null | undefined {
  const [leidos, setLeidos] = useState<Record<string, QuienEs | null>>({});
  const pedir = Boolean(fichaId && veFichas);
  useEffect(() => {
    if (!fichaId || !veFichas) return;
    let vivo = true;
    let lectura = lecturas.get(fichaId);
    if (!lectura) {
      lectura = leer(fichaId).catch(() => null);
      lecturas.set(fichaId, lectura);
    }
    lectura.then((q) => {
      if (q === null) lecturas.delete(fichaId); // la próxima vez se vuelve a intentar
      if (vivo) setLeidos((l) => ({ ...l, [fichaId]: q }));
    });
    return () => {
      vivo = false;
    };
  }, [fichaId, veFichas]);
  if (!pedir || !fichaId) return null;
  return fichaId in leidos ? leidos[fichaId] : undefined;
}
