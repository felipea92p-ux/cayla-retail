"use client";

import { useSyncExternalStore } from "react";
import { prefiereQuieto, suscribirMovimiento } from "./movimiento-cliente";

/**
 * Para una pieza que DIBUJA distinto si las animaciones están apagadas (ADR-0625): se vuelve a pintar cuando alguien pulsa
 * «Animaciones» o cambia la preferencia del aparato. En el servidor no se sabe: quieto, como arranca el ERP.
 */
export function useQuieto(): boolean {
  return useSyncExternalStore(suscribirMovimiento, prefiereQuieto, () => true);
}
