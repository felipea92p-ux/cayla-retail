import { Isotipo } from "../Isotipo";

/** El ícono de CAYLA como queda en la pantalla de inicio: el colibrí rojo sobre el crema del archivo (`public/cayla-app-*.png`). */
export function IconoApp({ className = "" }: { className?: string }) {
  return (
    <span className={`t-inst-icono ${className}`} aria-hidden="true">
      <Isotipo />
    </span>
  );
}
