"use client";

import { useRef } from "react";
import { useAlVerse } from "@/components/movimientos/useAlVerse";
import { kindDeLugar, type KindLugar, type TipoVisual } from "@/lib/movimientos-tipos";

// El trayecto de un movimiento (ADR-0345): «Piso → Cliente», «Almacén → Piso», con el ícono de cada lugar y una prenda que
// viaja de un punto al otro UNA vez. Sin destino (un ajuste, un conteo): un solo lugar y lo que pasó ahí.

const ICONOS: Record<KindLugar, string> = {
  piso: "M4 4h16M12 4v2a1.8 1.8 0 1 1-1.8 1.8M12 9.6 5.6 14a1 1 0 0 0 .6 1.8h11.6a1 1 0 0 0 .6-1.8L12 9.6Z",
  almacen: "M4.5 10v8.5h15V10M3.5 6.5h17V10h-17zM10 13.5h4",
  cliente: "M12 4.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM5.5 20a6.5 6.5 0 0 1 13 0",
  fuera: "M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2V8.2ZM4 8.2l8 4.3 8-4.3",
  sede: "M4 20V9l8-5 8 5v11M9.5 20v-6h5v6",
};

function Punto({ lugar, kind }: { lugar: string; kind: KindLugar }) {
  return (
    <span className="mv-punto" data-fuera={kind === "cliente" || kind === "fuera" || kind === "sede" ? "" : undefined} title={lugar}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={ICONOS[kind]} />
      </svg>
      <span>{lugar}</span>
    </span>
  );
}

export function TrayectoMovimiento({
  origen,
  destino,
  tipo,
  motivo,
  solo,
}: {
  origen: string;
  destino: string | null;
  tipo: TipoVisual;
  /** El proceso (`motivo`): decide si el origen es un proveedor («fuera») o una sede. */
  motivo: string | null;
  /** Sin destino: lo que pasó en ese lugar («se corrigió aquí», «se corrigió tras contar»). */
  solo?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useAlVerse(ref);
  return (
    <span ref={ref} className="mv-ruta">
      <Punto lugar={origen} kind={kindDeLugar(origen, "origen", motivo, tipo)} />
      {destino ? (
        <>
          <span className="mv-riel" aria-hidden>
            <i className="mv-relleno" />
            <i className="mv-viaje" />
          </span>
          <Punto lugar={destino} kind={kindDeLugar(destino, "destino", motivo, tipo)} />
        </>
      ) : (
        solo && <span className="mv-solo">{solo}</span>
      )}
    </span>
  );
}
