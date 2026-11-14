"use client";

import { Sparkles } from "lucide-react";
import { Interruptor } from "@/components/ui/campos";
import type { CatalogoIAAlta } from "@/components/alta-producto/useCatalogoIAAlta";

// La opción «Catálogo con IA» de una prenda que TODAVÍA no existe. La usan Nuevo producto y «Crear la prenda que llegó» de Recibir, junto a
// «Fotos y colores» (`FotosYColores`, ADR-0663), que es el único lugar donde se suben sus fotos: la miniatura por fila de la tabla de Nuevo
// producto, su hoja y la línea «Una foto para todos los colores» se fueron el 2026-11-14 (/formidable: dos lugares para lo mismo). Las
// fotos viven en el navegador hasta que la prenda se crea; quien la crea las sube (`subirParDeCatalogo`, `subirFotoProducto`).

/** La opción «Catálogo con IA»: apagada de fábrica y recordada en el aparato (`useInterruptorIA`). */
export function InterruptorCatalogoIA({ catalogo }: { catalogo: CatalogoIAAlta }) {
  return (
    <Interruptor
      activo={catalogo.encendido}
      onActivo={catalogo.cambiarEncendido}
      etiqueta={
        <span className="inline-flex items-center gap-1.5 font-medium text-tinta">
          <Sparkles aria-hidden className="h-3.5 w-3.5" />
          Catálogo con IA
        </span>
      }
    />
  );
}
