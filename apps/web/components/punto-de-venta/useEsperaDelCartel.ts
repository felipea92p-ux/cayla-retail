"use client";

import { useEffect, useRef, useState } from "react";
import { resumenClientaCaja, type ResumenClientaCaja } from "@/lib/club-acciones";
import { CONSULTA_CARTEL_CADA_MS, esperaDelCartel, type EsperaDelCartel } from "@/lib/club-caja-reglas";

/**
 * «Pídele que escanee el cartel del club» (ADR-0288, tanda 1g, G-2): mientras la tarjeta de una clienta que no es socia está a
 * la vista (`activa`), pregunta `resumen_clienta_caja` cada 3 s (lectura `resumen_`: no abre el loader). Cuando ella se une
 * desde el cartel con ese documento, avisa con su resumen nuevo (`onSocia`) y la tarjeta pasa sola a «Miembro». Deja de
 * preguntar al desmontarse, con la pestaña oculta (sigue sola al volver) y a los 10 minutos: entonces la fila ofrece
 * «Actualizar», que pregunta una vez y, si todavía no, vuelve a esperar otros 10. Un fallo de red no cambia nada: la siguiente
 * vuelta pregunta de nuevo. La regla de cuándo pregunta es `esperaDelCartel` (lib/club-caja-reglas.ts, con pruebas).
 */
export function useEsperaDelCartel(v: { clientaId: string | null; activa: boolean; onSocia: (resumen: ResumenClientaCaja) => void }): {
  espera: EsperaDelCartel;
  actualizar: () => void;
  revisando: boolean;
} {
  const { clientaId, activa } = v;
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  // Para quién venció la espera: otra clienta empieza de cero.
  const [vencidaPara, setVencidaPara] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  // Cuándo empezó a esperar ESTA clienta: sobrevive a una pausa (la pestaña oculta), así los 10 minutos son 10.
  const desde = useRef<{ clientaId: string; ms: number } | null>(null);
  const vencida = clientaId !== null && vencidaPara === clientaId;

  // `onSocia` cambia en cada render de quien la usa: la consulta lee siempre el último sin reiniciarse.
  const alSocia = useRef(v.onSocia);
  useEffect(() => {
    alSocia.current = v.onSocia;
  }, [v.onSocia]);

  const consultar = activa && visible && !vencida && clientaId !== null;
  useEffect(() => {
    if (!consultar || !clientaId) return;
    if (desde.current?.clientaId !== clientaId) desde.current = { clientaId, ms: Date.now() };
    let vigente = true;
    let enVuelo = false;
    const vuelta = setInterval(() => {
      const inicio = desde.current?.ms ?? Date.now();
      if (esperaDelCartel({ visible: true, desdeMs: inicio, ahoraMs: Date.now() }) === "vencida") {
        setVencidaPara(clientaId);
        return;
      }
      if (enVuelo) return;
      enVuelo = true;
      resumenClientaCaja(clientaId)
        .then(({ resumen }) => {
          if (vigente && resumen?.esSocia) alSocia.current(resumen);
        })
        .catch(() => undefined)
        .finally(() => {
          enVuelo = false;
        });
    }, CONSULTA_CARTEL_CADA_MS);
    return () => {
      vigente = false;
      clearInterval(vuelta);
    };
  }, [consultar, clientaId]);

  // La pestaña oculta pausa la consulta; al volver, sigue sola (si no pasaron los 10 minutos).
  useEffect(() => {
    const alCambiar = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, []);

  /** «¿Ya se unió? Actualizar»: pregunta una vez y, si todavía no, vuelve a esperar otros 10 minutos. */
  async function actualizar() {
    if (!clientaId) return;
    setRevisando(true);
    const { resumen } = await resumenClientaCaja(clientaId).catch(() => ({ resumen: null }));
    setRevisando(false);
    if (resumen?.esSocia) {
      alSocia.current(resumen);
      return;
    }
    desde.current = { clientaId, ms: Date.now() };
    setVencidaPara(null);
  }

  return { espera: vencida ? "vencida" : visible ? "esperando" : "pausada", actualizar: () => void actualizar(), revisando };
}
