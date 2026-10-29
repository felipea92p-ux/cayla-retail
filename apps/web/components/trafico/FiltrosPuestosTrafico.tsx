"use client";

import { useRouter } from "next/navigation";
import { MapPin, Route } from "lucide-react";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";

/**
 * Los filtros puestos de Tráfico (el camino y la ciudad), con su ✕ que los quita por la dirección. Con los dos puestos, «Limpiar filtros».
 * Sin ninguno, la pista de cómo filtrar: las filas de «De dónde vienen» son los filtros.
 */
export function FiltrosPuestosTrafico({
  camino,
  ciudad,
  limpiar,
}: {
  camino: { nombre: string; sinEl: string } | null;
  ciudad: { nombre: string; sinEl: string } | null;
  limpiar: string;
}) {
  const router = useRouter();
  if (!camino && !ciudad) return <p className="text-[12.5px] text-tinta/70">Toca un camino o una ciudad para ver solo a esa gente.</p>;
  return (
    <div role="group" aria-label="Filtros puestos" className="flex flex-wrap items-center gap-2" data-guia="trafico.filtros">
      {camino && (
        <FiltroPuesto onQuitar={() => router.push(camino.sinEl, { scroll: false })} etiqueta={`Quitar el filtro ${camino.nombre}`}>
          <Route aria-hidden />
          {camino.nombre}
        </FiltroPuesto>
      )}
      {ciudad && (
        <FiltroPuesto onQuitar={() => router.push(ciudad.sinEl, { scroll: false })} etiqueta={`Quitar el filtro ${ciudad.nombre}`}>
          <MapPin aria-hidden />
          {ciudad.nombre}
        </FiltroPuesto>
      )}
      {camino && ciudad && <BotonLimpiar href={limpiar}>Limpiar filtros</BotonLimpiar>}
    </div>
  );
}
