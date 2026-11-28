"use client";

import type { MouseEvent, ReactNode } from "react";
import type { VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { ColumnaViva } from "@/components/ui/TablaViva";
import { FotoPrenda } from "@/components/apartados/piezas";
import { CanalChip } from "@/components/apartados/CanalChip";
import { listaDicha } from "@/lib/lista-dicha";
import { nombreDeCanal, type CanalVenta } from "@/lib/canales-venta-reglas";
import type { Apartado } from "@/lib/separaciones-reglas";

// Las piezas de las dos listas de Apartados (ADR-0720): «Pendientes» e «Historial» nombran cada apartado igual, marcan su canal igual y
// sus botones de fila hacen solo lo suyo.

/**
 * El botón de una fila hace lo suyo y nada más: su clic no sube a la fila, que abriría el cobro o el detalle además de lo pedido (en la
 * tabla viva, todo clic de una fila la abre). El evento es opcional para servir también a una pieza que declara `onClick: () => void`
 * (`<BotonImprimir>`), que igual lo recibe.
 */
export const soloElBoton = (hacer: () => void) => (e?: MouseEvent) => {
  e?.stopPropagation();
  hacer();
};

/**
 * La celda que nombra un apartado: la prenda que se ve, el nombre con el código del apartado al lado (el que trae el cliente en su
 * constancia) y, debajo, qué se apartó. El nombre es el botón de la fila para el teclado y el lector (`etiqueta` dice qué abre); con el
 * mouse, toda la fila. `debajo` es lo que la tabla trae de las columnas que se fueron, en un ancho angosto.
 */
export function ApartadoEnFila({ a, porVariante, debajo, etiqueta }: { a: Apartado; porVariante: ReadonlyMap<string, VarianteBusqueda>; debajo: ReactNode; etiqueta: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex shrink-0">
        {a.prendas.slice(0, 2).map((pr, j) => {
          const v = porVariante.get(pr.varianteId);
          return <FotoPrenda key={pr.itemId || `${pr.varianteId}-${j}`} fotoUrl={v?.fotoUrl} referencia={pr.referencia} colorHex={v?.colorHex} categoria={v?.categoria} categoriaPrefijo={v?.categoriaPrefijo} categoriaFamilia={v?.categoriaFamilia} ancho={40} className={`w-10 border border-papel ${j ? "-ml-4" : ""}`} />;
        })}
      </span>
      <span className="block min-w-0">
        <button type="button" className="area-dedo block max-w-full text-left font-medium text-tinta" aria-label={etiqueta}>
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            <span className="truncate">{a.nombres} {a.apellidos}</span>
            <span className="whitespace-nowrap font-mono text-sm font-normal text-tenue">{a.codigo}</span>
          </span>
        </button>
        <span className="tv-sub truncate">{listaDicha(a.prendas.map((pr) => pr.referencia))}</span>
        {debajo}
      </span>
    </span>
  );
}

/**
 * La columna «Canal» (ADR-0607): solo cuando la cuenta vende por más que la tienda, y se filtra desde su cabecera (antes, la píldora
 * «Canal» del Historial). Lo de la tienda se dice en palabras; lo de un canal online lleva su marca, con cómo se entrega. Cuando la
 * columna se va, la marca baja bajo el nombre (lo de la tienda, nada: es lo de siempre).
 */
export function columnaCanal<F>(canales: readonly CanalVenta[], apartadoDe: (fila: F) => Apartado): ColumnaViva<F> {
  return {
    clave: "canal",
    titulo: "Canal",
    tipo: "opcion",
    valor: (f) => nombreDeCanal(canales, apartadoDe(f).canal),
    filtra: true,
    ancho: "10rem",
    seVa: 960,
    celda: (f) => {
      const a = apartadoDe(f);
      return a.canal === "tienda" ? <span className="text-sm text-secundario">{nombreDeCanal(canales, a.canal)}</span> : <CanalChip a={a} />;
    },
    resumen: (f) => <CanalChip a={apartadoDe(f)} />,
  };
}
