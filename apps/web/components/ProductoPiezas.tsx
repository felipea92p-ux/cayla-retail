"use client";

import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";
import type { ColorDisponible } from "@/lib/productos-vista";
import { fondoDelPunto } from "@/lib/color-combinado";

/* ====================================================================
   Piezas de Productos que comparten la Grilla y la Tabla (ADR-0077,
   ADR-0254): los círculos de color y la miniatura (sin foto: la categoría
   sobre el color, ADR-0333). Una sola pieza por idea, para que las dos vistas no se
   separen de a poco.
   ==================================================================== */

/** Grupo de swatches — vista previa al pasar el mouse o enfocar, se fija con
 *  clic/Enter. `activo` es el nombre del color que se está mostrando ahora
 *  (hover, o si no hay hover, el fijado, o si no hay ninguno, el primero).
 *  `max`: en una fila de la Tabla caben cuatro; el resto se cuenta («+2»).
 *  `forma="punto"` (la tarjeta «A · Catálogo de moda» de la Grilla, Felipe 2026-11-02): el punto de color de Vender (`.vg-punto`),
 *  con el punto de 12 px y lo que se toca de 24 (los tamaños los pone `.prod-info` en vidrio/pantalla.css); el anillo dice cuál se ve. */
export function SwatchesColor({
  colores,
  activo,
  onHover,
  onFijar,
  tamano = "h-4 w-4",
  max,
  onMas,
  forma = "anillo",
}: {
  colores: ColorDisponible[];
  activo: string | null;
  onHover: (nombre: string | null) => void;
  onFijar: (nombre: string) => void;
  tamano?: string;
  max?: number;
  /** Si viene, el «+N» es un botón que lo llama (ej. abrir la vista rápida con todos los colores). */
  onMas?: () => void;
  forma?: "anillo" | "punto";
}) {
  if (colores.length === 0) return null;
  const visibles = max ? colores.slice(0, max) : colores;
  const resto = colores.length - visibles.length;
  return (
    // onMouseLeave/onBlur van en el GRUPO, no en cada botón: `mouseleave` no
    // burbujea entre hermanos, así que mover el mouse de un swatch al
    // vecino nunca pasa por un instante "sin hover" — antes, con el
    // handler en cada botón, ese instante hacía caer `activo` al primer
    // color de la lista (el fallback de `nombreActivo`) y el anillo
    // "saltaba" ahí antes de asentarse en el nuevo, un parpadeo que se
    // sentía trabado. Mismo motivo para el blur por teclado: `relatedTarget`
    // decide si el foco se fue del grupo entero, no solo del botón actual.
    <div
      role="radiogroup"
      aria-label="Color"
      className={`flex shrink-0 items-center ${forma === "punto" ? "-ml-1.5 gap-px" : "gap-1.5"}`}
      onMouseLeave={() => onHover(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onHover(null);
      }}
    >
      {visibles.map((c) => (
        <button
          key={c.nombre}
          type="button"
          role="radio"
          aria-checked={c.nombre === activo}
          aria-label={c.nombre}
          title={c.nombre}
          onMouseEnter={() => onHover(c.nombre)}
          onFocus={() => onHover(c.nombre)}
          onClick={(e) => {
            e.stopPropagation();
            onFijar(c.nombre);
          }}
          className={
            forma === "punto"
              ? "vg-punto"
              : `${tamano} shrink-0 rounded-full transition-transform duration-150 hover:scale-110 ${
                  c.nombre === activo ? "ring-2 ring-tinta ring-offset-1 ring-offset-papel" : "ring-1 ring-tinta/20"
                }`
          }
          style={forma === "punto" ? undefined : { background: fondoDelPunto(c.hex, c.tonos) }}
        >
          {forma === "punto" && <i data-color-dato style={{ background: fondoDelPunto(c.hex, c.tonos) }} />}
        </button>
      ))}
      {resto > 0 &&
        (onMas ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMas();
            }}
            title="Ver todos los colores"
            className="text-sm tabular-nums text-tinta/55 underline-offset-2 hover:text-tinta hover:underline"
          >
            +{resto}
          </button>
        ) : (
          <span className="text-sm tabular-nums text-tinta/55">+{resto}</span>
        ))}
    </div>
  );
}

/** La foto chica de la fila: la del color que se está mirando o, si ese color no tiene foto, el ícono de su categoría sobre ese
 *  color (`MosaicoPrenda`, ADR-0333; antes un tinte con una percha). */
export function MiniaturaPrenda({ color, referencia, className = "h-[50px] w-10", prefijo, familia, categoria }: { color: ColorDisponible | null; referencia: string; className?: string } & CategoriaDePrenda) {
  const sinFoto = <MosaicoPrenda forma="relleno" colorHex={color?.hex} prefijo={prefijo} familia={familia} categoria={categoria} className="h-full w-full !rounded-none transition-colors duration-300" />;
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-md ${className}`}>
      {color?.fotoUrl ? <ImagenDePrenda src={color.fotoUrl} alt={`${referencia} — ${color.nombre}`} fill sizes="48px" className="object-cover" fondo={color.hex} fallback={sinFoto} /> : sinFoto}
    </span>
  );
}
