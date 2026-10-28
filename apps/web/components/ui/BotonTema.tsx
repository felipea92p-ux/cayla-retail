"use client";

import { useSyncExternalStore } from "react";
import { cambiarTema, suscribirTema, temaDelDocumento } from "@/lib/tema-cliente";
import { alternarTema, TEMA_POR_DEFECTO, textosDelBoton } from "@/lib/tema-reglas";

// El botón del modo oscuro (ADR-0336, Felipe 2026-10-05): en la cabecera, entre «Actividad» y la sede. Lo ve TODA cuenta —también
// una terminal—: no es un módulo ni una pantalla, es una preferencia del aparato. Mismo cuerpo que sus vecinos de la cabecera.
//
// El ÍCONO no lo decide React sino el CSS (`.boton-tema` en `app/estilos/tema.css`), a partir del atributo de <html> que el script
// del <head> ya fijó: así sale bien desde la primera pintura, sin destello ni desajuste de hidratación. React solo lleva el
// estado accesible (`aria-pressed`), y el servidor siempre pinta el claro: `useSyncExternalStore` corrige al hidratar sin avisos.

export function BotonTema() {
  const tema = useSyncExternalStore(suscribirTema, temaDelDocumento, () => TEMA_POR_DEFECTO);
  const { etiqueta, titulo } = textosDelBoton(tema);

  return (
    <button
      type="button"
      onClick={() => cambiarTema(alternarTema(temaDelDocumento()))}
      aria-label={etiqueta}
      aria-pressed={tema === "oscuro"}
      title={titulo}
      className="boton-tema grid h-9 w-9 place-items-center rounded-lg text-tinta/65 transition-colors hover:bg-sand/60 hover:text-rojo"
    >
      {/* Luna: se ve en claro (el clic lleva al oscuro). Sol: se ve en oscuro. Una se apaga mientras la otra entra. */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="tema-luna h-[18px] w-[18px]">
        <path d="M20.5 14.2A8.5 8.5 0 019.8 3.5a8.5 8.5 0 1010.7 10.7z" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="tema-sol h-[18px] w-[18px]">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
      </svg>
    </button>
  );
}
