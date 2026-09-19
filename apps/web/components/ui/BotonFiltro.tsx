import type { ReactNode } from "react";

/**
 * Chip de filtro con contador ("Rotación 4") — el de Atributos → Etiquetas y
 * Tallas. Vive acá para que las pestañas de Atributos filtren con el mismo
 * gesto: si uno cambia de tamaño o de estado activo, cambian todos juntos.
 * `punto` es la clase de color del puntito del grupo (ej. "bg-verde").
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
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`label-cayla inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10.5px] transition-colors ${
        activo ? "border-tinta bg-tinta text-crema" : "border-tinta/15 text-tinta/65 hover:border-tinta/30 hover:text-tinta"
      }`}
    >
      {punto && <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${punto}`} />}
      {children}
      <span className={`font-normal tabular-nums ${activo ? "text-crema/60" : "text-tinta/40"}`}>{cuenta}</span>
    </button>
  );
}
