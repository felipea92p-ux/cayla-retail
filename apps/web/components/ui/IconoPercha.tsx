import { TRAZOS_MENU } from "@/lib/menu-iconos";

/** La percha de Existencias: el mismo trazo que dibuja el lateral (`TRAZOS_MENU.existencias`), como componente propio
 *  para las tarjetas y el cajón de la prenda (diseño aprobado de Existencias, 2026-09-28). Trazo de línea, sin relleno. */
export function IconoPercha({ className = "h-4 w-4", strokeWidth = 1.5, ...resto }: { className?: string; strokeWidth?: number; "aria-hidden"?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...resto}>
      <path d={TRAZOS_MENU.existencias} />
    </svg>
  );
}
