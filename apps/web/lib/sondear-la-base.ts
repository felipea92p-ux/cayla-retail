"use client";

import { anotarRespuestaDeLaBase } from "@/lib/useEnLinea";

/**
 * ¿Responde la base? Una lectura mínima (`/auth/v1/health`), sin loader ni sesión, cortada a los 8 s. Si responde, queda
 * anotado como evidencia de red (`useEnLinea`). La usan el aviso «Sin conexión» (`SinConexion.tsx`) y el refresco que
 * sigue a una escritura sin respuesta (`RefrescoTrasCorte.tsx`, ADR-0411): una sola idea de «hay red» en todo el ERP.
 */
export async function sondearLaBase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) return false;
  try {
    const control = new AbortController();
    const corte = window.setTimeout(() => control.abort(), 8_000);
    await fetch(`${url}/auth/v1/health`, { headers: { apikey: clave }, cache: "no-store", signal: control.signal });
    window.clearTimeout(corte);
    anotarRespuestaDeLaBase();
    return true;
  } catch {
    return false;
  }
}
