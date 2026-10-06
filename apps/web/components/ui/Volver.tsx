import Link from "next/link";

/* ====================================================================
   Volver · la vuelta de una pantalla interna a la pantalla de su menú
   (2026-09-26, Felipe: «que toda vista dentro de un submódulo tenga cómo
   regresar»)

   Una pantalla interna es la que no está en el lateral: se llega a ella
   desde otra (Registrar factura desde Facturas de proveedor, el historial
   de cierres desde Caja). Sin esta vuelta, la única salida es el botón
   «atrás» del navegador, que en la tablet de la tienda nadie encuentra.

   Dice ADÓNDE vuelve («Volver a Facturas de proveedor»), nunca un «Volver»
   a secas: quien llegó por un enlace de WhatsApp no sabe qué había
   «antes». Por eso, con `href`, es un enlace fijo a la pantalla de arriba
   y no un `history.back()`, que con la pestaña recién abierta no lleva a
   ninguna parte.

   UNA sola cara en todo el ERP (ADR-0357, Felipe 2026-10-07, eligiéndola
   mirando; registro en docs/unificar/accion.volver.md): el botón redondo
   solo con la flecha que nació el 2026-10-06 junto a la línea «sede ·
   fecha» de EncabezadoPagina (ADR-0220 act.). ADÓNDE vuelve lo dicen su
   `aria-label` y su `title` («Volver a Traslados»). El LUGAR lo pone cada
   cabecera: en EncabezadoPagina, su prop `volver`; en las demás, donde ya
   estaba la vuelta. Antes convivían tres caras (la línea de 11 px en
   versalitas, el botón «← Clientes» y esta flecha).
   · Con el dedo (pointer: coarse) la zona que responde llega a 44 px con
     un ::after invisible, sin que el círculo crezca.
   · Lleva `data-pieza="volver"`: así la encuentran las fotos de /unificar sin confundirla con otra × que diga «Volver».
   · Con `onClick` (sin `href`) es un <button>: la vuelta que cierra un
     estado de la misma pantalla (el flujo de Cambios y Devoluciones, la
     lista de Temporadas). Con `href` sigue siendo <a>, porque
     `useSalidaSinGuardar` solo intercepta los enlaces.
   ==================================================================== */

const CLASES =
  "group relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-sand bg-papel text-tinta transition-colors hover:border-tinta/40 disabled:cursor-not-allowed disabled:opacity-50 after:absolute after:inset-0 after:rounded-full after:content-[''] pointer-coarse:after:-inset-[5px]";

type Props = {
  /** El nombre de la pantalla a la que vuelve, tal como lo dice el menú («Facturas de proveedor»). */
  a: string;
  className?: string;
} & ({ href: string; onClick?: never; deshabilitado?: never } | { onClick: () => void; href?: never; deshabilitado?: boolean });

function Flecha() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-4 w-4 transition-transform duration-200 ease-cayla group-hover:-translate-x-0.5 motion-reduce:transition-none"
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function Volver(props: Props) {
  const { a, className = "" } = props;
  // Si el texto ya dice «Volver a Cambios» (la salida del flujo), no se le antepone otro «Volver a».
  const nombre = /^volver\b/i.test(a.trim()) ? a : `Volver a ${a}`;
  if (props.href !== undefined) {
    return (
      <Link href={props.href} aria-label={nombre} title={nombre} data-pieza="volver" className={`${CLASES} ${className}`}>
        <Flecha />
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} disabled={props.deshabilitado} aria-label={nombre} title={nombre} data-pieza="volver" className={`${CLASES} ${className}`}>
      <Flecha />
    </button>
  );
}
