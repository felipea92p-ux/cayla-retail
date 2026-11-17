"use client";

import { useSyncExternalStore } from "react";
import { cambiarLiviano, livianoDelDocumento, suscribirLiviano } from "@/lib/liviano-cliente";
import { alternarLiviano, textosDelBotonLiviano } from "@/lib/liviano-reglas";

// El botón «Modo liviano» (ADR-0674, Felipe 2026-11-17): en la cabecera, junto al de las animaciones y con su mismo cuerpo. Lo ve TODA
// cuenta —también una terminal—: es una preferencia del aparato, no un módulo. En un equipo lento ya viene encendido; aquí se cambia a mano.
//
// Como el de las animaciones, el ÍCONO lo decide el CSS (`.boton-liviano` en `app/estilos/liviano.css`) a partir del atributo de <html>
// que el script del <head> ya fijó: sale bien desde la primera pintura. React solo lleva `aria-pressed`.

export function BotonLiviano() {
  const liviano = useSyncExternalStore(suscribirLiviano, livianoDelDocumento, () => "no" as const);
  const { etiqueta, titulo } = textosDelBotonLiviano(liviano);

  return (
    <button
      type="button"
      onClick={() => cambiarLiviano(alternarLiviano(livianoDelDocumento()))}
      aria-label={etiqueta}
      aria-pressed={liviano === "si"}
      title={titulo}
      className="boton-liviano grid h-9 w-9 place-items-center rounded-lg text-tinta/65 transition-colors hover:bg-sand/60 hover:text-rojo"
    >
      {/* La pluma de lucide («Feather»): encendido, sola; apagado, cruzada por una raya, como el destello de las animaciones. */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-[18px] w-[18px]">
        <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" />
        <path d="M16 8 2 22" />
        <path d="M17.5 15H9" />
        <path className="liviano-raya" d="M3 3l18 18" />
      </svg>
    </button>
  );
}
