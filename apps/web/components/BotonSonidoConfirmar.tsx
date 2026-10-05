"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { fijarSonidoConfirmar, sonidoConfirmar } from "@/lib/sonido-confirmar";

/** El interruptor del sonido de «confirmado» (por equipo, `lib/sonido-confirmar.ts`): un icono que dice su estado y lo cambia. */
export function BotonSonidoConfirmar() {
  const activo = useSyncExternalStore(sonidoConfirmar.suscribir, sonidoConfirmar.leer, sonidoConfirmar.leerEnServidor) === "si";
  const Icono = activo ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      onClick={() => fijarSonidoConfirmar(!activo)}
      aria-pressed={activo}
      aria-label="Sonido al confirmar"
      title={activo ? "Suena al confirmar · toca para silenciar" : "Sin sonido al confirmar · toca para activarlo"}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-tinta/60 transition-colors hover:text-tinta aria-pressed:text-tinta"
    >
      <Icono aria-hidden className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}
