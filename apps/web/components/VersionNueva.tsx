"use client";

import { useEffect, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
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
 * «Hay una versión nueva de CAYLA»: la franja que avisa a quien tiene el ERP abierto desde antes de la última publicación
 * (ADR-0422). Montada UNA vez en `app/(app)/layout.tsx`, junto al aviso de «Sin conexión»: una pantalla nueva no tiene que
 * hacer nada. La pregunta y la comparación viven en `lib/version-nueva-reglas.ts`; aquí solo se escucha.
 *
 * Nunca recarga sola (en Vender el ticket en curso vive solo en la pantalla). «Actualizar» recarga porque la persona lo pidió;
 * «Más tarde» calla la franja 30 minutos. Sin respuesta de la web, no hay franja: callar es la degradación correcta.
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
    <Aviso
      chico
      tono="info"
      titulo="Hay una versión nueva de CAYLA"
      // En un celular (375 px) los dos botones a la derecha le dejaban al texto 120 px y la franja medía 109 de alto: ahí bajan
      // debajo del texto, con alto de dedo (44 px). Son clases de utilidad sobre `.aviso-linea-acc`, que vive en la capa de
      // componentes: ganan sin `!`. Si esa clase cambiara, la franja se ve apretada en el celular, no rota.
      className="mb-4 max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:[&_.aviso-linea-acc]:col-start-2 max-sm:[&_.aviso-linea-acc]:row-start-2 max-sm:[&_.aviso-linea-acc]:flex max-sm:[&_.aviso-linea-acc]:justify-self-start max-sm:[&_.aviso-linea-acc_button]:min-h-11"
      accion={
        <>
          <button type="button" onClick={() => window.location.reload()}>
            Actualizar
          </button>
          <button type="button" onClick={() => setCallada(true)}>
            Más tarde
          </button>
        </>
      }
    >
      Termina lo que estás haciendo y actualiza.
    </Aviso>
  );
}
