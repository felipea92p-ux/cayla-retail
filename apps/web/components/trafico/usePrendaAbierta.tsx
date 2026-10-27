"use client";

import { useRef, useState } from "react";
import type { PrendaTrafico } from "@/lib/trafico-reglas";
import { CajonPrendaTrafico } from "./CajonPrendaTrafico";

/**
 * El cajón de una prenda de Tráfico, igual desde la vitrina y desde la tabla: cuál está abierta, ↑ ↓ para pasar a la de al lado (en el
 * orden de la lista) y, al cerrar, el foco de vuelta al control de la última prenda que se miró (`data-prenda` dentro de `contenedor`).
 * Radix lo deja en el `body` cuando la hoja se desmonta sola tras su salida: se espera a que termine y, si nadie tomó el foco, se pone.
 */
export function usePrendaAbierta({
  prendas,
  vieron,
  base,
  periodo,
  antes,
}: {
  prendas: PrendaTrafico[];
  vieron: number;
  base: number[];
  periodo: string;
  antes: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const p = abierta !== null ? prendas[abierta] : undefined;

  const cerrar = () => {
    const id = p?.id;
    setAbierta(null);
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      contenedor.current?.querySelector<HTMLElement>(`[data-prenda="${id}"]`)?.focus();
    }, 50);
  };

  const cajon =
    p && abierta !== null ? (
      <CajonPrendaTrafico
        p={p}
        puesto={abierta + 1}
        total={prendas.length}
        vieron={vieron}
        base={base}
        periodo={periodo}
        antes={antes}
        onCerrar={cerrar}
        onNavegar={(d) => setAbierta((i) => (i === null ? i : Math.min(prendas.length - 1, Math.max(0, i + d))))}
      />
    ) : null;

  return { contenedor, abrir: setAbierta, cajon };
}
