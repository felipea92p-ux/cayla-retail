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

   Dos formas, según la cabecera de la pantalla:
   · `enlace` (por defecto): la línea chica sobre el título, en las
     pantallas con `CabeceraPantalla` o con título propio.
   · `boton`: el botón secundario del `pie` de `EncabezadoPagina`
     (Ventas e Inventario), como «← Traslados» (ADR-0220).
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
  forma?: "enlace" | "boton";
  className?: string;
}) {
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
