"use client";

import { notaDeLaFoto, type ColorDelProbador, type PrendaDelProbador } from "@/lib/probador";

/**
 * Bajo la figura, los colores de la prenda elegida (lienzo v3): su muestra, el nombre del puesto con cuánto hay y, si no tiene foto
 * propia, qué se está viendo («Aún no hay foto en negro: ves la del rosa pálido»). Un color sin foto se elige igual (Felipe, 2026-10-16).
 * La muestra es el color de la prenda: un dato, igual en claro y en oscuro.
 */
export function Colores({ prenda, color, onElegir }: { prenda: PrendaDelProbador; color: ColorDelProbador; onElegir: (codigo: string) => void }) {
  const deLaFoto = notaDeLaFoto(color);
  return (
    <div className="pb-colores" role="group" aria-label={`Colores de ${prenda.nombre}`}>
      <div className="pb-muestras">
        {prenda.colores.map((c) => (
          <button
            key={c.codigo}
            type="button"
            className="pb-muestra"
            aria-pressed={c.codigo === color.codigo}
            aria-label={`${c.nombre}${c.nota ? `: ${c.nota.texto}` : ""}${c.foto.propia ? "" : " (aún sin foto de este color)"}`}
            onClick={() => onElegir(c.codigo)}
          >
            <span data-color-dato style={c.hex ? { background: c.hex } : undefined} />
          </button>
        ))}
      </div>
      <div className="pb-colores-txt">
        <span className="pb-colores-nombre">
          {color.nombre}
          {color.nota && <span className={`pb-nota ${color.nota.tono}`}> · {color.nota.texto}</span>}
        </span>
        <span className={`pb-colores-ayuda${deLaFoto ? " sin-foto" : ""}`}>
          {deLaFoto ?? (prenda.colores.length === 1 ? "Único color" : `${prenda.colores.length} colores · toca uno para elegirlo`)}
        </span>
      </div>
    </div>
  );
}
