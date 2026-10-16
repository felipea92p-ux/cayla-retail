import type { ReactNode } from "react";
import type { Forma } from "@/lib/catalogo";

// La prenda sin foto (maqueta v4, «dibujo de respaldo»): la silueta de su categoría en el color de la prenda, sobre el estudio de la
// foto. El color es un DATO de la prenda (no del tema): va en línea y no cambia con el modo oscuro. La percha es para lo que no es ropa.
const FORMAS: Record<Forma, ReactNode> = {
  blusa: (
    <>
      <path d="M44 20 Q60 30 76 20 L90 25 Q103 31 106 45 Q108 57 99 61 L92 57 L92 114 Q60 120 28 114 L28 57 L21 61 Q12 57 14 45 Q17 31 30 25 Z" />
      <path className="pz-linea" d="M44 20 Q60 36 76 20" />
    </>
  ),
  vestido: (
    <>
      <path d="M47 14 L52 30 Q60 35 68 30 L73 14 L83 18 L82 46 Q80 55 76 58 L99 134 Q60 144 21 134 L44 58 Q40 55 38 46 L37 18 Z" />
      <path className="pz-linea" d="M44 58 Q60 62 76 58" />
    </>
  ),
  pantalon: (
    <>
      <path d="M35 14 L85 14 L88 32 L101 138 L69 140 L60 56 L51 140 L19 138 L32 32 Z" />
      <path className="pz-linea" d="M34 24 L86 24" />
    </>
  ),
  casaca: (
    <>
      <path d="M41 14 Q60 24 79 14 L97 22 Q106 27 108 40 L112 110 L98 112 L94 62 L94 126 L26 126 L26 62 L22 112 L8 110 L12 40 Q14 27 23 22 Z" />
      <path className="pz-linea" d="M60 22 L60 126" />
    </>
  ),
  polo: (
    <>
      <path d="M45 16 Q60 26 75 16 L100 26 L113 50 L97 58 L92 50 L92 126 L28 126 L28 50 L23 58 L7 50 L20 26 Z" />
      <path className="pz-linea" d="M45 16 Q60 30 75 16" />
    </>
  ),
  falda: (
    <>
      <path d="M40 30 L80 30 L82 42 L104 130 Q60 140 16 130 L38 42 Z" />
      <path className="pz-linea" d="M38 42 L82 42" />
    </>
  ),
  bolso: (
    <>
      <path className="pz-linea" d="M36 54 Q36 24 60 24 Q84 24 84 54" />
      <path d="M18 54 L102 54 L110 128 Q60 136 10 128 Z" />
    </>
  ),
  percha: (
    <>
      <path className="pz-linea" d="M52 34 a8 8 0 1 1 8 8 v10" />
      <path d="M60 52 L106 92 Q108 98 102 98 H18 Q12 98 14 92 Z" />
    </>
  ),
};

export function DibujoPrenda({ forma, color }: { forma: Forma; color: string | null }) {
  return (
    <svg className="pz" viewBox="0 0 120 150" aria-hidden="true">
      <ellipse className="pz-suelo" cx="60" cy="143" rx="42" ry="5" />
      <g className="pz-cuerpo" data-color-dato style={color ? { fill: color } : undefined}>
        {FORMAS[forma]}
      </g>
    </svg>
  );
}
