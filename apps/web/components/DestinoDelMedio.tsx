"use client";

import Link from "next/link";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
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
    // «No puedes verlos» no es una falta del proveedor: sin tono de alerta y sin «Agregar en su ficha» (quien no ve los datos no los agrega).
    const sinPermiso = destino.sinPermiso === true;
    return (
      <p role="status" className={`anim-revelar text-xs ${sinPermiso ? "text-tinta/70" : "text-ambar-profundo"} ${className}`}>
        {destino.aviso}
        {enlaceFicha && !sinPermiso && (
          <>
            {" "}
            <Link href={enlaceFicha} target="_blank" rel="noopener" className="btn-enlace">
              Agregar en su ficha ↗
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className={`anim-revelar flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-sand/40 px-3 py-1.5 text-xs text-tinta/70 ${className}`}>
      {/* El titular va primero (Felipe 2026-10-21): es lo que se compara con el nombre que muestra el banco antes de confirmar. */}
      {destino.titular && (
        <span className="text-tinta/55">
          a nombre de <b className="font-semibold text-tinta/80">{destino.titular}</b>
        </span>
      )}
      {destino.banco && <span className="font-medium text-tinta">{destino.banco}</span>}
      {destino.filas.map((f) => (
        <DatoCopiable key={f.etiqueta} fila={f} />
      ))}
    </div>
  );
}

// Copiar es la pieza del sistema (<BotonCopiar>, ronda 13): el ícono junto al dato, que se vuelve ✓ y dice «Copiado».
function DatoCopiable({ fila }: { fila: FilaDestino }) {
  const nombre = fila.etiqueta.toLowerCase();
  const que = nombre === "cuenta" ? "la cuenta" : nombre === "cci" ? "el CCI" : `el ${fila.etiqueta}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="label-cayla text-[10px] text-tinta/55">{fila.etiqueta}</span>
      <span className="tabular-nums tracking-[0.02em] text-tinta select-all">{fila.valor}</span>
      <BotonCopiar forma="icono" texto={fila.copiar} que={que} className="-my-2" />
    </span>
  );
}
