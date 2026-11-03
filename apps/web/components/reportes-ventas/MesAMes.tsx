"use client";

import { useRouter } from "next/navigation";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import type { BarraDeReporte } from "@/lib/reportes-ventas-reglas";

// «Mes a mes» de Ventas ▸ Reportes (maqueta docs/maquetas/reportes-ventas-2026-11/): una barra por mes con ventas; tocar una lleva a ese mes (la
// URL manda, como el selector de arriba) y deja la tienda elegida. Es cliente solo por el toque: las barras son `<BarrasTiempo>` de siempre.
export function MesAMes({ barras, elegida, tiendaId, etiqueta, max }: { barras: BarraDeReporte[]; elegida: string; tiendaId: string | null; etiqueta: string; max: number }) {
  const router = useRouter();
  return (
    <BarrasTiempo
      alto={170}
      cifras="todas"
      max={max}
      etiqueta={etiqueta}
      barras={barras.map((b) => ({ clave: b.clave, valor: b.valor, etiqueta: b.etiqueta, fuerte: b.fuerte, rayada: b.rayada, tip: b.tip, cifra: Math.round(b.valor).toLocaleString("es-PE"), aria: b.tip }))}
      destacada={elegida}
      respuesta={{ elegida, onElegir: (clave) => router.push(`/vender/reportes?m=${clave.replace(/-0(\d)$/, "-$1")}${tiendaId ? `&tienda=${tiendaId}` : ""}`) }}
    />
  );
}
