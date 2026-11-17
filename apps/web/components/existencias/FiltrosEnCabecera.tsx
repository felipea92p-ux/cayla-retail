"use client";

import { BotonFiltros } from "@/components/ui/FiltrosPildora";
import { pedirFiltros, useLoQueSabeElPanel } from "@/components/existencias/cabecera-existencias";

/* ====================================================================
   «Filtros» en la cabecera de Existencias, solo en el celular (Felipe 2026-11-17: «los filtros ponerlo al lado de resumen»)

   Bajo 640 px el botón sale de la barra del buscador y va a la fila de íconos de la cabecera, junto a «Ajustar stock» y «Resumen»: el
   buscador gana su lugar («Prenda, marca o código…» se cortaba en «códig») y lo que abre una hoja queda todo en una fila. Es el MISMO
   botón del sistema (`BotonFiltros`, ADR-0358), con su punto si hay filtros puestos. No abre nada por su cuenta: pide, y la barra de
   filtros —dueña de la hoja y de lo elegido— la abre (`cabecera-existencias.ts`). Desde 640 px no se dibuja: el botón sigue en la barra.

   Las anclas de la guía son las de siempre (`existencias.filtros`, `existencias.filtros-abrir`): la guía toma la que se ve.
   ==================================================================== */
export function FiltrosEnCabecera() {
  const panel = useLoQueSabeElPanel();
  return (
    // De 44 px, como sus vecinos de la fila (el círculo de la píldora mide 38 junto a un buscador; con el mouse, aquí quedaba más chico
    // que «Resumen» y que «Avisos»). Solo la medida: la cara sigue siendo la de la pieza.
    <span data-guia="existencias.filtros" className="flex shrink-0 sm:hidden [&>.pildora-filtro]:h-11 [&>.pildora-filtro]:w-11">
      {/* `abierto` nunca: la hoja tapa la pantalla entera mientras está abierta, y al cerrarse el botón vuelve a su reposo. */}
      <BotonFiltros soloIcono abierto={false} activos={panel?.filtrosPuestos ?? 0} onClick={pedirFiltros} data-guia="existencias.filtros-abrir" />
    </span>
  );
}
