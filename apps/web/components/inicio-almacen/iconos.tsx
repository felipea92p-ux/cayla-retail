import { ICONO_DEL_ACCESO_ALMACEN, TRAZOS_MENU } from "@/lib/menu-iconos";

// Íconos del Inicio de Almacén, a 1.6 como el resto del Inicio. Los que llevan a una pantalla del menú (Stock, Traslados, Recibir,
// Conteo) son los MISMOS trazos que dibuja el lateral (`TRAZOS_MENU`, lib/menu-iconos.ts; 2026-10-13, Felipe: «alinea los otros
// lugares de íconos»); el resto son acciones o piezas de esta pantalla y conservan el suyo.

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
  // El camión que avanza por la ruta de un traslado en curso: el mismo de «Traslados» en el lateral.
  truck: TRAZOS_MENU.traslados,
  recibir: TRAZOS_MENU[ICONO_DEL_ACCESO_ALMACEN.recibir],
  stock: TRAZOS_MENU[ICONO_DEL_ACCESO_ALMACEN.stock],
  traslados: TRAZOS_MENU[ICONO_DEL_ACCESO_ALMACEN.traslados],
  tag: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  rotulo: "M12 3v3M12 14v7M8 21h8M4 6h13l3 4-3 4H4z",
  conteo: TRAZOS_MENU[ICONO_DEL_ACCESO_ALMACEN.conteo],
  // La venda sobre la prenda: «Separé una dañada» (ADR-0564).
  danada: "M5 9l10-4 4 10-10 4zM9 10.5l5-2M10.5 14l5-2",
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
