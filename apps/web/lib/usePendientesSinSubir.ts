"use client";

import { useEffect, useState } from "react";
import { contarPendientes } from "@/lib/cola-offline";
import { EVENTO_COLA } from "@/lib/useColaOffline";

/** Todas las colas de este navegador, leídas en crudo (lo que `contarPendientes` sabe filtrar). Nunca lanza. */
export function leerPendientesSinSubir(): { pendientes: number; rechazadas: number } {
  const entradas: [string, string | null][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) entradas.push([k, localStorage.getItem(k)]);
    }
  } catch {
    // localStorage bloqueado: tampoco hay nada guardado sin conexión.
  }
  return contarPendientes(entradas);
}

/**
 * Cuánto espera subir en este equipo, en TODAS las colas (Recibir, Productos y Vender) — ADR-0209, «huecos». Se relee
 * cuando una cola avisa que cambió, cuando otra pestaña la toca, y cada 15 s (la cola de Vender, ADR-0063, escribe sin
 * avisar). Alimenta el aviso de la cabecera (`SinConexion`) y la pregunta al cerrar sesión (`LogoutButton`).
 */
export function usePendientesSinSubir(): { pendientes: number; rechazadas: number } {
  const [cuenta, setCuenta] = useState({ pendientes: 0, rechazadas: 0 });
  useEffect(() => {
    const releer = () =>
      setCuenta((prev) => {
        const nueva = leerPendientesSinSubir();
        return nueva.pendientes === prev.pendientes && nueva.rechazadas === prev.rechazadas ? prev : nueva;
      });
    releer();
    window.addEventListener(EVENTO_COLA, releer);
    window.addEventListener("storage", releer);
    const latido = window.setInterval(releer, 15_000);
    return () => {
      window.removeEventListener(EVENTO_COLA, releer);
      window.removeEventListener("storage", releer);
      window.clearInterval(latido);
    };
  }, []);
  return cuenta;
}
