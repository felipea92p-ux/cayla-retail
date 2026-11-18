"use client";

import type { CSSProperties } from "react";
import type { ParteEstado } from "@/lib/estados-partes";

// Las partes de un gráfico de Estados financieros (ADR-0611). Desde el informe (camino A, Felipe 2026-11-06) el detalle de cada parte se abre en su fila del
// informe: el gráfico de la respuesta solo muestra, y cada parte se nombra para quien no ve el dibujo.

/** Lo que una pieza del gráfico dice de sí misma. */
export function useParte(clave: string, nombre: string) {
  return { "data-parte": clave, "aria-label": nombre, title: nombre };
}

function Segmento({ parte, hueco }: { parte: ParteEstado; hueco?: boolean }) {
  const p = useParte(parte.clave, parte.nombre);
  return (
    <span role="img" className="estados-seg" data-hueco={hueco || undefined} style={{ "--c": parte.color, flexGrow: parte.enBarra } as CSSProperties} {...p}>
      <span className="estados-seg-globo" aria-hidden>
        <b className="tabular-nums">{parte.texto}</b>
        <span>{parte.sub ? `${parte.nombre} · ${parte.sub}` : parte.nombre}</span>
      </span>
    </span>
  );
}

/** La barra: cada parte, del ancho de lo que pesa. */
export function TuboDePartes({ partes, huecos = [], etiqueta }: { partes: readonly ParteEstado[]; huecos?: readonly string[]; etiqueta: string }) {
  const visibles = partes.filter((x) => x.enBarra > 0);
  if (!visibles.length) return null;
  return (
    <div className="estados-tubo" role="group" aria-label={etiqueta}>
      {visibles.map((x) => (
        <Segmento key={x.clave} parte={x} hueco={huecos.includes(x.clave)} />
      ))}
    </div>
  );
}
