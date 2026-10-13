"use client";

import { Paginas } from "@/components/ui/Paginas";

/** Paginación de una lista que la pantalla ya tiene entera en memoria (ej. Existencias: las tarjetas, los filtros y el CSV necesitan
 *  todas las filas, pero la tabla solo pinta una página). Es `<Paginas>` con botones: cambiar de página no va a la base ni cambia la
 *  URL. Si hay una sola página no se dibuja nada. Desde la ronda 8 de /unificar (ADR-0358) la página actual es la píldora que se
 *  desliza; `grande` conserva los 36 px de Marcas. */
export function PaginacionLocal({
  pagina,
  totalPaginas,
  onPagina,
  grande = false,
}: {
  pagina: number;
  totalPaginas: number;
  onPagina: (pagina: number) => void;
  /** Objetivos de 36 px (Marcas, 2026-10-10): una lista que se recorre a menudo con el mouse. */
  grande?: boolean;
}) {
  return <Paginas pagina={pagina} totalPaginas={totalPaginas} onPagina={onPagina} grande={grande} />;
}
