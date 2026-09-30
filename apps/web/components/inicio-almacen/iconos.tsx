// Íconos del Inicio de Almacén: el mismo trazo de 1.6 que el lateral y el resto del Inicio (los de `AppShell` son privados de
// ese archivo). Un solo lugar para los trazos, y `PrendaSinFoto`, la silueta punteada de «esta prenda no tiene foto».

const TRAZOS = {
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  chevron: "M9 6l6 6-6 6",
  chevDown: "M6 9l6 6 6-6",
  check: "M5 12l4 4 10-10",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
  sliders: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  warn: "M12 3l10 17H2zM12 10v5M12 17.5h.01",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  truck: "M3 7h13v10H3zM16 10h3l2 3v4h-5M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M18 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3",
  stock: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  traslados: "M5 12h14M13 6l6 6-6 6",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  conteo: "M9 4h6v3H9zM6 5h3M15 5h3v16H6V5M9 13l2 2 4-4",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16",
} as const;

export type ClaveIco = keyof typeof TRAZOS;

export function Ico({ clave, className = "" }: { clave: ClaveIco; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`ia-ic ${className}`} aria-hidden>
      <path d={TRAZOS[clave]} />
    </svg>
  );
}

/** La silueta (una blusa) punteada que ocupa el lugar de una foto que todavía no existe. */
export function PrendaSinFoto({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 120" className={`ia-g ${className}`} aria-hidden>
      <path d="M33 12 L44 8 Q50 19 56 8 L67 12 L90 34 L80 48 L70 41 L70 106 Q50 112 30 106 L30 41 L20 48 L10 34 Z" />
    </svg>
  );
}
