"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  CADA_MS_PREGUNTAR_VERSION,
  MS_MAS_TARDE,
  VERSION_SIN_DATO,
  hayVersionNueva,
  leerVersion,
  tocaPreguntar,
} from "@/lib/version-nueva-reglas";

/** Con qué versión se armó ESTA pestaña (`next.config.ts`). Vacío o «desarrollo»: no hay nada que comparar. */
const VERSION_PROPIA = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

/** La versión que está en producción ahora, o `null` si no se pudo saber (sin red, sesión vencida, error): nunca lanza. */
async function preguntarVersion(): Promise<string | null> {
  const control = new AbortController();
  const corte = window.setTimeout(() => control.abort(), 8_000);
  try {
    // Sin `?dpl=` ni cabeceras de Next: con la protección de versiones de Vercel, solo un pedido sin esa marca llega a la
    // versión de AHORA (ver `app/api/version/route.ts`). `no-store`: nunca una respuesta repetida.
    const respuesta = await fetch("/api/version", { cache: "no-store", signal: control.signal });
    if (!respuesta.ok) return null;
    return leerVersion(await respuesta.json());
  } catch {
    return null;
  } finally {
    window.clearTimeout(corte);
  }
}

/**
 * «Hay una versión nueva de CAYLA»: la píldora flotante que avisa a quien tiene el ERP abierto desde antes de la última publicación
 * (ADR-0422). Montada UNA vez en `app/(app)/layout.tsx`, junto al aviso de «Sin conexión»: una pantalla nueva no tiene que
 * hacer nada. La pregunta y la comparación viven en `lib/version-nueva-reglas.ts`; aquí solo se escucha.
 *
 * Nunca recarga sola (en Vender el ticket en curso vive solo en la pantalla). «Actualizar» recarga porque la persona lo pidió;
 * la ✕ («Más tarde») la calla 30 minutos. Sin respuesta de la web, no hay aviso: callar es la degradación correcta.
 */
export function VersionNueva() {
  const [hayNueva, setHayNueva] = useState(false);
  const [callada, setCallada] = useState(false);

  useEffect(() => {
    if (!VERSION_PROPIA || VERSION_PROPIA === VERSION_SIN_DATO) return;
    let vivo = true;
    let preguntando = false;
    let ultimaMs: number | null = null;

    async function mirar() {
      if (preguntando || document.visibilityState !== "visible") return;
      preguntando = true;
      ultimaMs = Date.now();
      const enProduccion = await preguntarVersion();
      preguntando = false;
      // Sin respuesta (`null`) se deja lo que ya se sabía: un tropiezo de red no apaga ni enciende la franja.
      if (vivo && enProduccion) setHayNueva(hayVersionNueva(VERSION_PROPIA, enProduccion));
    }
    const alVolver = () => {
      if (document.visibilityState === "visible" && tocaPreguntar(Date.now(), ultimaMs)) void mirar();
    };

    void mirar();
    const reloj = window.setInterval(mirar, CADA_MS_PREGUNTAR_VERSION);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, []);

  // «Más tarde» calla un rato; pasado ese tiempo, si la pestaña sigue vieja, la franja vuelve.
  useEffect(() => {
    if (!callada) return;
    const id = window.setTimeout(() => setCallada(false), MS_MAS_TARDE);
    return () => window.clearTimeout(id);
  }, [callada]);

  if (!hayNueva || callada) return null;

  return (
    // Flota fuera del contenido (ADR-0422, act. 2026-10-28): no empuja la pantalla ni la tapa la barra fija de Finanzas.
    <div role="status" className="version-nueva">
      <span aria-hidden className="version-nueva-punto" />
      <p className="version-nueva-texto" title="Termina lo que estás haciendo y actualiza.">
        Hay una versión nueva <span>· actualiza cuando termines</span>
      </p>
      <button type="button" className="btn-cayla btn-secundario" onClick={() => window.location.reload()}>
        Actualizar
      </button>
      <button type="button" className="version-nueva-x" aria-label="Más tarde" title="Más tarde" onClick={() => setCallada(true)}>
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
