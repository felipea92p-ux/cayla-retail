import Link from "next/link";
import type { ReactNode } from "react";
import { FunnelX, X } from "lucide-react";

/* ====================================================================
   Los filtros puestos y «Limpiar todo» (ADR-0358, ronda 11 de /unificar: Felipe eligió la P2 tocándola el 2026-10-14).

   · <FiltroPuesto>: cada filtro que la persona puso, en la fila de debajo del buscador. Es la píldora de los vacíos (ronda 5, `vacio-filtro`):
     tinta, con su ✕, pasa a rojo profundo al apuntarla y se encoge al presionarla. Un toque la quita.
   · <BotonLimpiar>: limpiar todos los filtros de una vez, al final de esa fila. Una píldora más, punteada y con el embudo tachado (como
     «+ Atajo» de Historial): se ve como parte de la fila. El verbo es siempre «Limpiar» + qué: «Limpiar todo» si también borra la
     búsqueda, «Limpiar filtros» si no; nunca «Quitar filtros».
   Lo demás que limpia va según dónde vive: en la hoja de filtros del celular, «Limpiar» es el botón secundario (con `pie-acciones`, como
   «Cancelar»); en el calendario de una fecha, en «Pagar juntos» o dentro de una frase, el enlace del sistema (`btn-enlace`).
   ==================================================================== */
export function FiltroPuesto({ children, onQuitar, etiqueta, guia }: { children: ReactNode; onQuitar: () => void; etiqueta: string; guia?: string }) {
  return (
    <button type="button" onClick={onQuitar} className="vacio-filtro anim-entrada" aria-label={etiqueta} data-guia={guia}>
      {children}
      <X aria-hidden />
    </button>
  );
}

const CLASE_LIMPIAR = "pildora-cayla pildora-limpiar";

export function BotonLimpiar(
  props: { children: ReactNode; className?: string; guia?: string } & ({ onClick: () => void; href?: never } | { href: string; onClick?: never }),
) {
  const contenido = (
    <>
      <FunnelX aria-hidden />
      {props.children}
    </>
  );
  if (props.href !== undefined)
    return (
      <Link href={props.href} className={`${CLASE_LIMPIAR} ${props.className ?? ""}`} data-guia={props.guia}>
        {contenido}
      </Link>
    );
  return (
    <button type="button" onClick={props.onClick} className={`${CLASE_LIMPIAR} ${props.className ?? ""}`} data-guia={props.guia}>
      {contenido}
    </button>
  );
}
