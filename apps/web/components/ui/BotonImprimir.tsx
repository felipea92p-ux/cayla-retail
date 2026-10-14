import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import { Boton, BotonEnlace } from "./campos";

/* ====================================================================
   <BotonImprimir> — abrir el cuadro de impresión (ADR-0358, ronda 11 de /unificar: Felipe lo eligió tocándolo el 2026-10-14).

   Siempre con la impresora a la izquierda, y el texto es «Imprimir» + qué: «Imprimir ticket», «Imprimir etiquetas», «Imprimir la orden».
   Es NEGRO (`peso="primario"`) solo cuando imprimir es lo que toca hacer ahí (el ticket después de vender, las etiquetas de lo que
   acaba de llegar); en el resto, secundario. Que también sirve para guardar en PDF se dice en la frase de al lado (o en su `title`), no
   en el botón. Con `href` lleva a la pantalla que imprime (las etiquetas de precio); con `onClick`, abre el cuadro ahí mismo.
   Movimiento: el de todo botón y, propio de imprimir, la hoja SALE de la impresora (baja 2 px) al pasar el mouse (`app/globals.css`),
   como la flecha de descargar baja y la de ver avanza.
   ==================================================================== */
type Comun = {
  children: ReactNode;
  peso?: "fantasma" | "primario";
  /** En una fila apretada: `btn-chico`. */
  chico?: boolean;
  className?: string;
  title?: string;
  /** Ancla de la guía (ADR-0389). */
  guia?: string;
};

export function BotonImprimir(
  props: Comun &
    (
      | { href: string; /** La pantalla que imprime se abre en otra pestaña (Producto creado). */ nuevaPestana?: boolean; onClick?: never; cargando?: never; disabled?: never; autoFocus?: never }
      | { onClick: () => void; href?: never; nuevaPestana?: never; cargando?: boolean; disabled?: boolean; autoFocus?: boolean }
    ),
) {
  const { children, peso = "fantasma", chico = false, className = "", title, guia } = props;
  const clase = `${chico ? "btn-chico" : ""} ${className}`;
  // En una caja `flex` (de bloque): una `inline-flex` armaba su propia línea de texto dentro de <Boton> y el botón crecía (ronda 10).
  const contenido = (
    <span className="flex items-center justify-center gap-2">
      <Printer aria-hidden className="-my-1 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </span>
  );
  if (props.href !== undefined) {
    return (
      <BotonEnlace
        href={props.href}
        peso={peso}
        className={clase}
        title={title}
        data-guia={guia}
        {...(props.nuevaPestana ? { target: "_blank", rel: "noopener" } : {})}
      >
        {contenido}
      </BotonEnlace>
    );
  }
  return (
    <Boton
      type="button"
      onClick={props.onClick}
      cargando={props.cargando}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      peso={peso}
      className={clase}
      title={title}
      data-guia={guia}
    >
      {contenido}
    </Boton>
  );
}
