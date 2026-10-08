import { FunnelX, Receipt, SearchX } from "lucide-react";
import { BotonEnlace } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";

/* ====================================================================
   ComprobantesListaVacia · cuando la lista de /compras no tiene filas
   (2026-09-19, ADR-0136; con la pieza única <Vacio> desde el 2026-10-08, ADR-0358 ronda 5)

   Tres motivos distintos y cada uno dice lo suyo: no hay ningún comprobante todavía (lleva a
   registrar el primero), la búsqueda no encontró nada (nombra lo buscado), o los filtros/la vista
   dejan la lista en cero (ofrece limpiarlos, que en Comprobantes es volver a `/compras`).
   El colibrí que flotaba dio paso al ícono de lo que falta que se dibuja (Felipe 2026-10-08).
   Es de servidor: no necesita estado.
   ==================================================================== */
export function ComprobantesListaVacia({ hayFiltros, busqueda }: { hayFiltros: boolean; busqueda: string }) {
  const limpiar = (
    <BotonEnlace href="/compras" peso="fantasma">
      Limpiar filtros
    </BotonEnlace>
  );
  return (
    <div className="card-cayla anim-entra" style={{ ["--i" as string]: 7 }}>
      {busqueda ? (
        <Vacio icono={<SearchX />} titulo={`Nada coincide con «${busqueda}»`} acciones={limpiar}>
          Se busca por el nombre del proveedor o por el número del documento (F001-…).
        </Vacio>
      ) : hayFiltros ? (
        <Vacio icono={<FunnelX />} titulo="Ningún comprobante con esos filtros" acciones={limpiar}>
          Quita un filtro o límpialos todos para ver la lista completa.
        </Vacio>
      ) : (
        <Vacio
          icono={<Receipt />}
          titulo="Todavía no hay comprobantes"
          acciones={
            <BotonEnlace href="/compras/nueva" peso="primario">
              Registrar el primero
            </BotonEnlace>
          }
        >
          Cuando registres la primera factura de un proveedor aparecerá aquí, con su saldo y la fecha en que vence.
        </Vacio>
      )}
    </div>
  );
}
