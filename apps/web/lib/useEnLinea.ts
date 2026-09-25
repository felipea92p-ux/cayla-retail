"use client";

import { useSyncExternalStore } from "react";

function suscribir(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

/**
 * ¿El navegador cree que hay red? Solo para AVISAR antes (ADR-0209, «huecos»): `navigator.onLine` dice «sin red»
 * con certeza, pero «con red» puede mentir (wifi sin internet). Por eso guardar nunca depende de esto — se intenta y,
 * si falla, se encola. En el servidor se asume que sí (no hay a quién avisar).
 */
export function useEnLinea(): boolean {
  return useSyncExternalStore(suscribir, () => navigator.onLine, () => true);
}
