import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/* ====================================================================
   EnlaceVer · el enlace suelto que lleva a ver más (ADR-0358, ronda 8: Felipe lo eligió tocándolo el 2026-10-13, la P2).

   Junto a un resumen («3 facturas vencen esta semana»), lo que lleva a verlas: «PAGAR VENCIDO →», «VER LAS 9 →». VERSALITAS de 11 px en
   ROJO con la flecha de lucide, que avanza 3 px al pasar el mouse (5 al presionar). Es también la acción de un título de bloque
   (`<TituloSeccion accion>`). No es un botón que guarda nada: lleva (`href`) o abre algo de la misma pantalla (`onClick`).

   Gasta el rojo, que es el acento de la pantalla (ADR-0169): una pantalla no debería llevar más de dos. Lo que guarda sigue siendo un
   botón (`<Boton>`), y un enlace dentro de una frase es `btn-enlace`. Estilos: `app/estilos/enlaces-paginas-caras.css`.
   ==================================================================== */

type Comun = { children: ReactNode; className?: string; /** Ancla de la guía (ADR-0389). */ guia?: string };

export function EnlaceVer(
  props: Comun &
    (
      | {
          href: string;
          /** Lo que pasa además de navegar (cerrar la hoja desde donde se fue: Actividad). */
          alNavegar?: () => void;
          onClick?: never;
          target?: string;
        }
      | { onClick: () => void; href?: never; disabled?: boolean }
    )
) {
  const contenido = (
    <>
      <span>{props.children}</span>
      <ArrowRight aria-hidden />
    </>
  );
  const clase = `enlace-ver ${props.className ?? ""}`;
  if ("href" in props && props.href !== undefined) {
    return (
      <Link href={props.href} target={props.target} onClick={props.alNavegar} data-guia={props.guia} className={clase}>
        {contenido}
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} disabled={"disabled" in props ? props.disabled : undefined} data-guia={props.guia} className={clase}>
      {contenido}
    </button>
  );
}
