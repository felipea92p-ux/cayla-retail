import Image from "next/image";
import Link from "next/link";

/* ====================================================================
   ComprobantesListaVacia · cuando la lista de /compras no tiene filas
   (2026-09-19, ADR-0130)

   Tres motivos distintos y cada uno dice lo suyo: no hay ningún comprobante todavía (lleva a
   registrar el primero), la búsqueda no encontró nada (nombra lo buscado), o los filtros/la vista
   dejan la lista en cero (ofrece limpiarlos, que en Comprobantes es volver a `/compras`).

   El isotipo de CAYLA flota UNA vez al aparecer (`cmp-flota`: sube, se asienta y queda quieto): da vida a
   un estado que de otro modo sería un párrafo gris, sin quedarse moviéndose. Sin movimiento
   reducido no se anima. Es de servidor: no necesita estado.
   ==================================================================== */
export function ComprobantesListaVacia({ hayFiltros, busqueda }: { hayFiltros: boolean; busqueda: string }) {
  const mensaje = busqueda ? `Nada coincide con «${busqueda}».` : hayFiltros ? "Ningún comprobante coincide con esos filtros." : "Todavía no hay comprobantes registrados.";
  return (
    <div className="card-cayla anim-entra flex flex-col items-center px-5 pb-12 pt-11 text-center" style={{ ["--i" as string]: 7 }}>
      <Image src="/cayla-isotipo.png" alt="" width={44} height={44} className="cmp-flota h-11 w-auto" />
      <p className="mt-3 text-sm text-tinta/75">{mensaje}</p>
      {hayFiltros ? (
        <Link href="/compras" className="label-cayla mt-4 rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
          Limpiar filtros
        </Link>
      ) : (
        <Link href="/compras/nueva" className="mt-3 text-sm text-rojo hover:underline">
          Registrar el primero →
        </Link>
      )}
    </div>
  );
}
