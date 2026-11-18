"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { caminoDe, esVisitaNueva } from "@/lib/visita";

// Tienda web ▸ Tráfico (ADR-0495): avisa «entró» una vez por visita (una visita dura mientras la persona vuelve a tocar algo antes de
// 30 minutos), con el camino por donde llegó. No dibuja nada. Con «no me rastrees» (Global Privacy Control) no manda nada.
// La hora del último paso vive en este aparato (`localStorage`); si el navegador no deja guardarla, se recuerda solo en esta pestaña.
const CLAVE_ULTIMO_PASO = "cayla-visita";
let ultimoEnMemoria: number | null = null;

function marcarPaso(ahora: number): number | null {
  let ultima = ultimoEnMemoria;
  try {
    const guardada = Number(localStorage.getItem(CLAVE_ULTIMO_PASO));
    if (guardada > 0) ultima = guardada;
    localStorage.setItem(CLAVE_ULTIMO_PASO, String(ahora));
  } catch {
    // Sin almacenamiento: vale la memoria de la pestaña.
  }
  ultimoEnMemoria = ahora;
  return ultima;
}

export function Visita() {
  const ruta = usePathname();
  useEffect(() => {
    if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    const ahora = Date.now();
    if (!esVisitaNueva(marcarPaso(ahora), ahora)) return;
    const camino = caminoDe({ referente: document.referrer, busqueda: location.search, dominio: location.hostname });
    // Un `fetch` y no `sendBeacon`: la respuesta trae la cookie del visitante y el navegador tiene que guardarla.
    void fetch("/api/visita", {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pasos: [{ paso: 0, camino }] }),
    }).catch(() => {});
  }, [ruta]);
  return null;
}
