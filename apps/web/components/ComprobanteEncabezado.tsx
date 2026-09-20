"use client";

import { useState } from "react";
import { Chip, type TonoChip } from "@/components/ui/Chip";

// Cabecera del detalle de un comprobante (ADR-0136): «Total del comprobante» en grande y, a la derecha, los dos
// chips de estado (recepción y pago, como en el prototipo). Las acciones (registrar pago, ir a recibir…) ya no van
// aquí: viven en el pie del detalle (`CompraAcciones`). Los chips cambian de color con suavidad y
// dan un pequeño «pop» cuando su texto cambia —p. ej. de «Pago parcial» a «Pagada» tras registrar un pago—,
// porque el componente sigue montado cuando `router.refresh()` trae los datos nuevos.

export type ChipEstado = { clave: string; tono: TonoChip; texto: string; /** Punto que late: solo para lo que pide actuar hoy («Vencida»). */ vivo?: boolean };

export function ComprobanteEncabezado({
  total,
  chips,
  anulada,
}: {
  /** El total ya formateado (`soles(compra.total)`). */
  total: string;
  chips: ChipEstado[];
  /** Si el comprobante está anulado se dice en vez de los chips (con el motivo, si lo hay). */
  anulada?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Total del comprobante</p>
        <p className="font-display mt-1 text-4xl leading-none tabular-nums text-tinta">{total}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {anulada ? (
          <p className="text-sm text-rojo">{anulada}</p>
        ) : (
          <p className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <ChipConPop key={c.clave} tono={c.tono} texto={c.texto} vivo={c.vivo} />
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

function ChipConPop({ tono, texto, vivo }: { tono: TonoChip; texto: string; vivo?: boolean }) {
  // Se compara con el texto de la pintada anterior: si cambió, el chip hace `anim-pop` una vez (globals.css).
  const [previo, setPrevio] = useState(texto);
  const [pon, setPon] = useState(false);
  if (texto !== previo) {
    setPrevio(texto);
    setPon(true);
  }
  return (
    <span className={`inline-block ${pon ? "anim-pop" : ""}`} onAnimationEnd={() => setPon(false)}>
      <Chip tono={tono} vivo={vivo} className="transition-[background-color,border-color,color] duration-500">
        {texto}
      </Chip>
    </span>
  );
}
