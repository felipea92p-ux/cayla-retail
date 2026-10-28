import type { CSSProperties } from "react";
import { pctEs } from "@/lib/mix-piso-visual";
import { textoDelReparto, type RepartoDeGrupo } from "@/lib/plan-piso-familias";

// El detalle de un grupo del riel de «Hoy» (Felipe, 2026-10-12; ADR-0352, actualización 2026-10-12): de qué FAMILIAS de color es lo que cuelga de él. Reemplaza la lista de colores
// exactos que salía como `title` al pasar el mouse («Negro 60 · Blanco 45 …»), que el navegador tardaba en mostrar y no salía con el teclado ni con un toque.
//
// Aparece cuando un grupo está señalado —con el mouse, con Tab en su ficha o con un toque— y se ancla al tramo de ese grupo: nunca empuja la página (flota sobre la banda) ni
// recibe el mouse (`pointer-events: none`, para que no parpadee al cruzarlo). Aquí no se calcula nada: `lib/plan-piso-familias.ts` (con su prueba) trae las filas.
// El color de cada familia es el MISMO que el de la franja de la tienda; es dato de la prenda, no de la interfaz.

type Props = {
  id: string;
  nombre: string;
  reparto: RepartoDeGrupo;
  cuadrado: boolean;
  /** Dónde cae el centro del tramo, en px desde el borde izquierdo de la banda: el CSS acomoda la tarjeta para que no se salga. */
  centro: number;
  /** Se abre por debajo de la banda (si arriba no cabe en la ventana): flota sobre las fichas, que siguen recibiendo el clic porque la tarjeta no recibe el mouse. */
  abajo?: boolean;
};

export function DetalleDelGrupo({ id, nombre, reparto, cuadrado, centro, abajo = false }: Props) {
  return (
    <div id={id} className={`pp-det anim-revelar${abajo ? " pp-det-abajo" : ""}`} role="tooltip" style={{ ["--cx" as string]: `${centro}px` } as CSSProperties}>
      <h4 className="pp-det-t">{nombre}</h4>
      <p className="pp-det-s">{textoDelReparto(reparto, cuadrado)}</p>
      <ul className="pp-det-l">
        {reparto.filas.map((f) => (
          <li key={f.clave} className="pp-det-f">
            <span aria-hidden className="pp-col-m" data-color-dato={f.hex ? "" : undefined}>
              <i className={f.otras ? "pp-col-rayas" : undefined} style={f.otras ? undefined : { background: f.hex ?? "var(--pp-otros)" }} />
            </span>
            <span className="pp-det-n">{f.nombre}</span>
            <span aria-hidden className="pp-det-b">
              <i style={{ width: `${Math.max(f.pct, 2)}%` }} />
            </span>
            <span className="pp-det-p">{pctEs(f.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
