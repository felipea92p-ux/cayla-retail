"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { fijarSonidoConfirmar, sonidoConfirmar } from "@/lib/sonido-confirmar";

/** Como `DesplegablePildora`: con un valor puesto, el nombre baja de tono para que se lea el valor. */
const activa = (si: boolean) => (si ? "text-tinta/55" : undefined);

/** El interruptor del sonido de «confirmado» (por equipo, `lib/sonido-confirmar.ts`): un icono que dice su estado y lo cambia. */
export function BotonSonidoConfirmar({ conNombre = false }: { /** Con su nombre y su estado, como una píldora del panel «Filtros ▸ Vista» (2026-10-06). */ conNombre?: boolean } = {}) {
  const activo = useSyncExternalStore(sonidoConfirmar.suscribir, sonidoConfirmar.leer, sonidoConfirmar.leerEnServidor) === "si";
  const Icono = activo ? Volume2 : VolumeX;
  if (conNombre) {
    return (
      <button
        type="button"
        onClick={() => fijarSonidoConfirmar(!activo)}
        aria-pressed={activo}
        title={activo ? "Suena al colgar, subir, ajustar o reportar · toca para silenciar" : "Sin sonido al confirmar · toca para activarlo"}
        className={`label-cayla group flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[11px] transition-colors ${activo ? "text-tinta" : "text-tinta/60 hover:text-tinta"}`}
      >
        <Icono aria-hidden className={`h-3.5 w-3.5 shrink-0 ${activo ? "text-tinta/70" : "text-tinta/40 group-hover:text-tinta/60"}`} />
        <span className={activa(activo)}>Sonido al confirmar:</span>
        <span>{activo ? "Sí" : "No"}</span>
      </button>
    );
  }
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
