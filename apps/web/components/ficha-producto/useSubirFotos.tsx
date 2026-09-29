"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { objecionFotoElegida, subirFotoProducto } from "@/lib/producto-fotos";
import { comoArchivo } from "@/lib/preparar-foto";
import { RevisarFotosModal, type FotoElegida } from "@/components/RevisarFotosModal";

// Elegir → revisar → subir, para la ficha de una prenda que YA existe (ADR-0279; antes vivía dentro de `FotosProducto`).
//
// A diferencia del alta (`FotosAlta`, que guarda el archivo en el navegador y lo sube después de crear), aquí la foto sube
// al almacén EN CUANTO se elige: lo que se guarda con «Revisar y guardar» es la lista (orden, principal y color), no los
// bytes. Una foto subida y descartada queda como archivo sin usar (igual que siempre; no hay nada que la borre).
//
// Cada archivo pasa antes por la revisión del ADR-0228 (`RevisarFotosModal`): sale en 1200×1500 sobre blanco, sin fondo o
// con su fondo según se elija, y se guarda también su original. Quien use el hook dibuja `revision` donde quiera; conviene
// FUERA de una hoja que se pueda cerrar mientras se revisa.

export type FotoSubida = { url: string; colorCodigo: string | null };

export function useSubirFotos({ onSubidas }: { onSubidas: (nuevas: FotoSubida[]) => void }): {
  /** Valida los archivos y abre la revisión; las fotos que salgan de ahí nacen con `colorCodigo`. */
  elegir: (archivos: File[], colorCodigo: string | null) => void;
  /** Revisando o subiendo: los selectores de archivo se apagan para no abrir dos revisiones a la vez. */
  ocupado: boolean;
  revision: ReactNode;
} {
  const [porRevisar, setPorRevisar] = useState<{ archivos: File[]; colorCodigo: string | null } | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  function elegir(archivos: File[], colorCodigo: string | null) {
    const buenas: File[] = [];
    const malas: string[] = [];
    for (const a of archivos) {
      const objecion = objecionFotoElegida(a);
      if (objecion) malas.push(`${a.name}: ${objecion}`);
      else buenas.push(a);
    }
    if (malas.length) avisar.error(malas.length === 1 ? "Una foto no se puede usar" : `${malas.length} fotos no se pueden usar`, { detalle: malas.join(" · ") });
    if (buenas.length) setPorRevisar({ archivos: buenas, colorCodigo });
  }

  async function subir(elegidas: FotoElegida[], cerrar: () => void) {
    if (!porRevisar) return;
    setSubiendo(true);
    const supabase = createClient();
    const nuevas: FotoSubida[] = [];
    const fallidos: string[] = [];
    for (const e of elegidas) {
      const nombre = porRevisar.archivos[Number(e.clave)]?.name ?? "foto";
      const r = await subirFotoProducto(supabase, comoArchivo(e.foto, "foto.jpg"), e.original);
      if ("error" in r) fallidos.push(`${nombre}: ${r.error}`);
      else nuevas.push({ url: r.url, colorCodigo: porRevisar.colorCodigo });
    }
    setSubiendo(false);
    cerrar();
    if (fallidos.length) avisar.error(fallidos.length === 1 ? "Una foto no subió" : `${fallidos.length} fotos no subieron`, { detalle: fallidos.join(" · ") });
    if (nuevas.length) onSubidas(nuevas);
  }

  const revision = porRevisar ? (
    <RevisarFotosModal
      fuentes={porRevisar.archivos.map((a, i) => ({ clave: String(i), etiqueta: a.name, blob: a }))}
      guardando={subiendo}
      onListo={(elegidas, cerrar) => void subir(elegidas, cerrar)}
      onClose={() => setPorRevisar(null)}
    />
  ) : null;

  return { elegir, ocupado: subiendo || porRevisar !== null, revision };
}
