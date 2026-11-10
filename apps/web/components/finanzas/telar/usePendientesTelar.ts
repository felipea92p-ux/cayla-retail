"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sedeDeLaUrl, sedesDeLaUrl, SEDE_TODAS } from "@/lib/finanzas-telar-reglas";
import { puedeVolverAPreguntar, type PendienteTelar } from "@/lib/finanzas-te-toca-reglas";

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

/** Quienes están mirando los pendientes: la barra y «Hoy te toca» se enteran juntos de que la pantalla se volvió a leer. */
const oyentes = new Set<() => void>();

/**
 * Tras un guardado la pantalla hace `router.refresh()`, y eso vuelve a dibujar el layout de Finanzas con una marca nueva. Una navegación no lo vuelve a dibujar:
 * así se pregunta tras lo guardado sin preguntar en cada petición. Lo llama quien recibe la marca (`TeToca`).
 */
export function useAvisarPantallaRefrescada(marca: number) {
  const vista = useRef(marca);
  useEffect(() => {
    if (vista.current === marca) return;
    vista.current = marca;
    oyentes.forEach((o) => o());
  }, [marca]);
}

/**
 * Los pendientes de Finanzas de la sede elegida, sin loader. Pregunta al abrir la pantalla, al cambiar de sede, tras un guardado y al volver a la pestaña
 * (esto último, una vez por minuto como máximo). `lista` es `null` si no respondió (`leyendo` dice si todavía puede responder), que no es lo mismo que no
 * tener nada. `varias`: hay más de una sede marcada, y la respuesta es de todas.
 */
export function usePendientesTelar() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const sede = sedeDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") });
  const varias = sedesDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") }).length > 1;
  const [estado, setEstado] = useState<{ lista: PendienteTelar[] | null; incompleto: boolean; leyendo: boolean }>({ lista: null, incompleto: false, leyendo: true });
  const [vuelta, setVuelta] = useState(0);
  const ultimaPregunta = useRef(0);

  useEffect(() => {
    const otraVez = () => setVuelta((v) => v + 1);
    const alVolver = () => {
      if (puedeVolverAPreguntar(ultimaPregunta.current, Date.now())) otraVez();
    };
    oyentes.add(otraVez);
    window.addEventListener("focus", alVolver);
    return () => {
      oyentes.delete(otraVez);
      window.removeEventListener("focus", alVolver);
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    ultimaPregunta.current = Date.now();
    const q = sede === SEDE_TODAS ? "" : `?sede=${encodeURIComponent(sede)}`;
    void preguntar(`/api/finanzas/te-toca${q}`).then((d) => {
      if (vivo) setEstado({ lista: d?.pendientes ?? null, incompleto: !d || d.incompleto, leyendo: false });
    });
    return () => {
      vivo = false;
    };
  }, [sede, pathname, vuelta]);

  return { ...estado, varias };
}
