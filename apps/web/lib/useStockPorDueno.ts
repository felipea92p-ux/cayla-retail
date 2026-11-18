"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UnidadesDeDueno } from "@/lib/dueno-reglas";

// De quién son las unidades de cada prenda en una sede con dos empresas (`fn_stock_por_dueno`, ADR-0542), leído desde el navegador para las
// pantallas que no reciben el reparto de su página (Apartados). Solo trae las prendas con unidades de alguien que no es la casa; en una sede con
// una sola empresa devuelve vacío. `null` = todavía no se sabe o la base no respondió: no se pregunta y la base decide.
export function useStockPorDueno(sedeId: string | null | undefined): Record<string, UnidadesDeDueno[]> | null {
  const [reparto, setReparto] = useState<Record<string, UnidadesDeDueno[]> | null>(null);
  useEffect(() => {
    if (!sedeId) return;
    let vivo = true;
    void Promise.resolve(createClient().rpc("fn_stock_por_dueno", { p_ubicacion_id: sedeId })).then(
      ({ data, error }) => {
        if (!vivo || error || !data) return;
        const por: Record<string, UnidadesDeDueno[]> = {};
        for (const f of data) {
          const nombre = f.clave === "cayla" ? "CAYLA" : f.clave.toUpperCase();
          (por[f.variante_id] ??= []).push({ empresaId: f.empresa_id, clave: f.clave, nombre, cantidad: f.cantidad, cantidadApartada: f.cantidad_apartada });
        }
        setReparto(por);
      },
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [sedeId]);
  return sedeId ? reparto : null;
}
