"use client";

import { useSearchParams } from "next/navigation";
import { hrefDelProbador, PARAMETRO_DEL_LOOK } from "@/lib/probador";
import { FiltroTienda } from "../FiltroTienda";

export type TiendaDelFiltro = { nombre: string; sede: string | null; actual: boolean };

/**
 * «Ver lo que hay en» del probador: la misma franja de las demás páginas, pero cada tienda lleva el look que se está armando (`?p=`,
 * que el probador va dejando en la dirección sin recargar). Cambiar de tienda cambia los precios y lo que hay, no el look.
 */
export function FiltroDelProbador({ tiendas }: { tiendas: readonly TiendaDelFiltro[] }) {
  const look = useSearchParams().get(PARAMETRO_DEL_LOOK);
  return <FiltroTienda opciones={tiendas.map((t) => ({ nombre: t.nombre, href: hrefDelProbador(t.sede, look), actual: t.actual }))} />;
}
