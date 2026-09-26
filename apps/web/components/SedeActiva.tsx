"use client";

import { createContext, useContext } from "react";

export type SedeActiva = {
  ubicacionId: string;
  etiqueta: string;
  /** Quién inició sesión, si es una persona (`null` en una terminal): el combo «Responsable» la trae ya elegida. */
  personaSesionId?: string | null;
  /** Si esa persona es ADMIN (ADR-0178) y cómo se llama: el Admin firma a su nombre sin marcar asistencia, y el combo
   *  «Responsable» le muestra un aviso en vez de la lista (20260924171300). */
  esAdmin?: boolean;
  nombreSesion?: string;
};

const Contexto = createContext<SedeActiva | null>(null);

/**
 * La sede activa de la cabecera, al alcance de cualquier componente cliente sin pasarla de mano en mano. La usa el
 * combo «Responsable» (ADR-0161, A11: la lista sale de la sede activa; si el líder cambia de TRU a AQP, la lista
 * cambia). Se monta una vez en `app/(app)/layout.tsx` con lo que ya resolvió `requirePersonaActualV2`.
 *
 * Es solo la PERSPECTIVA de la pantalla: el permiso real lo vuelve a validar la base en cada RPC
 * (`fn_puede_operar_ubicacion`, y `fn_actor_persona_id` con el encabezado `x-ubicacion`).
 */
export function SedeActivaProveedor({
  ubicacionId,
  etiqueta,
  personaSesionId = null,
  esAdmin = false,
  nombreSesion = "",
  children,
}: SedeActiva & { children: React.ReactNode }) {
  return <Contexto.Provider value={{ ubicacionId, etiqueta, personaSesionId, esAdmin, nombreSesion }}>{children}</Contexto.Provider>;
}

/** `null` fuera del layout de la app (p. ej. una ruta pública de prueba). */
export function useSedeActiva(): SedeActiva | null {
  return useContext(Contexto);
}
