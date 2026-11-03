"use client";

import { X } from "lucide-react";

/**
 * La ✕ de una fila o de una placa: saca algo que la persona agregó (Felipe 2026-11-03), como el lápiz (`LapizEditar`) pero en rojo: lo peligroso es rojo desde el principio.
 * Es un ícono solo, de 32 px, con «Quitar <que>» para el lector y para el título al pasar el mouse. Quitar se perdona (el aviso trae «Deshacer»): no pregunta.
 */
export function BotonQuitar({ que, onClick, className = "", title, guia }: { que: string; onClick: () => void; className?: string; title?: string; guia?: string }) {
  const nombre = `Quitar ${que}`;
  return (
    <button type="button" onClick={onClick} aria-label={nombre} title={title ?? nombre} data-guia={guia} className={`icono-fila icono-quitar grid h-8 w-8 shrink-0 place-items-center ${className}`}>
      <X aria-hidden className="h-4 w-4" />
    </button>
  );
}
