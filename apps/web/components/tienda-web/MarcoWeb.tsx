import type { CSSProperties, ReactNode } from "react";
import { Lock } from "lucide-react";
import { DIRECCION_TIENDA_ONLINE } from "@/lib/club-qr-reglas";

/** «tienda.cayla.pe»: la dirección que ve el cliente, sin el «https://». */
export const DOMINIO_TIENDA = DIRECCION_TIENDA_ONLINE.replace(/^https?:\/\//, "");

/**
 * La VENTANA de Tienda web (ADR-0430): un navegador con sus tres puntos y la dirección de la tienda, para lo que se ve tal como lo ve el
 * cliente en internet (la vitrina del Resumen, la tarjeta de cada tienda en Ajustes). Solo dibuja: lo de adentro lo pone la pantalla.
 * Se asienta al llegar y su barra recibe un barrido de luz, una vez (`.tw-marco`, `app/estilos/tienda-web.css`).
 *
 * `ruta`: lo que va después del dominio («/catalogo», «/tiendas»), en taupe. `i`: el paso de la cascada de la pantalla.
 */
export function MarcoWeb({
  ruta = "",
  i = 0,
  etiqueta,
  pie,
  children,
  className = "",
  guia,
}: {
  ruta?: string;
  i?: number;
  /** Para el lector de pantalla: qué muestra la ventana («La vitrina como la ve el cliente»). */
  etiqueta: string;
  /** A la derecha de la barra (un enlace, una cifra). */
  pie?: ReactNode;
  children: ReactNode;
  className?: string;
  guia?: string;
}) {
  return (
    <figure aria-label={etiqueta} className={`tw-marco ${className}`} style={{ "--i": i } as CSSProperties} data-guia={guia}>
      <div className="tw-marco-barra">
        <span aria-hidden className="tw-marco-puntos">
          <i />
          <i />
          <i />
        </span>
        <span aria-hidden className="tw-marco-direccion">
          <Lock />
          <span>
            <b>{DOMINIO_TIENDA}</b>
            {ruta && <em>{ruta}</em>}
          </span>
        </span>
        {pie && <span className="ml-auto flex shrink-0 items-center gap-2">{pie}</span>}
      </div>
      <div className="tw-marco-cuerpo">{children}</div>
    </figure>
  );
}
