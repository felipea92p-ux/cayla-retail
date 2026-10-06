import type { ReactNode } from "react";

/**
 * Chip de filtro con contador ("Rotación 4") — el de Atributos → Etiquetas y
 * Tallas. Vive acá para que las pestañas de Atributos filtren con el mismo
 * gesto: si uno cambia de tamaño o de estado activo, cambian todos juntos.
 * `punto` es la clase de color del puntito del grupo (ej. "bg-verde").
 *
 * Desde el 2026-10-06 es la píldora de filtro del sistema (`pildora-cayla`, ADR-0354 «Pestañas y segmentos»): un filtro de un
 * valor se ve igual en todo el ERP. Se fueron las MAYÚSCULAS de 10,5 px y el conteo en tinta/40; el conteo va del color del texto.
 */
export function BotonFiltro({
  activo,
  onClick,
  cuenta,
  punto,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  cuenta: number;
  punto?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick} className="pildora-cayla">
      {punto && <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${punto}`} />}
      {children}
      <span className="pildora-cayla__n">{cuenta}</span>
    </button>
  );
}
