"use client";

import { useEffect, useRef } from "react";

/**
 * La hoja que sube desde abajo (ADR-0431), hecha con el `<dialog>` del navegador: él pone el velo, deja el fondo quieto para el lector
 * de pantalla, atrapa el foco y entrega el Escape; aquí solo se sube y se cierra al tocar fuera. Se monta ya abierta y se desmonta al
 * cerrar: quien la usa decide cuándo.
 */
export function HojaNativa({ etiqueta, alCerrar, children }: { etiqueta: string; alCerrar: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="t-inst"
      aria-label={etiqueta}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      // Tocar fuera de la hoja (el velo) cierra: el destino del clic es el propio <dialog>, no su contenido.
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      {/* `autoFocus` en la hoja misma: el diálogo enfoca lo primero que encuentra, y sobre el botón principal dibujaba un aro rojo. */}
      <div className="t-inst-hoja" tabIndex={-1} autoFocus>
        <div className="t-inst-asa" aria-hidden="true" />
        {children}
      </div>
    </dialog>
  );
}
