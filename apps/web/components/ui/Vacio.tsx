import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/* ====================================================================
   Vacio · lo que se ve cuando una lista no tiene nada (ADR-0358, ronda 5 de /unificar; Felipe 2026-10-08)

   Felipe eligió tocándola en la página de elegir (docs/unificar/vacio.md): había 9 formas en ~100 lugares y casi ninguna decía
   qué hacer (ley 9 de Formidable). Desde hoy un vacío es ESTA pieza, en dos tamaños:

   · grande (una pantalla o una tarjeta): círculo hueso con el ícono de LO QUE FALTA (un recibo, una prenda, un traslado), título en
     serif que dice qué pasa, una frase que dice qué hacer, y el botón que lo hace. Según el motivo:
       – no hay nada todavía → el ícono de la cosa, y la acción que la crea («Registrar factura»);
       – la búsqueda no encontró → `<SearchX />`, el título nombra lo buscado, «Borrar la búsqueda»;
       – los filtros dejan cero → `<FunnelX />`, `filtros` como píldoras que se quitan con un toque, «Limpiar filtros».
   · chico (dentro de una tabla, una hoja o una lista desplegable): una línea con el ícono, la frase y, si hay algo que hacer, un
     enlace al lado.

   Movimiento (ADR-0136, sin rebote ni bucle): entra en cascada como un modal (círculo → título → frase → botones, 55 ms); el trazo
   del ícono se DIBUJA una vez y un anillo suave sale del círculo y se apaga; las píldoras se encogen al tocarlas. Con «reducir
   movimiento» aparece quieto. CSS: app/estilos/vacio-aviso-buscador.css.

   No tiene estado: sirve igual desde un Server Component (con `href`) que desde uno cliente (con `onClick`).
   ==================================================================== */

export type FiltroVacio = { texto: string; href?: string; onQuitar?: () => void };
export type AccionVacio = { texto: string; href?: string; onClick?: () => void };

type Props = {
  /** El ícono de lucide de lo que falta (`<Receipt />`), o `<SearchX />` / `<FunnelX />` según el motivo. */
  icono: ReactNode;
  /** Grande: qué pasa («Nada coincide con «Zara»»). Chico: no se usa (la frase es `children`). */
  titulo?: ReactNode;
  /** La frase: qué hacer, con el dato que ayuda en `<b>`. */
  children?: ReactNode;
  /** Grande: los botones (`<Boton>`, `<BotonEnlace>`). */
  acciones?: ReactNode;
  /** Grande: los filtros puestos, cada uno se quita con un toque. */
  filtros?: FiltroVacio[];
  /** Chico: el enlace de al lado («Ver septiembre», «Crear «Zar»»). */
  accion?: AccionVacio;
  tamano?: "grande" | "chico";
  /** Chico: en una lista desplegable va a la izquierda; en una tabla o una hoja, centrado. */
  alinear?: "centro" | "izquierda";
  className?: string;
};

export function Vacio({ icono, titulo, children, acciones, filtros, accion, tamano = "grande", alinear = "centro", className = "" }: Props) {
  if (tamano === "chico") {
    return (
      <div role="status" className={`vacio-chico ${alinear === "izquierda" ? "a-la-izquierda" : ""} ${className}`}>
        <span className="vacio-ic trazo-dibuja" aria-hidden>
          {icono}
        </span>
        <span className="vacio-txt">{children ?? titulo}</span>
        {accion ? <AccionChica {...accion} /> : null}
      </div>
    );
  }
  let i = 0;
  return (
    <div role="status" className={`vacio ${className}`}>
      <span className="vacio-ic trazo-dibuja" aria-hidden style={{ ["--i" as string]: i++ }}>
        {icono}
      </span>
      {titulo ? (
        <h2 className="vacio-tit" style={{ ["--i" as string]: i++ }}>
          {titulo}
        </h2>
      ) : null}
      {children ? (
        <p className="vacio-frase" style={{ ["--i" as string]: i++ }}>
          {children}
        </p>
      ) : null}
      {filtros?.length ? (
        <div className="vacio-chips" style={{ ["--i" as string]: i++ }}>
          {filtros.map((f) =>
            f.href ? (
              <Link key={f.texto} href={f.href} className="vacio-filtro" aria-label={`Quitar el filtro «${f.texto}»`}>
                {f.texto}
                <X aria-hidden />
              </Link>
            ) : (
              <button key={f.texto} type="button" onClick={f.onQuitar} className="vacio-filtro" aria-label={`Quitar el filtro «${f.texto}»`}>
                {f.texto}
                <X aria-hidden />
              </button>
            ),
          )}
        </div>
      ) : null}
      {acciones ? (
        <div className="vacio-acciones" style={{ ["--i" as string]: i++ }}>
          {acciones}
        </div>
      ) : null}
    </div>
  );
}

function AccionChica({ texto, href, onClick }: AccionVacio) {
  if (href)
    return (
      <Link href={href} className="vacio-chico-accion">
        {texto}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className="vacio-chico-accion">
      {texto}
    </button>
  );
}
