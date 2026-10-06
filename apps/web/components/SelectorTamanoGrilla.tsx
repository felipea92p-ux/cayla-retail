"use client";

import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ROTULO_TAMANO_GRILLA, TAMANOS_GRILLA, type TamanoGrilla } from "@/lib/tamano-grilla";

/**
 * «Tamaño: Grande · Mediano · Pequeño» de la Grilla de Productos (Felipe, 2026-09-29). Es solo el control: quien lo pinta
 * (`ProductosGrilla`) guarda la elección en su cookie y cambia las columnas. Es un modo de vista (las mismas prendas, más
 * grandes o más chicas), así que va con el segmento de modo del sistema, el mismo del «Grilla · Tabla» de la cabecera, para
 * que se lea como un interruptor de vista y no como un filtro (ADR-0358). Con su rótulo: las tres palabras solas no dicen qué se elige.
 */
export function SelectorTamanoGrilla({ valor, onCambiar }: { valor: TamanoGrilla; onCambiar: (t: TamanoGrilla) => void }) {
  return (
    <div className="flex items-center justify-end gap-2.5">
      <span aria-hidden className="label-cayla text-[10.5px] text-tinta/60">
        Tamaño
      </span>
      <SegmentoDeslizante
        forma="modo"
        etiqueta="Tamaño"
        valor={valor}
        onCambio={(t) => onCambiar(t as TamanoGrilla)}
        opciones={TAMANOS_GRILLA.map((t) => ({ clave: t, etiqueta: ROTULO_TAMANO_GRILLA[t] }))}
      />
    </div>
  );
}
