import Link from "next/link";

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
   Por eso es un enlace fijo a la pantalla de arriba y no un
   `history.back()`, que con la pestaña recién abierta no lleva a ninguna
   parte.

   Tres formas, según la cabecera de la pantalla:
   · `enlace` (por defecto): la línea chica sobre el título, en las
     pantallas con `CabeceraPantalla` o con título propio.
   · `flecha`: un botón redondo solo con la flecha, a la izquierda de la
     línea «sede · fecha» de `EncabezadoPagina` (su prop `volver`). Desde
     el 2026-10-06 (Felipe, ADR-0220 act.) es la vuelta de TODAS las
     pantallas con esa cabecera: antes era un botón «← Traslados» en una
     fila propia bajo la frase, que gastaba una fila entera. ADÓNDE vuelve
     lo siguen diciendo su `aria-label` y su `title` («Volver a Traslados»).
   · `boton`: el botón secundario con texto («← Clientes»), para quien
     arma su propia cabecera (el cartel del club).
   ==================================================================== */
export function Volver({
  href,
  a,
  forma = "enlace",
  className = "",
}: {
  href: string;
  /** El nombre de la pantalla a la que vuelve, tal como lo dice el menú («Facturas de proveedor»). */
  a: string;
  forma?: "enlace" | "flecha" | "boton";
  className?: string;
}) {
  if (forma === "flecha") {
    return (
      <Link
        href={href}
        aria-label={`Volver a ${a}`}
        title={`Volver a ${a}`}
        className={`group grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-sand bg-papel text-tinta transition-colors hover:border-tinta/40 ${className}`}
      >
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
      </Link>
    );
  }
  if (forma === "boton") {
    return (
      <Link href={href} className={`btn-cayla btn-secundario ${className}`}>
        <span aria-hidden>←</span> {a}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={`label-cayla inline-flex items-center gap-1.5 text-[11px] text-tinta/65 transition-[color,transform] duration-300 hover:-translate-x-0.5 hover:text-rojo ${className}`}
    >
      <span aria-hidden>←</span> {a}
    </Link>
  );
}
