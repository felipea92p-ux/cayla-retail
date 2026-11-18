"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerExcepcionesDeSede, leerPreciosDeSede, type ExcepcionDeSede, type FilaExcepcionDeSede, type PrecioDeSede } from "@/lib/precio-sede-reglas";

/**
 * Los precios propios de una prenda, uno por tienda (`fn_precios_sede_producto`). Los lee la ficha UNA vez y los comparten el bloque
 * «Precio por tienda» y la hoja «Revisa y guarda» (que pregunta por esas tiendas al cambiar el precio de la prenda, Felipe 2026-10-10).
 * `null` mientras no se leyó. Si la función no está en la base (web publicada antes que el SQL), lista vacía: la ficha sigue sin el
 * bloque. `recargar` lo vuelve a leer (después de poner o quitar uno, o de guardar la ficha).
 * Además, las EXCEPCIONES por combinación (`fn_precios_sede_variantes_producto`, 2026-10-28): una talla o un color con otro precio en una tienda, que gana al
 * de la prenda ahí. `null` mientras no se leyeron; si la función no está en la base, lista vacía.
 */
export function usePreciosDeTienda(productoId: string | null | undefined) {
  const [precios, setPrecios] = useState<PrecioDeSede[] | null>(null);
  const [excepciones, setExcepciones] = useState<ExcepcionDeSede[] | null>(null);
  const [lectura, setLectura] = useState(0);
  useEffect(() => {
    if (!productoId) return;
    let vivo = true;
    void createClient()
      .rpc("fn_precios_sede_producto", { p_producto_id: productoId })
      .then(({ data, error }) => {
        if (vivo) setPrecios(error ? [] : leerPreciosDeSede(data));
      });
    void createClient()
      .rpc("fn_precios_sede_variantes_producto" as never, { p_producto_id: productoId } as never)
      .then(({ data, error }) => {
        if (vivo) setExcepciones(error ? [] : leerExcepcionesDeSede(data as unknown as FilaExcepcionDeSede[]));
      });
    return () => {
      vivo = false;
    };
  }, [productoId, lectura]);
  const recargar = useCallback(() => setLectura((n) => n + 1), []);
  return { precios, excepciones, recargar };
}
