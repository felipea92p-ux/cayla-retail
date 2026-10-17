"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { objecionFotoProducto, subirFotoProducto } from "@/lib/producto-fotos";

// Elegir → subir, para la ficha de una prenda que YA existe (ADR-0279; antes vivía dentro de `FotosProducto`).
//
// A diferencia del alta (`FotosAlta`, que guarda el archivo en el navegador y lo sube después de crear), aquí la foto sube
// al almacén EN CUANTO se elige: lo que se guarda con «Revisar y guardar» es la lista (orden, principal y color), no los
// bytes. Una foto subida y descartada queda como archivo sin usar (igual que siempre; no hay nada que la borre).
//
// Desde el ADR-0442 (Felipe, 2026-10-17) no hay revisión previa: la foto sube TAL CUAL la entrega la IA del equipo, sin quitar el fondo ni
// corregir la luz (antes, `RevisarFotosModal`). Un PNG con fondo transparente además entra al armador de looks (`recortarAlSubir`).

export type FotoSubida = { url: string; colorCodigo: string | null };

export function useSubirFotos({ onSubidas }: { onSubidas: (nuevas: FotoSubida[]) => void }): {
  /** Valida los archivos y los sube tal cual; las fotos nacen con `colorCodigo`. */
  elegir: (archivos: File[], colorCodigo: string | null) => void;
  /** Subiendo: los selectores de archivo se apagan para no mezclar dos tandas. */
  ocupado: boolean;
} {
  const [subiendo, setSubiendo] = useState(false);

  async function subir(archivos: File[], colorCodigo: string | null) {
    setSubiendo(true);
    const supabase = createClient();
    const nuevas: FotoSubida[] = [];
    const fallidos: string[] = [];
    for (const archivo of archivos) {
      const r = await subirFotoProducto(supabase, archivo);
      if ("error" in r) fallidos.push(`${archivo.name}: ${r.error}`);
      else nuevas.push({ url: r.url, colorCodigo });
    }
    setSubiendo(false);
    if (fallidos.length) avisar.error(fallidos.length === 1 ? "Una foto no subió" : `${fallidos.length} fotos no subieron`, { detalle: fallidos.join(" · ") });
    if (nuevas.length) onSubidas(nuevas);
  }

  function elegir(archivos: File[], colorCodigo: string | null) {
    const buenas: File[] = [];
    const malas: string[] = [];
    for (const a of archivos) {
      const objecion = objecionFotoProducto(a);
      if (objecion) malas.push(`${a.name}: ${objecion}`);
      else buenas.push(a);
    }
    if (malas.length) avisar.error(malas.length === 1 ? "Una foto no se puede usar" : `${malas.length} fotos no se pueden usar`, { detalle: malas.join(" · ") });
    if (buenas.length) void subir(buenas, colorCodigo);
  }

  return { elegir, ocupado: subiendo };
}
