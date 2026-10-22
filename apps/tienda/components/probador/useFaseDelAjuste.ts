"use client";

import { useEffect, useRef, useState } from "react";
import { MS_DEL_LISTO, siguienteFase, type FaseDelAjuste } from "@/lib/union-prendas";

/**
 * La fase del ajuste que ve el cliente (B1, ADR-0449 act. 2026-10-22): «espera» mientras la unión mide, y al llegar la medida un «listo» que
 * dura `MS_DEL_LISTO` y se va solo. Sin espera, nunca hay «listo»: lo que no tardó (la medida llegó antes de avisar) no se anuncia.
 */
export function useFaseDelAjuste(ajustando: boolean): FaseDelAjuste {
  const [fase, setFase] = useState<FaseDelAjuste>("quieto");
  const actual = useRef<FaseDelAjuste>("quieto");

  useEffect(() => {
    const sigue = siguienteFase(actual.current, ajustando);
    if (sigue !== actual.current) {
      actual.current = sigue;
      setFase(sigue);
    }
    if (sigue !== "listo") return;
    const t = window.setTimeout(() => {
      actual.current = "quieto";
      setFase("quieto");
    }, MS_DEL_LISTO);
    return () => window.clearTimeout(t);
  }, [ajustando]);

  return fase;
}
