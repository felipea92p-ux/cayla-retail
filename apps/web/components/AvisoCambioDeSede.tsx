"use client";

import { useState } from "react";
import { useEsperando } from "@/components/ui/Espera";

/**
 * El aviso de «te estoy llevando a otra sede» — desde el ADR-0149 ya no dibuja nada propio: le pone su
 * mensaje (de qué sede viene y a cuál va) al loader general, que es el mismo de toda la app (pantalla
 * completa, por encima del menú, resto de la app `inert`, se va cuando llegan los datos).
 *
 * `activo` viene del `useTransition` del selector, no de un reloj. Los nombres se congelan mientras
 * `activo`: al terminar la carga `de`/`a` ya son los nuevos y el aviso todavía está saliendo.
 */
export function AvisoCambioDeSede({ activo, de, a, detalle = "Trayendo el inventario de esa sede…" }: { activo: boolean; de: string; a: string; detalle?: string }) {
  const [textos, setTextos] = useState({ de, a, detalle });
  if (activo && (textos.de !== de || textos.a !== a || textos.detalle !== detalle)) setTextos({ de, a, detalle });
  useEsperando(activo, {
    etiqueta: "Cambiando de sede",
    titulo: `${textos.de} →`,
    resalte: textos.a,
    detalle: textos.detalle,
  });
  return null;
}
