"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Grid2x2, Grid3x3, Square } from "lucide-react";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ROTULO_TAMANO_GRILLA, TAMANOS_GRILLA, guardarTamanoGrilla, type TamanoGrilla } from "@/lib/tamano-grilla";

// El tamaño elegido en ESTA pestaña. El control vive en la barra de resultados (junto al conteo) y las tarjetas en la grilla:
// son dos componentes hermanos, así que lo comparten por aquí y no por estado de uno de ellos (Felipe, 2026-10-09: en el celular
// «Tamaño» ocupaba una fila entera entre el orden y las prendas). Antes de elegir nada vale lo que trajo la cookie (`inicial`).
let elegido: TamanoGrilla | null = null;
const oyentes = new Set<() => void>();
function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** El tamaño de las tarjetas y cómo cambiarlo; `inicial` es el de la cookie, leído en el servidor (`lib/tamano-grilla.ts`). */
export function useTamanoGrilla(inicial: TamanoGrilla) {
  const tamano = useSyncExternalStore(suscribir, () => elegido ?? inicial, () => inicial);
  const elegir = useCallback((t: TamanoGrilla) => {
    elegido = t;
    guardarTamanoGrilla(t);
    for (const o of oyentes) o();
  }, []);
  return [tamano, elegir] as const;
}

/** En el celular las columnas son fijas (1 · 2 · 3, `CLASES_GRILLA`): el dibujo dice cuántas por fila y la palabra queda para el
 *  lector de pantalla. Desde `sm` las columnas dependen del ancho, así que ahí va la palabra. */
const ICONO_TAMANO: Record<TamanoGrilla, typeof Square> = { grande: Square, mediano: Grid2x2, pequeno: Grid3x3 };

/**
 * «Tamaño: Grande · Mediano · Pequeño» de la Grilla de Productos (Felipe, 2026-09-29). Es un modo de vista (las mismas prendas,
 * más grandes o más chicas), así que va con el segmento de modo del sistema, el mismo del «Grilla · Tabla» de la cabecera, para
 * que se lea como un interruptor de vista y no como un filtro (ADR-0358). Con su rótulo desde `sm`: las tres palabras solas no
 * dicen qué se elige; en el celular, los tres dibujos de columnas ya lo dicen.
 */
export function SelectorTamanoGrilla({ inicial }: { inicial: TamanoGrilla }) {
  const [valor, elegir] = useTamanoGrilla(inicial);
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="label-cayla hidden text-[10.5px] text-tinta/60 sm:inline">
        Tamaño
      </span>
      <SegmentoDeslizante
        forma="modo"
        etiqueta="Tamaño de las tarjetas"
        valor={valor}
        onCambio={(t) => elegir(t as TamanoGrilla)}
        opciones={TAMANOS_GRILLA.map((t) => {
          const Icono = ICONO_TAMANO[t];
          return {
            clave: t,
            icono: <Icono aria-hidden strokeWidth={1.75} className="sm:hidden" />,
            etiqueta: <span className="max-sm:sr-only">{ROTULO_TAMANO_GRILLA[t]}</span>,
          };
        })}
      />
    </div>
  );
}
