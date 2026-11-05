"use client";

import { useSyncExternalStore } from "react";
import { momentoEnLima, type MomentoEnLima } from "@cayla-retail/shared/horario-de-tienda";

// La hora de Lima para decir «Abierta · cierra 9 p. m.» (Tienda web ▸ Conf. Tienda). `useSyncExternalStore` y no un efecto: en el servidor no hay
// reloj de la persona, así que la primera pintura no dice nada (`null`) y, ya en el navegador, entra la hora y se renueva cada medio minuto. Así
// nunca se pinta un «Abierta» viejo ni hay diferencia entre lo que armó el servidor y lo que ve la persona.
const unaVezPorMinuto = () => Math.floor(Date.now() / 60_000);

function suscribir(avisar: () => void): () => void {
  const id = setInterval(avisar, 30_000);
  return () => clearInterval(id);
}

export function useAhoraEnLima(): MomentoEnLima | null {
  const minuto = useSyncExternalStore(suscribir, unaVezPorMinuto, () => 0);
  return minuto === 0 ? null : momentoEnLima(new Date(minuto * 60_000));
}
