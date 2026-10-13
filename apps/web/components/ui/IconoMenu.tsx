import type { ClaveIcono } from "@/lib/menu";
import { TRAZOS_MENU } from "@/lib/menu-iconos";

/** El ícono de una pantalla del menú: el MISMO trazo que dibuja el lateral (`lib/menu-iconos.ts`). Lo usa Roles y accesos para
 *  dibujar cada módulo igual que el menú (ADR-0358, una función, una pieza). Trazo de línea, sin relleno; hereda el color del
 *  texto (`currentColor`), así que sigue al tema claro y al oscuro sin tocar nada. Solo decora: el nombre va siempre al lado. */
export function IconoMenu({ clave, className = "h-5 w-5", strokeWidth = 1.5 }: { clave: ClaveIcono; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={TRAZOS_MENU[clave]} />
    </svg>
  );
}
