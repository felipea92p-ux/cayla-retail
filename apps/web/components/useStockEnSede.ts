"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerTodas } from "@/lib/resultado";
import { sumarEntradas } from "@/lib/etiqueta-precio-reglas";

/**
 * Stock por prenda (variante) EN LA SEDE de quien mira, por modelo. Promete: `de(id)` devuelve lo último leído de ese
 * modelo (`undefined` si nunca se pidió, `"error"` si la lectura falló); `leer(ids)` lo lee FRESCO, lo guarda y lo
 * devuelve, o `null` si la base no respondió. Asume que `stock_select` deja leer la sede propia (la misma lectura de
 * `lib/etiquetas-precio.ts`, que es la que decide cuántas etiquetas salen).
 *
 * Se lee al abrir la ficha y otra vez al pedir imprimir: el número de la ficha puede haber envejecido (se vendió, llegó
 * un traslado), y un «no hay stock» viejo no debe impedir imprimir lo que acaba de entrar. Es una lectura GET: no abre
 * el loader global (`espera-reglas.ts` solo cuenta los GET de Supabase como lectura).
 */
export function useStockEnSede(ubicacionId: string) {
  const [porModelo, setPorModelo] = useState<ReadonlyMap<string, ReadonlyMap<string, number> | "error">>(new Map());
  const cliente = useRef<ReturnType<typeof createClient> | null>(null);

  const leer = useCallback(
    async (productoIds: string[]): Promise<Map<string, number> | null> => {
      if (productoIds.length === 0) return new Map();
      cliente.current ??= createClient();
      const supabase = cliente.current;
      const { data, error } = await leerTodas(
        (desde, hasta) =>
          supabase
            .from("stock")
            .select("variante_id, sububicacion_id, cantidad, variante:variantes!inner ( producto_id )")
            .eq("ubicacion_id", ubicacionId)
            .in("variante.producto_id", productoIds)
            .gt("cantidad", 0)
            .order("variante_id")
            .order("sububicacion_id", { nullsFirst: true })
            .range(desde, hasta),
        { enParalelo: 1 },
      );
      if (error || !data) {
        setPorModelo((previo) => {
          const n = new Map(previo);
          for (const id of productoIds) if (!n.has(id)) n.set(id, "error");
          return n;
        });
        return null;
      }
      // Piso y almacén suman: la etiqueta cuelga de la prenda esté donde esté dentro de la tienda.
      const total = sumarEntradas(data);
      setPorModelo((previo) => {
        const n = new Map(previo);
        const vacios = new Map(productoIds.map((id) => [id, new Map<string, number>()]));
        for (const f of data) vacios.get(f.variante.producto_id)?.set(f.variante_id, total.get(f.variante_id) ?? 0);
        for (const [id, m] of vacios) n.set(id, m);
        return n;
      });
      return total;
    },
    [ubicacionId],
  );

  const de = useCallback((productoId: string) => porModelo.get(productoId), [porModelo]);
  return { de, leer };
}
