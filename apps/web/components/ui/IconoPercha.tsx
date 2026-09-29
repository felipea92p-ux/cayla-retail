/** La percha de Existencias: el mismo trazo que dibuja el lateral (`IC.existencias`, AppShell), como componente propio
 *  para las tarjetas y el cajón de la prenda (diseño aprobado de Existencias, 2026-09-28). Trazo de línea, sin relleno. */
export function IconoPercha({ className = "h-4 w-4", strokeWidth = 1.5, ...resto }: { className?: string; strokeWidth?: number; "aria-hidden"?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...resto}>
      <path d="M11.3 3a1.3 1.3 0 102 1c0 .5-.3.9-.7 1.1v1.3L4 13.5a1.5 1.5 0 00-.7 1.3V16h17.4v-1.2a1.5 1.5 0 00-.7-1.3l-7.7-6.1V5.4" />
    </svg>
  );
}
