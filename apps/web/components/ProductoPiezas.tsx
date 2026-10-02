"use client";

import Image from "next/image";
import { mezclar, type ColorDisponible } from "@/lib/productos-vista";

/* ====================================================================
   Piezas de Productos que comparten la Grilla y la Tabla (ADR-0077,
   ADR-0254): la percha de una prenda sin foto, los círculos de color y la
   miniatura. Una sola pieza por idea, para que las dos vistas no se
   separen de a poco.
   ==================================================================== */

export function IconoPercha({ color, size = 36 }: { color?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke={color ?? "#1a1a18"}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-45"
      aria-hidden
    >
      <path d="M32 8a5 5 0 1 1 5 5" />
      <path d="M32 13v6" />
      <path d="M8 40 L32 19 L56 40" />
      <path d="M8 40 Q32 52 56 40" />
    </svg>
  );
}

/** Grupo de swatches — vista previa al pasar el mouse o enfocar, se fija con
 *  clic/Enter. `activo` es el nombre del color que se está mostrando ahora
 *  (hover, o si no hay hover, el fijado, o si no hay ninguno, el primero).
 *  `max`: en una fila de la Tabla caben cuatro; el resto se cuenta («+2»). */
export function SwatchesColor({
  colores,
  activo,
  onHover,
  onFijar,
  tamano = "h-4 w-4",
  max,
  onMas,
}: {
  colores: ColorDisponible[];
  activo: string | null;
  onHover: (nombre: string | null) => void;
  onFijar: (nombre: string) => void;
  tamano?: string;
  max?: number;
  /** Si viene, el «+N» es un botón que lo llama (ej. abrir la vista rápida con todos los colores). */
  onMas?: () => void;
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
      className="flex items-center gap-1.5"
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
          className={`${tamano} shrink-0 rounded-full transition-transform duration-150 hover:scale-110 ${
            c.nombre === activo ? "ring-2 ring-tinta ring-offset-1 ring-offset-papel" : "ring-1 ring-tinta/20"
          }`}
          style={{ background: c.hex }}
        />
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
            className="text-[11px] tabular-nums text-tinta/55 underline-offset-2 hover:text-tinta hover:underline"
          >
            +{resto} más
          </button>
        ) : (
          <span className="text-[11px] tabular-nums text-tinta/55">+{resto}</span>
        ))}
    </div>
  );
}

/** La foto chica de la fila: la del color que se está mirando o, si ese color no tiene foto, su tinte con la percha. */
export function MiniaturaPrenda({ color, referencia, className = "h-[50px] w-10" }: { color: ColorDisponible | null; referencia: string; className?: string }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-md transition-colors duration-300 ${className}`}
      style={color?.fotoUrl ? undefined : { background: color ? mezclar(color.hex, 0.22) : "#efe9dd" }}
    >
      {color?.fotoUrl ? (
        <Image src={color.fotoUrl} alt={`${referencia} — ${color.nombre}`} fill sizes="48px" className="object-cover" unoptimized />
      ) : (
        <IconoPercha color={color?.hex} size={20} />
      )}
    </span>
  );
}
