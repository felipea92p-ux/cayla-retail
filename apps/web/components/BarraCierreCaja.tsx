"use client";

import { useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import type { EstadoBotonCierre } from "@/lib/caja-cierre-boton-reglas";

// El botón «Cerrar caja» que se nota (ADR-0318). Dos piezas que dicen lo mismo con el mismo estado:
//  · `BotonCerrarCaja`: el de la cabecera —grande, rojo, con candado— y «Abierta hace 6 h 38 min» debajo.
//  · `BarraCierreCaja`: la barra que se queda pegada abajo en escritorio, y sube de color con la hora de cierre.
// En el celular lo hace el cuadrado «Cerrar» de `BarraCajaMovil` (ya es una barra fija). No es el recordatorio: la «Isla»
// (ADR-0305) avisa desde otra pantalla; esto es que el propio botón esté a la vista dentro de Caja, todo el día.

export function BotonCerrarCaja({ estado, onCerrar }: { estado: EstadoBotonCierre | null; onCerrar: () => void }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button type="button" onClick={onCerrar} className="cc-boton">
        <Lock size={18} aria-hidden /> Cerrar caja
      </button>
      {estado && <small className="text-[11.5px] text-tinta/65">{estado.abiertaHace}</small>}
    </div>
  );
}

export function BarraCierreCaja({ estado, onCerrar }: { estado: EstadoBotonCierre | null; onCerrar: (() => void) | null }) {
  const botonRef = useRef<HTMLButtonElement>(null);
  const nivelAnterior = useRef<number | null>(null);
  // Un destello al subir de nivel (no en el primer pintado): responde a algo que pasó, no es un adorno.
  useEffect(() => {
    if (!estado) return;
    const antes = nivelAnterior.current;
    nivelAnterior.current = estado.nivel;
    if (antes === null || antes === estado.nivel) return;
    const b = botonRef.current;
    if (!b) return;
    b.classList.remove("cc-destello");
    void b.offsetWidth; // reinicia la animación si ya estaba puesta
    b.classList.add("cc-destello");
  }, [estado]);

  if (!estado) return null;
  return (
    <div className="cc-barra-pie hidden sm:block">
      <div className="cc-barra" data-nivel={estado.nivel} role="status">
        <div>
          <b>{estado.titulo}</b>
          <span className="cc-bajada">{estado.bajada}</span>
        </div>
        {onCerrar && (
          <button ref={botonRef} type="button" onClick={onCerrar} className="cc-boton">
            <Lock size={18} aria-hidden /> Cerrar caja
          </button>
        )}
      </div>
    </div>
  );
}
