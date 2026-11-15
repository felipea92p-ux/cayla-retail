"use client";

import { Aviso } from "@/components/ui/Aviso";
import { avisoDeCostoDudoso } from "@/lib/costo-atipico-reglas";
import type { DudaDeCosto } from "@/lib/referencia-de-costo";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * El costo de una prenda tiene una duda sin confirmar (ADR-0668, A4): «Antes pagabas S/ 44» bajo un 440, «¿Escribiste el monto sin
 * impuesto?» bajo un 18.50 cuando la orden dice 21.83. Mientras se vea, la hoja no sugiere precio. «Sí, pagué S/ X» confirma ESE monto (si
 * después cambia el costo, la duda vuelve); «Usar S/ …» pone lo de la orden y no confirma nada: lo nuevo se vuelve a revisar.
 */
export function AvisoCostoDudoso({
  duda,
  costo,
  nombre,
  onConfirmar,
  onUsar,
  className = "",
}: {
  duda: DudaDeCosto;
  /** El costo que se está confirmando, tal como quedaría. */
  costo: number;
  /** De qué prenda es, para el lector de pantalla cuando hay varias en la hoja. */
  nombre: string;
  onConfirmar: (monto: number) => void;
  onUsar?: (monto: number) => void;
  className?: string;
}) {
  const aviso = avisoDeCostoDudoso(duda.motivo, duda.ref);
  // Los botones van bajo la frase, no al costado (`accion`): en una hoja angosta, dos botones al lado apretaban el texto a dos letras por línea.
  return (
    <Aviso tono="atencion" titulo={aviso.titulo} className={className} guia="recibir.costo-dudoso">
      <p>{aviso.linea}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {aviso.usar !== null && onUsar && (
          <button type="button" className="btn-cayla btn-secundario btn-chico" aria-label={`Usar ${soles(aviso.usar)} como costo de ${nombre}`} onClick={() => onUsar(aviso.usar!)}>
            Usar {soles(aviso.usar)}
          </button>
        )}
        <button type="button" className="btn-cayla btn-secundario btn-chico" aria-label={`Sí, pagué ${soles(costo)} por cada ${nombre}`} onClick={() => onConfirmar(costo)}>
          Sí, pagué {soles(costo)}
        </button>
      </div>
    </Aviso>
  );
}
