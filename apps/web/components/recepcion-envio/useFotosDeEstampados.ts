"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fotoDeVariante, type FotoCruda } from "@/lib/producto-fotos-reglas";

/**
 * La foto de cada estampado de una prenda, para reconocerlo al contar (ADR-0634). Lo que Recibir ya trae es la foto del modelo, una sola.
 * Solo pregunta si la prenda tiene estampados; si la lectura falla, queda el punto con su nombre y se recibe igual.
 */
export function useFotosDeEstampados(productoId: string | undefined, codigos: readonly string[]): ReadonlyMap<string, string> {
  const [fotos, setFotos] = useState<ReadonlyMap<string, string>>(() => new Map());
  const llave = [...codigos].sort().join(",");

  useEffect(() => {
    if (!productoId || !llave) return;
    let vigente = true;
    const lista = llave.split(",");
    void (async () => {
      const { data } = await createClient().from("producto_fotos").select("url, orden, es_principal, color_codigo").eq("producto_id", productoId).in("color_codigo", lista);
      if (!vigente || !data) return;
      const crudas: FotoCruda[] = data;
      setFotos(new Map(lista.flatMap((c) => {
        const url = fotoDeVariante(crudas, c);
        return url ? [[c, url] as const] : [];
      })));
    })().catch(() => {});
    return () => {
      vigente = false;
    };
  }, [productoId, llave]);

  return fotos;
}
