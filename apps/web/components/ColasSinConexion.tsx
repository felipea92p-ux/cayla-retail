"use client";

import { useColaProductos } from "@/lib/useColaProductos";
import { useColaRecibir } from "@/lib/useColaRecibir";

/**
 * El sincronizador de las colas sin conexión (ADR-0209), montado UNA vez en `app/(app)/layout.tsx`: sube lo guardado
 * sin red desde cualquier pantalla, no solo desde la que lo guardó. No pinta nada; el aviso de cada cola lo pone su
 * pantalla (`ColaOfflineAviso`). La venta no pasa por acá: su cola sigue en `PuntoDeVenta.tsx` (ADR-0063), porque
 * necesita el overlay de stock y el envío a SUNAT de esa pantalla.
 */
export function ColasSinConexion() {
  useColaRecibir({ subir: true });
  useColaProductos({ subir: true });
  return null;
}
