// El aparato (ADR-0162): una pantalla con su pie. Marca lo que NO es una persona —una terminal de tienda— en el pie del
// menú lateral y en Colaboradores ▸ Terminales, para que nunca se lea como alguien del equipo. Mismo trazo que el spike
// aprobado (`docs/maquetas/responsable-y-roles-spike-2026-09/`, pantallas 5 y 6).
export function IconoAparato({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
