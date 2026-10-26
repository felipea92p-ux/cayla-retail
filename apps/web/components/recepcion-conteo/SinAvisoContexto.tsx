"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { PackageOpen } from "lucide-react";
import { Boton } from "@/components/ui/campos";

// El botón «Sin Aviso» y el formulario que abre viven en lugares distintos de Recibir (el botón, a la derecha del título de «Envíos por
// recibir»; el formulario, debajo de la tabla): este contexto les comparte si está abierto. Sin proveedor (otra pantalla que dibuje el
// formulario) cada pieza se arregla sola: `LlegoSinAviso` guarda su propio estado.

type Estado = { abierto: boolean; cambiar: (abierto: boolean | ((a: boolean) => boolean)) => void };
const Contexto = createContext<Estado | null>(null);

export function SinAvisoProvider({ children }: { children: ReactNode }) {
  const [abierto, cambiar] = useState(false);
  return <Contexto.Provider value={{ abierto, cambiar }}>{children}</Contexto.Provider>;
}

export const useSinAviso = () => useContext(Contexto);

/** El botón que abre y esconde el formulario «Sin aviso». */
export function BotonSinAviso({ abierto, onCambiar }: { abierto?: boolean; onCambiar?: () => void } = {}) {
  const ctx = useSinAviso();
  const estaAbierto = abierto ?? ctx?.abierto ?? false;
  return (
    <Boton type="button" peso="fantasma" aria-expanded={estaAbierto} aria-controls="sin-aviso-formulario" onClick={onCambiar ?? (() => ctx?.cambiar((a) => !a))}>
      <span className="inline-flex items-center gap-2">
        <PackageOpen aria-hidden className="h-4 w-4" />
        Sin Aviso
      </span>
    </Boton>
  );
}

/** Lo que va a la derecha del título de la tabla de envíos: la pregunta y, junto a ella, el botón. La pregunta, arriba y el botón debajo, se va cuando el formulario está abierto. */
export function AccionSinAviso() {
  const ctx = useSinAviso();
  return (
    <div className="flex flex-col items-end gap-2">
      {!ctx?.abierto && <p className="text-[13.5px] text-taupe">¿Llegó algo que no está en la lista? Ábrelo aquí.</p>}
      <BotonSinAviso />
    </div>
  );
}
