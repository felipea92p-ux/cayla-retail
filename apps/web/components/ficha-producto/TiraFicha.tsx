"use client";

import type { ReactNode } from "react";
import { EtiquetaAhora, MarcaCampo } from "@/components/alta-producto/guia";
import type { EstadoCampo } from "@/lib/alta-producto-guia";

// Aquí vivía la tira «Para completar esta ficha» de Editar producto (ADR-0284 actualización c). Desde la maqueta B (2026-10-02) lo
// que le falta a la prenda lo dice el panel del taller y la tira ya no se dibujaba en ninguna pantalla: se borró el 2026-10-14
// (ADR-0406). Queda `ConMarca`, que usan todas las guías de foco.

/** El título de un campo con su marca a la izquierda (y «Sigue aquí» si es el que sigue). `null` = el campo ya venía completo: sin marca.
 *  `sinAhora`: sin «Sigue aquí», para un título en una columna angosta donde se montaba sobre el texto (Qué pasó, en Ajustar stock). */
export function ConMarca({ estado, sinAhora = false, children }: { estado: EstadoCampo | null; sinAhora?: boolean; children: ReactNode }) {
  if (!estado) return <>{children}</>;
  // La marca y el texto van en una fila que NO se envuelve: una etiqueta larga («Acepta que la contactemos por WhatsApp») se parte
  // dentro de su propio texto, no deja la marca sola en una línea de arriba.
  return (
    <span className="inline-flex items-start gap-x-1.5 align-middle">
      <span className="mt-px shrink-0">
        <MarcaCampo estado={estado} />
      </span>
      <span className="min-w-0">{children}</span>
      {estado === "ahora" && !sinAhora && (
        <span className="shrink-0 self-center">
          <EtiquetaAhora />
        </span>
      )}
    </span>
  );
}
