"use client";

/** «Imprimir o guardar en PDF» la constancia: el diálogo de impresión del navegador (ahí se elige «Guardar como PDF»). */
export function BotonImprimirHoja() {
  return (
    <button type="button" className="t-btn" onClick={() => window.print()}>
      Imprimir o guardar en PDF
    </button>
  );
}
