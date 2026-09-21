"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import type { DestinoDelMedio as Destino, FilaDestino } from "@/lib/destino-de-pago";

// A dónde va la plata con el medio que se acaba de elegir (ADR-0134), en UNA línea y sin cajas: transferencia o
// depósito → cuenta y CCI; Yape o Plin → ese celular; el resto, nada (lo decide `destinoDelMedio`, lógica pura).
// Reemplaza al bloque grande «Paga por» dentro de las pantallas de pago: ahí solo estorbaba (mostraba también el
// Yape cuando se pagaba por transferencia). El bloque completo sigue en la ficha del proveedor.
//
// Cada dato lleva su «copiar» (copia el valor limpio, listo para pegar en la app del banco). Con `key={metodo}` en
// quien lo usa, cambiar de medio re-monta la línea y se asienta de nuevo (`anim-revelar`): se nota que cambió.

export function DestinoDelMedio({ destino, enlaceFicha, className = "" }: { destino: Destino | null; /** Ruta de la ficha del proveedor: ofrece «Agregar…» cuando falta el dato. */ enlaceFicha?: string; className?: string }) {
  if (!destino) return null;

  if (destino.aviso) {
    return (
      <p role="status" className={`anim-revelar text-xs text-ambar-profundo ${className}`}>
        {destino.aviso}
        {enlaceFicha && (
          <>
            {" "}
            <Link href={enlaceFicha} target="_blank" rel="noopener" className="text-rojo hover:underline">
              Agregar en su ficha ↗
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className={`anim-revelar flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-sand/40 px-3 py-1.5 text-xs text-tinta/70 ${className}`}>
      {destino.banco && <span className="font-medium text-tinta">{destino.banco}</span>}
      {destino.filas.map((f) => (
        <DatoCopiable key={f.etiqueta} fila={f} />
      ))}
      {destino.titular && (
        <span className="text-tinta/55">
          a nombre de <b className="font-semibold text-tinta/80">{destino.titular}</b>
        </span>
      )}
    </div>
  );
}

function DatoCopiable({ fila }: { fila: FilaDestino }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(fila.copiar);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1400);
    } catch {
      // Sin permiso del portapapeles el valor sigue a la vista: se puede seleccionar y copiar a mano.
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="label-cayla text-[10px] text-tinta/55">{fila.etiqueta}</span>
      <span className="tabular-nums tracking-[0.02em] text-tinta select-all">{fila.valor}</span>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar ${fila.etiqueta}`}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors ${copiado ? "bg-verde/15 text-verde-profundo" : "text-tinta/45 hover:bg-tinta/10 hover:text-tinta"}`}
      >
        {copiado ? <Check aria-hidden className="h-3 w-3" /> : <Copy aria-hidden className="h-3 w-3" />}
        <span aria-live="polite" className="sr-only">
          {copiado ? "Copiado" : ""}
        </span>
      </button>
    </span>
  );
}
