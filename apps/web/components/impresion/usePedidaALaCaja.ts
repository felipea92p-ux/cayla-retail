"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { estadoEnLaCaja, pedirALaCaja, reintentarALaCaja, suscribirALaCola } from "@/components/impresion/colaDeLaCaja";

/** Cómo va la boleta que se mandó a la caja. */
export type EstadoPedida =
  | { fase: "pidiendo" }
  /** En la cola o ya tomada por la caja, todavía sin salir. */
  | { fase: "en-cola"; id: string }
  | { fase: "impresa"; id: string }
  | { fase: "error" };

const PIDIENDO: EstadoPedida = { fase: "pidiendo" };

/**
 * Pide la boleta de una venta a la cola de la caja y dice cómo va. La pedida y sus preguntas viven en `colaDeLaCaja.ts` (2026-11-25), no
 * aquí: siguen aunque quien mira se cierre, para que la tuerca de Vender sepa que hay una boleta esperando a la caja.
 */
export function usePedidaALaCaja(ventaId: string | null, activo: boolean) {
  useEffect(() => {
    if (activo && ventaId) pedirALaCaja(ventaId);
  }, [ventaId, activo]);
  const estado = useSyncExternalStore(
    suscribirALaCola,
    () => (activo && ventaId ? estadoEnLaCaja(ventaId) : PIDIENDO),
    () => PIDIENDO,
  );
  const reintentar = useCallback(() => {
    if (ventaId) reintentarALaCaja(ventaId);
  }, [ventaId]);
  return { estado, reintentar };
}
