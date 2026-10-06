import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/* ====================================================================
   Volver · la vuelta de una pantalla interna a la pantalla de su menú
   (2026-09-26, Felipe: «que toda vista dentro de un submódulo tenga cómo
   regresar»)

   Una pantalla interna es la que no está en el lateral: se llega a ella
   desde otra (Registrar factura desde Facturas de proveedor, el historial
   de cierres desde Caja). Sin esta vuelta, la única salida es el botón
   «atrás» del navegador, que en la tablet de la tienda nadie encuentra.

   Dice ADÓNDE vuelve («← Facturas de proveedor»), nunca un «Volver» a
   secas: quien llegó por un enlace de WhatsApp no sabe qué había «antes».
   Por eso, con `href`, es un enlace fijo a la pantalla de arriba y no un
   `history.back()`, que con la pestaña recién abierta no lleva a ninguna
   parte.

   UNA sola cara en todo el ERP (ADR-0354, decisión de Felipe del
   2026-10-06; registro en docs/unificar/accion.volver.md): el botón
   secundario del sistema con la flecha delante y el destino escrito. Antes
   había dos formas según la cabecera (el botón en el pie de
   EncabezadoPagina y una línea de 11 px en versalitas en las demás); la
   línea medía 16 px de alto, bajo los 24 de ADR-0350, y en Registrar
   factura era idéntica al sobretítulo «COMPRAS» de abajo. El LUGAR sigue
   siendo el de cada cabecera (en EncabezadoPagina, en el pie, ADR-0220).
   · La flecha es el dibujo de lucide y no el glifo «←»: el subconjunto de
     DM Sans que sirve el ERP no trae U+2190, así que el glifo lo dibujaba
     la fuente del aparato y cambiaba de grosor entre la Mac y la tablet.
   · «Volver a » va para el lector de pantalla: el nombre accesible es
     «Volver a Existencias» y contiene el texto visible (WCAG 2.5.3).
   · Con el dedo (pointer: coarse) la zona que responde llega a 44 px con
     un ::after invisible, sin que el botón crezca ni la cabecera cambie.
   · Con `onClick` (sin `href`) es un <button>: la vuelta que cierra un
     estado de la misma pantalla (el flujo de Cambios y Devoluciones, la
     lista de Temporadas). Con `href` sigue siendo <a>, porque
     `useSalidaSinGuardar` solo intercepta los enlaces.
   ==================================================================== */

const CLASES =
  "btn-cayla btn-secundario relative after:absolute after:-inset-px after:rounded-md after:content-[''] pointer-coarse:after:-inset-y-1.5";

type Props = {
  /** El nombre de la pantalla a la que vuelve, tal como lo dice el menú («Facturas de proveedor»). */
  a: string;
  className?: string;
} & ({ href: string; onClick?: never; deshabilitado?: never } | { onClick: () => void; href?: never; deshabilitado?: boolean });

function Contenido({ a }: { a: string }) {
  // Si el texto ya dice «Volver a Cambios» (la salida del flujo), el lector no necesita oírlo dos veces.
  const yaDiceVolver = /^volver\b/i.test(a.trim());
  return (
    <>
      <ArrowLeft aria-hidden className="h-4 w-4 shrink-0" />
      {!yaDiceVolver && <span className="sr-only">Volver a </span>}
      {a}
    </>
  );
}

export function Volver(props: Props) {
  const { a, className = "" } = props;
  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={`${CLASES} ${className}`}>
        <Contenido a={a} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} disabled={props.deshabilitado} className={`${CLASES} ${className}`}>
      <Contenido a={a} />
    </button>
  );
}
