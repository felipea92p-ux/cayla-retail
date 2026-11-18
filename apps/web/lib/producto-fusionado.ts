import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Cuántos saltos se siguen como mucho (A se fusionó en B, y B después en C): una cadena más larga no existe en la práctica. */
const SALTOS = 5;

/**
 * Un producto fusionado (ADR-0650) ya no tiene tallas propias: todas pasaron al que quedó, con su stock, sus ventas y su
 * historia. Abrir su ficha o su historial por un enlace viejo lleva al que quedó, en la misma página, en vez de mostrar
 * una ficha vacía. Sigue la cadena si el que quedó se fusionó después en otro.
 */
export async function irAlQueQuedoSiSeFusiono(productoId: string, pagina: "editar" | "historial"): Promise<void> {
  const supabase = await createClient();
  let actual = productoId;
  for (let i = 0; i < SALTOS; i++) {
    const { data } = await supabase.from("productos").select("fusionado_en_id").eq("id", actual).maybeSingle();
    if (!data?.fusionado_en_id) break;
    actual = data.fusionado_en_id;
  }
  if (actual !== productoId) redirect(`/productos/${actual}/${pagina}`);
}
