"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sedeDeLaUrl, SEDE_TODAS } from "@/lib/finanzas-telar-reglas";
import type { PendienteTelar } from "@/lib/finanzas-te-toca-reglas";

type Respuesta = { pendientes: PendienteTelar[]; incompleto: boolean } | null;

/** La pregunta que va en camino, por dirección: el botón de la barra y «Hoy te toca» piden lo mismo a la vez, y con una sola basta. */
const enCamino = new Map<string, Promise<Respuesta>>();

function preguntar(url: string): Promise<Respuesta> {
  const ya = enCamino.get(url);
  if (ya) return ya;
  const p = fetch(url, { headers: { "x-espera": "no" }, cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Respuesta>) : null))
    .catch(() => null)
    .finally(() => enCamino.delete(url));
  enCamino.set(url, p);
  return p;
}

/**
 * Los pendientes de Finanzas de la sede elegida, sin loader. Pregunta al abrir la pantalla y al cambiar de sede. `lista` es `null` si no respondió
 * (`leyendo` dice si todavía puede responder), que no es lo mismo que no tener nada.
 */
export function usePendientesTelar() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const sede = sedeDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") });
  const [estado, setEstado] = useState<{ lista: PendienteTelar[] | null; incompleto: boolean; leyendo: boolean }>({ lista: null, incompleto: false, leyendo: true });

  useEffect(() => {
    let vivo = true;
    const q = sede === SEDE_TODAS ? "" : `?sede=${encodeURIComponent(sede)}`;
    void preguntar(`/api/finanzas/te-toca${q}`).then((d) => {
      if (vivo) setEstado({ lista: d?.pendientes ?? null, incompleto: !d || d.incompleto, leyendo: false });
    });
    return () => {
      vivo = false;
    };
  }, [sede, pathname]);

  return estado;
}
