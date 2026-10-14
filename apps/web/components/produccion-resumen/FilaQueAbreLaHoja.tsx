"use client";

import { useRef, useState, type ReactNode } from "react";
import type { HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { HojaModelo } from "./HojaModelo";

/**
 * Una fila de «¿Qué producir?»: el botón que abre la hoja «Ver el modelo» de su modelo. El contenido de la fila (`children`) lo dibuja el servidor; esto solo le pone el botón y el
 * estado de «abierta». La hoja se monta SOLO al abrirla y va al lado del botón, no adentro: así el clic de la hoja no sube a la fila (ADR-0128), y al cerrar el foco vuelve al botón
 * (`alCerrarEnfocar`). Abrirla no guarda nada ni pide nada a la base: el dato ya llegó con la página.
 */
export function FilaQueAbreLaHoja({ hoja, presentacion, guia, className, children }: { hoja: HojaDeModelo; presentacion?: PresentacionDeModelo; guia?: string; className: string; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={boton} type="button" aria-haspopup="dialog" data-guia={guia} onClick={() => setAbierta(true)} className={className}>
        {children}
      </button>
      {abierta && <HojaModelo hoja={hoja} presentacion={presentacion} onClose={() => setAbierta(false)} alCerrarEnfocar={boton} />}
    </>
  );
}
