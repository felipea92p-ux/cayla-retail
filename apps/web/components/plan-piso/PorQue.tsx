"use client";

import { useId, useState } from "react";
import { pctEs } from "@/lib/mix-piso-visual";
import { detalleDeFila, type PanelDelPorQue } from "@/lib/plan-piso-percha";

// El botón «¿Por qué?» y su panel «cómo se calcula» (maqueta A, ADR-0352 act. 2026-10-11). Es una pieza aparte para que lo use la tarjeta del riel y TAMBIÉN la
// pantalla de una sede sin capacidad medida (sin riel que dibujar, la explicación de la propuesta tiene que seguir a un toque: revisión 2026-10-11).
// Va como un fragmento dentro de `.pp-rcab` (la cabecera de «Cómo quedaría»): el botón a la derecha y el panel EN SU PROPIA LÍNEA, justo debajo del botón. Antes
// el panel caía después de las seis tarjetas de la leyenda, a 280 px del botón, fuera de la vista en una laptop: el toque parecía no hacer nada.

export function PorQue({ texto, panel }: { texto: string; panel: PanelDelPorQue }) {
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  return (
    <>
      <button type="button" className="pp-porque" data-guia="plan-piso.por-que" aria-expanded={abierto} aria-controls={idPanel} onClick={() => setAbierto((a) => !a)}>
        <span className="pp-q" aria-hidden="true">
          ?
        </span>
        <span>{texto}</span>
      </button>
      <div className="pp-panel" id={idPanel} hidden={!abierto}>
        {panel.parrafos.map((t, k) => (
          <p key={k}>{t}</p>
        ))}
        <h4 className="pp-pt">Cómo salió cada grupo</h4>
        <ul>
          {panel.filas.map((f) => (
            <li key={f.clave}>
              <b>
                {f.nombre}
                {f.propuestaPct === null ? "" : ` → ${pctEs(f.propuestaPct)}`}
              </b>
              {detalleDeFila(f)}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
